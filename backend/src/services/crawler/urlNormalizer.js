import { URL } from 'url';
import net from 'net';
import CRAWLER_CONFIG from './crawlerConfig.js';

/**
 * Checks whether an IPv4 address is in private, link-local, or loopback ranges
 */
const isPrivateIPv4 = (ip) => {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP, reject
  }
  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;
  // 10.0.0.0/8 (Private)
  if (parts[0] === 10) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (Link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0/8
  if (parts[0] === 0) return true;
  return false;
};

/**
 * Checks whether an IPv6 address is private/loopback
 */
const isPrivateIPv6 = (ip) => {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd00:')) {
    return true;
  }
  return false;
};

/**
 * SSRF Protection Validator
 * Verifies that the URL does not target localhost, private IPs, or internal hostnames
 *
 * @param {string} urlStr
 * @returns {{ isSafe: boolean, reason?: string, parsedUrl?: URL }}
 */
export const isSSRFSafe = (urlStr) => {
  if (!urlStr || typeof urlStr !== 'string') {
    return { isSafe: false, reason: 'Empty or invalid URL string' };
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    return { isSafe: false, reason: `Malformed URL: ${err.message}` };
  }

  // 1. Enforce allowed protocols
  if (!CRAWLER_CONFIG.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return { isSafe: false, reason: `Disallowed protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject obvious loopbacks and internal names
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid')
  ) {
    return { isSafe: false, reason: `SSRF Blocked: Prohibited internal or loopback host "${hostname}"` };
  }

  // 3. Inspect if hostname is an IP address
  const ipType = net.isIP(hostname);
  if (ipType === 4) {
    if (isPrivateIPv4(hostname)) {
      return { isSafe: false, reason: `SSRF Blocked: Private IPv4 address "${hostname}"` };
    }
  } else if (ipType === 6) {
    if (isPrivateIPv6(hostname)) {
      return { isSafe: false, reason: `SSRF Blocked: Private IPv6 address "${hostname}"` };
    }
  }

  return { isSafe: true, parsedUrl: parsed };
};

/**
 * Normalizes URL and resolves relative paths against a baseUrl
 *
 * @param {string} rawUrl - Relative or absolute URL
 * @param {string} [baseUrl] - Base URL context
 * @returns {string|null} Normalized URL string or null if invalid
 */
export const normalizeUrl = (rawUrl, baseUrl = null) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return null;
    }

    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);

    // Strip hash fragment
    resolved.hash = '';

    // Standardize protocol and hostname to lowercase
    resolved.protocol = resolved.protocol.toLowerCase();
    resolved.hostname = resolved.hostname.toLowerCase();

    // Remove default ports (80 for http, 443 for https)
    if ((resolved.protocol === 'http:' && resolved.port === '80') || (resolved.protocol === 'https:' && resolved.port === '443')) {
      resolved.port = '';
    }

    // Clean duplicate slashes in pathname, preserving leading slash
    resolved.pathname = resolved.pathname.replace(/\/+/g, '/');

    return resolved.toString();
  } catch (err) {
    return null;
  }
};

/**
 * Checks if URL hostname matches one of the allowed domains (or their subdomains)
 *
 * @param {string} urlStr
 * @param {string[]} allowedDomains
 * @returns {boolean}
 */
export const isAllowedDomain = (urlStr, allowedDomains = ['nitkkr.ac.in']) => {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    return allowedDomains.some((d) => {
      const dom = d.toLowerCase().trim();
      return host === dom || host.endsWith(`.${dom}`);
    });
  } catch (e) {
    return false;
  }
};

/**
 * Checks if a pathname represents a pagination subpath of a base prefix
 * e.g. /category/notifications/page/2/ under /category/notifications/
 *
 * @param {string} pathname
 * @param {string} basePrefix
 * @returns {boolean}
 */
const matchesPrefixWithPagination = (pathname, basePrefix) => {
  if (pathname.startsWith(basePrefix)) return true;

  // Handle pagination regex: basePrefix + "page/\\d+/?"
  const cleanPrefix = basePrefix.endsWith('/') ? basePrefix.slice(0, -1) : basePrefix;
  const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paginationRegex = new RegExp(`^${escaped}/page/\\d+/?$`, 'i');

  return paginationRegex.test(pathname);
};

/**
 * Checks if URL pathname starts with any of the allowed path prefixes
 * Supports pagination subpaths (e.g. /page/2/, /page/3/) under allowed prefixes
 *
 * @param {string} urlStr
 * @param {string[]} allowedPrefixes
 * @returns {boolean}
 */
export const isAllowedPathPrefix = (urlStr, allowedPrefixes = []) => {
  if (!allowedPrefixes || allowedPrefixes.length === 0) return true;

  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname;

    return allowedPrefixes.some((prefix) => matchesPrefixWithPagination(path, prefix));
  } catch (e) {
    return false;
  }
};

/**
 * Checks if a PDF destination URL is allowed to be downloaded
 * (e.g. /wp-content/uploads/ or matching an approved path prefix)
 *
 * @param {string} urlStr
 * @param {string[]} allowedPrefixes
 * @param {string} [allowedPdfPrefix]
 * @returns {boolean}
 */
export const isAllowedPdfDestination = (urlStr, allowedPrefixes = [], allowedPdfPrefix = '/wp-content/uploads/') => {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname;

    if (allowedPdfPrefix && path.startsWith(allowedPdfPrefix)) {
      return true;
    }

    return allowedPrefixes.some((prefix) => path.startsWith(prefix));
  } catch (e) {
    return false;
  }
};

export default {
  isSSRFSafe,
  normalizeUrl,
  isAllowedDomain,
  isAllowedPathPrefix,
  isAllowedPdfDestination,
};
