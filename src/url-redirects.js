const fs = require('fs');
const path = require('path');

const DEFAULT_REDIRECTS_PATH = path.join(__dirname, '..', 'config', 'url-redirects.json');
const DEFAULT_LOCAL_REDIRECTS_PATH = path.join(__dirname, '..', 'config', 'url-redirects.local.json');

function normalizeHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function readRedirectFile(filePath, optional = false) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') {
      return {};
    }

    throw new Error(`Failed to load redirect config "${filePath}": ${error.message}`);
  }
}

function normalizeRule(rule) {
  if (typeof rule === 'string') {
    return {
      target: rule,
      preservePath: false,
      preserveQuery: false,
    };
  }

  if (!rule || typeof rule !== 'object' || !rule.target) {
    throw new Error('Redirect rules must be a string target or an object with a "target" field.');
  }

  return {
    target: String(rule.target),
    preservePath: Boolean(rule.preservePath),
    preserveQuery: Boolean(rule.preserveQuery),
  };
}

function loadRedirectRules() {
  const configuredPath = process.env.TEXTWEB_URL_REDIRECTS_FILE || DEFAULT_REDIRECTS_PATH;
  const baseRules = readRedirectFile(configuredPath);
  const localRules = configuredPath === DEFAULT_REDIRECTS_PATH
    ? readRedirectFile(DEFAULT_LOCAL_REDIRECTS_PATH, true)
    : {};

  return Object.entries({ ...baseRules, ...localRules }).reduce((acc, [host, rule]) => {
    acc[normalizeHost(host)] = normalizeRule(rule);
    return acc;
  }, {});
}

function applyRule(requestedUrl, rule) {
  const sourceUrl = new URL(requestedUrl);
  const targetUrl = new URL(rule.target);

  if (rule.preservePath) {
    targetUrl.pathname = sourceUrl.pathname;
  }

  if (rule.preserveQuery) {
    targetUrl.search = sourceUrl.search;
  }

  return targetUrl.toString();
}

const REDIRECT_RULES = loadRedirectRules();

function interceptUrl(requestedUrl) {
  try {
    const parsedUrl = new URL(requestedUrl);
    const host = normalizeHost(parsedUrl.hostname);
    const rule = REDIRECT_RULES[host];

    if (!rule) {
      return {
        requestedUrl,
        finalUrl: requestedUrl,
        redirected: false,
      };
    }

    return {
      requestedUrl,
      finalUrl: applyRule(requestedUrl, rule),
      redirected: true,
      matchedHost: host,
      rule,
    };
  } catch (error) {
    return {
      requestedUrl,
      finalUrl: requestedUrl,
      redirected: false,
    };
  }
}

module.exports = {
  DEFAULT_LOCAL_REDIRECTS_PATH,
  DEFAULT_REDIRECTS_PATH,
  interceptUrl,
  loadRedirectRules,
};
