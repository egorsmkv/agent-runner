import { parseFeedXml } from './feed-parser.mjs';

export async function fetchFeed(feedUrl, options = {}) {
  const normalizedUrl = normalizeFeedUrl(feedUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available in this runtime.');
  }

  let response;

  try {
    response = await fetchImpl(normalizedUrl, {
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
        'user-agent': 'agent-runner-rss-reader/0.0.0',
      },
    });
  } catch (error) {
    throw new Error(`Failed to fetch feed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Feed request failed with status ${response.status}.`);
  }

  const xml = await response.text();
  const parsed = parseFeedXml(xml);

  return {
    url: normalizedUrl,
    source: parsed.source,
    items: parsed.items,
  };
}

export function normalizeFeedUrl(feedUrl) {
  const rawValue = String(feedUrl ?? '').trim();

  if (!rawValue) {
    throw new Error('Feed URL is required.');
  }

  let parsed;

  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('Feed URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Feed URL must use http or https.');
  }

  return parsed.toString();
}
