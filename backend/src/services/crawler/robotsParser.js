import { URL } from 'url';
import { isSSRFSafe } from './urlNormalizer.js';
import CRAWLER_CONFIG from './crawlerConfig.js';

// In-memory cache for robots.txt: hostname -> { rules: [], expiresAt: number }
const robotsCache = new Map();
const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Parses raw robots.txt text into structured Disallow rules
 */
const parseRobotsTxt = (content) => {
  const lines = content.split('\n');
  const disallows = [];
  let isTargetAgent = false;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    const [key, ...valParts] = line.split(':');
    const field = key.trim().toLowerCase();
    const value = valParts.join(':').trim();

    if (field === 'user-agent') {
      const agent = value.toLowerCase();
      if (agent === '*' || agent.includes('askcampus') || agent.includes('bot')) {
        isTargetAgent = true;
      } else {
        isTargetAgent = false;
      }
    } else if (isTargetAgent && field === 'disallow') {
      if (value) {
        disallows.push(value);
      }
    }
  }

  return disallows;
};

/**
 * Fetches and caches robots.txt for a given base URL or domain
 *
 * @param {string} domainOrUrl
 * @returns {Promise<string[]>} Array of disallow prefixes
 */
export const getRobotsDisallowRules = async (domainOrUrl) => {
  let hostname;
  let origin;

  try {
    const parsed = domainOrUrl.startsWith('http') ? new URL(domainOrUrl) : new URL(`https://${domainOrUrl}`);
    hostname = parsed.hostname.toLowerCase();
    origin = parsed.origin;
  } catch (err) {
    return [];
  }

  // Check in-memory cache
  const cached = robotsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }

  const robotsUrl = `${origin}/robots.txt`;

  // SSRF check before fetching robots.txt
  const ssrf = isSSRFSafe(robotsUrl);
  if (!ssrf.isSafe) {
    console.warn(`[ROBOTS] SSRF safety rejected robots URL: ${robotsUrl}`);
    return ['/']; // Block everything conservatively
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': CRAWLER_CONFIG.USER_AGENT,
      },
    });

    clearTimeout(timeoutId);

    if (res.status === 200) {
      const text = await res.text();
      const rules = parseRobotsTxt(text);
      robotsCache.set(hostname, {
        rules,
        expiresAt: Date.now() + ROBOTS_CACHE_TTL_MS,
      });
      console.log(`[ROBOTS] Successfully fetched & cached ${rules.length} disallow rules for ${hostname}`);
      return rules;
    } else if (res.status === 404) {
      // 404 means no robots restrictions
      robotsCache.set(hostname, {
        rules: [],
        expiresAt: Date.now() + ROBOTS_CACHE_TTL_MS,
      });
      return [];
    } else {
      console.warn(`[ROBOTS] Non-200 status (${res.status}) for ${robotsUrl}. Using conservative policy.`);
      return [];
    }
  } catch (err) {
    console.warn(`[ROBOTS] Failed to fetch robots.txt for ${hostname}: ${err.message}. Defaulting to open crawl.`);
    return [];
  }
};

/**
 * Checks if a specific URL is allowed under robots.txt policy
 *
 * @param {string} urlStr
 * @returns {Promise<boolean>}
 */
export const isUrlAllowedByRobots = async (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    const rules = await getRobotsDisallowRules(parsed.origin);

    const path = parsed.pathname;
    for (const rule of rules) {
      if (rule === '/') return false;
      if (path.startsWith(rule)) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return true;
  }
};

/**
 * Clear robots cache (useful for testing)
 */
export const clearRobotsCache = () => {
  robotsCache.clear();
};

export default {
  getRobotsDisallowRules,
  isUrlAllowedByRobots,
  clearRobotsCache,
};
