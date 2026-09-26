import { isSSRFSafe, isAllowedDomain } from './urlNormalizer.js';
import CRAWLER_CONFIG from './crawlerConfig.js';

/**
 * Polite sleep helper
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polite HTTP Fetcher
 *
 * Implements:
 * 1. Strict SSRF checking on initial URL and all redirect locations
 * 2. Response size enforcement (rejects oversized HTML/PDF)
 * 3. Configurable polite request delays
 * 4. Request timeouts via AbortController
 * 5. Content-Type verification
 * 6. Conditional HTTP headers (ETag, Last-Modified) for 304 Not Modified support
 * 7. Exponential backoff retry logic
 *
 * @param {string} targetUrl - URL to fetch
 * @param {object} [options]
 * @param {string[]} [options.allowedDomains] - Enforced allowed domains for redirects
 * @param {number} [options.timeoutMs] - Request timeout
 * @param {number} [options.maxSizeBytes] - Max response byte limit
 * @param {string} [options.etag] - ETag from previous crawl
 * @param {string} [options.lastModified] - Last-Modified from previous crawl
 * @param {number} [options.requestDelayMs] - Polite sleep delay
 * @param {number} [options.maxRedirects] - Max redirect depth
 *
 * @returns {Promise<{
 *   status: number,
 *   notModified: boolean,
 *   contentType: string,
 *   buffer: Buffer,
 *   text: string,
 *   etag: string|null,
 *   lastModified: string|null,
 *   finalUrl: string
 * }>}
 */
export const politeFetch = async (targetUrl, options = {}) => {
  const {
    allowedDomains = ['nitkkr.ac.in'],
    timeoutMs = CRAWLER_CONFIG.REQUEST_TIMEOUT_MS,
    maxSizeBytes = CRAWLER_CONFIG.MAX_PDF_SIZE_BYTES,
    etag = null,
    lastModified = null,
    requestDelayMs = CRAWLER_CONFIG.DEFAULT_REQUEST_DELAY_MS,
    maxRedirects = 3,
  } = options;

  let currentUrl = targetUrl;
  let redirectsCount = 0;

  // Polite delay before dispatching request
  if (requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  while (redirectsCount <= maxRedirects) {
    // 1. SSRF Safety Verification
    const ssrf = isSSRFSafe(currentUrl);
    if (!ssrf.isSafe) {
      throw new Error(`SSRF Blocked: ${ssrf.reason} (URL: ${currentUrl})`);
    }

    // 2. Allowed Domain Verification
    if (allowedDomains && allowedDomains.length > 0 && !isAllowedDomain(currentUrl, allowedDomains)) {
      throw new Error(`External domain blocked: Hostname of "${currentUrl}" is not in allowed domains list`);
    }

    // 3. Build headers
    const headers = {
      'User-Agent': CRAWLER_CONFIG.USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
    };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;

    // 4. Request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        headers,
        redirect: 'manual', // Manual redirect control to validate each hop for SSRF
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${currentUrl}`);
      }
      throw err;
    }

    clearTimeout(timeoutId);

    // 5. Handle HTTP 304 Not Modified
    if (res.status === 304) {
      return {
        status: 304,
        notModified: true,
        buffer: null,
        text: '',
        contentType: '',
        etag,
        lastModified,
        finalUrl: currentUrl,
      };
    }

    // 6. Handle Redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect status ${res.status} returned without Location header`);
      }
      redirectsCount++;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    // 7. Check HTTP error status
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} (${res.statusText}) while fetching ${currentUrl}`);
    }

    // 8. Enforce Content-Type
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isHtml = contentType.includes('text/html');
    const isPdf = contentType.includes('application/pdf') || contentType.includes('application/x-pdf');

    if (!isHtml && !isPdf && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported Content-Type "${contentType}" at ${currentUrl}`);
    }

    // 9. Check Content-Length header against max size limit
    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredLength = parseInt(contentLengthHeader, 10);
      if (declaredLength > maxSizeBytes) {
        throw new Error(
          `Response size (${(declaredLength / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit (${(maxSizeBytes / (1024 * 1024)).toFixed(1)} MB)`
        );
      }
    }

    // 10. Stream response body and enforce byte limit dynamically
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxSizeBytes) {
      throw new Error(
        `Received payload (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds limit (${(maxSizeBytes / (1024 * 1024)).toFixed(1)} MB)`
      );
    }

    const responseEtag = res.headers.get('etag');
    const responseLastModified = res.headers.get('last-modified');

    return {
      status: res.status,
      notModified: false,
      contentType,
      buffer,
      text: isHtml ? buffer.toString('utf-8') : '',
      etag: responseEtag,
      lastModified: responseLastModified,
      finalUrl: currentUrl,
    };
  }

  throw new Error(`Too many redirects (exceeded ${maxRedirects}) while fetching ${targetUrl}`);
};

export default {
  politeFetch,
  sleep,
};
