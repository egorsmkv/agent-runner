// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { parseFeedXml } from '../server/feed-parser.mjs';

describe('feed parser', () => {
  it('normalizes RSS items into the stable response shape', () => {
    const feed = parseFeedXml(`<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example RSS</title>
    <item>
      <title>Story One</title>
      <link>https://example.com/story-one</link>
      <description><![CDATA[Lead <strong>story</strong> summary]]></description>
      <pubDate>Tue, 05 May 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);

    expect(feed).toEqual({
      source: 'Example RSS',
      items: [
        {
          title: 'Story One',
          link: 'https://example.com/story-one',
          description: 'Lead story summary',
          publishedAt: '2026-05-05T10:00:00.000Z',
          source: 'Example RSS',
        },
      ],
    });
  });

  it('detects RSS feeds by the root tag instead of nested feed-prefixed tags', () => {
    const feed = parseFeedXml(`<?xml version="1.0"?>
<rss version="2.0" xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0">
  <channel>
    <title>Nested Feed Prefix RSS</title>
    <item>
      <title>Story With Feedburner Link</title>
      <link>https://example.com/story-two</link>
      <feedburner:origLink>https://example.com/story-two</feedburner:origLink>
    </item>
  </channel>
</rss>`);

    expect(feed).toEqual({
      source: 'Nested Feed Prefix RSS',
      items: [
        {
          title: 'Story With Feedburner Link',
          link: 'https://example.com/story-two',
          description: null,
          publishedAt: null,
          source: 'Nested Feed Prefix RSS',
        },
      ],
    });
  });

  it('normalizes Atom entries and decodes entities', () => {
    const feed = parseFeedXml(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Item &amp; More</title>
    <link rel="alternate" href="https://example.com/atom-item" />
    <summary>Atom &lt;summary&gt;</summary>
    <updated>2026-05-05T09:30:00Z</updated>
  </entry>
</feed>`);

    expect(feed).toEqual({
      source: 'Example Atom',
      items: [
        {
          title: 'Item & More',
          link: 'https://example.com/atom-item',
          description: 'Atom <summary>',
          publishedAt: '2026-05-05T09:30:00.000Z',
          source: 'Example Atom',
        },
      ],
    });
  });

  it('parses RSS 1.0 items outside the channel block', () => {
    const feed = parseFeedXml(`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <channel>
    <title>Example RDF Feed</title>
  </channel>
  <item>
    <title>RDF Story</title>
    <link>https://example.com/rdf-story</link>
    <description>Outside channel</description>
  </item>
</rdf:RDF>`);

    expect(feed).toEqual({
      source: 'Example RDF Feed',
      items: [
        {
          title: 'RDF Story',
          link: 'https://example.com/rdf-story',
          description: 'Outside channel',
          publishedAt: null,
          source: 'Example RDF Feed',
        },
      ],
    });
  });

  it('strips escaped HTML descriptions while preserving plain escaped text', () => {
    const feed = parseFeedXml(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Escaped Content Feed</title>
  <entry>
    <title>Escaped HTML Item</title>
    <link href="https://example.com/escaped-html" />
    <summary>&lt;p&gt;Lead &lt;strong&gt;story&lt;/strong&gt; summary&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title>Escaped Text Item</title>
    <link href="https://example.com/escaped-text" />
    <summary>Atom &lt;summary&gt;</summary>
  </entry>
</feed>`);

    expect(feed).toEqual({
      source: 'Escaped Content Feed',
      items: [
        {
          title: 'Escaped HTML Item',
          link: 'https://example.com/escaped-html',
          description: 'Lead story summary',
          publishedAt: null,
          source: 'Escaped Content Feed',
        },
        {
          title: 'Escaped Text Item',
          link: 'https://example.com/escaped-text',
          description: 'Atom <summary>',
          publishedAt: null,
          source: 'Escaped Content Feed',
        },
      ],
    });
  });

  it('rejects unsupported XML payloads', () => {
    expect(() => parseFeedXml('<html><body>not a feed</body></html>')).toThrow(
      'supported RSS or Atom feed',
    );
  });
});
