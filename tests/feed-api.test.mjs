// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createApp } from '../server/app.mjs';
import { fetchFeed, normalizeFeedUrl } from '../server/feed-service.mjs';

describe('feed service', () => {
  it('normalizes valid feed URLs', () => {
    expect(normalizeFeedUrl(' https://example.com/feed.xml ')).toBe('https://example.com/feed.xml');
  });

  it('fetches and normalizes feed responses', async () => {
    const feed = await fetchFeed('https://example.com/feed.xml', {
      fetch: async () => ({
        ok: true,
        text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Service Feed</title>
    <item>
      <title>Service Story</title>
      <link>https://example.com/story</link>
      <description>Summary</description>
      <pubDate>2026-05-05T12:00:00Z</pubDate>
    </item>
  </channel>
</rss>`,
      }),
    });

    expect(feed).toEqual({
      url: 'https://example.com/feed.xml',
      source: 'Service Feed',
      items: [
        {
          title: 'Service Story',
          link: 'https://example.com/story',
          description: 'Summary',
          publishedAt: '2026-05-05T12:00:00.000Z',
          source: 'Service Feed',
        },
      ],
    });
  });
});

describe('feed API', () => {
  it('serves normalized feed JSON from GET /api/feed', async () => {
    const handleRequest = createApp({
      fetchFeed: async (url) => ({
        url,
        source: 'Example Feed',
        items: [
          {
            title: 'Example Story',
            link: 'https://example.com/story',
            description: 'Short summary',
            publishedAt: '2026-05-05T12:00:00.000Z',
            source: 'Example Feed',
          },
        ],
      }),
    });

    const response = await dispatch(handleRequest, '/api/feed?url=https%3A%2F%2Fexample.com%2Ffeed.xml');

    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
    expect(JSON.parse(response.body)).toEqual({
      url: 'https://example.com/feed.xml',
      source: 'Example Feed',
      items: [
        {
          title: 'Example Story',
          link: 'https://example.com/story',
          description: 'Short summary',
          publishedAt: '2026-05-05T12:00:00.000Z',
          source: 'Example Feed',
        },
      ],
    });
  });

  it('returns a client error when the feed URL is missing', async () => {
    const response = await dispatch(createApp(), '/api/feed');

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'invalid_request',
      message: 'Feed URL is required.',
    });
  });
});

async function dispatch(handleRequest, path) {
  const response = createMockResponse();

  await handleRequest(
    {
      method: 'GET',
      url: path,
      headers: {
        host: 'localhost',
      },
    },
    response,
  );

  return response.snapshot();
}

function createMockResponse() {
  let statusCode = 200;
  let headers = {};
  let body = '';

  return {
    end(chunk = '') {
      body += chunk;
    },
    snapshot() {
      return {
        statusCode,
        headers,
        body,
      };
    },
    writeHead(nextStatusCode, nextHeaders) {
      statusCode = nextStatusCode;
      headers = nextHeaders;
    },
  };
}
