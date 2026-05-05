const ENTITY_MAP = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

export function parseFeedXml(xml) {
  const sourceXml = String(xml ?? '').trim();

  if (!sourceXml) {
    throw new Error('Feed response was empty.');
  }

  const rootTag = readRootTagName(sourceXml);

  if (rootTag === 'feed') {
    return parseAtomFeed(sourceXml);
  }

  if (rootTag === 'rss' || rootTag === 'rdf:rdf') {
    return parseRssFeed(sourceXml);
  }

  throw new Error('Response did not contain a supported RSS or Atom feed.');
}

function parseRssFeed(xml) {
  const channel = extractBlock(xml, 'channel') ?? xml;
  const source = cleanText(readFirstTag(channel, ['title'])) || 'Unknown source';

  const items = extractBlocks(xml, 'item').map((item) => normalizeItem({
    title: readFirstTag(item, ['title']),
    link: readFirstTag(item, ['link', 'guid']),
    description: readFirstTag(item, ['description', 'content:encoded'], { preserveMarkupText: true }),
    publishedAt: readFirstTag(item, ['pubDate', 'dc:date']),
    source,
  }));

  return {
    source,
    items: items.filter(hasRequiredFields),
  };
}

function parseAtomFeed(xml) {
  const source = cleanText(readFirstTag(xml, ['title'])) || 'Unknown source';
  const items = extractBlocks(xml, 'entry').map((entry) => normalizeItem({
    title: readFirstTag(entry, ['title']),
    link: readAtomLink(entry),
    description: readFirstTag(entry, ['summary', 'content'], { preserveMarkupText: true }),
    publishedAt: readFirstTag(entry, ['published', 'updated']),
    source,
  }));

  return {
    source,
    items: items.filter(hasRequiredFields),
  };
}

function normalizeItem(item) {
  return {
    title: cleanText(item.title),
    link: cleanText(item.link),
    description: cleanText(item.description),
    publishedAt: normalizeDate(item.publishedAt),
    source: cleanText(item.source) || 'Unknown source',
  };
}

function hasRequiredFields(item) {
  return Boolean(item.title && item.link);
}

function normalizeDate(value) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.valueOf()) ? cleaned : parsed.toISOString();
}

function readAtomLink(entry) {
  const alternateLink =
    matchLinkHref(entry, /<link\b[^>]*\brel=(['"])alternate\1[^>]*\bhref=(['"])(.*?)\2[^>]*\/?>/i, 3) ??
    matchLinkHref(entry, /<link\b[^>]*\bhref=(['"])(.*?)\1[^>]*\brel=(['"])alternate\3[^>]*\/?>/i, 2);

  if (alternateLink) {
    return alternateLink;
  }

  return (
    matchLinkHref(entry, /<link\b[^>]*\bhref=(['"])(.*?)\1[^>]*\/?>/i, 2) ??
    readFirstTag(entry, ['id', 'link'])
  );
}

function matchLinkHref(input, pattern, groupIndex) {
  const match = pattern.exec(input);

  if (!match) {
    return null;
  }

  return match[groupIndex];
}

function readFirstTag(input, tags, options = {}) {
  for (const tag of tags) {
    const match = new RegExp(`<${escapeTag(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeTag(tag)}>`, 'i').exec(input);

    if (match) {
      return normalizeTagValue(match[1], options);
    }
  }

  return null;
}

function normalizeTagValue(value, options = {}) {
  const rawValue = stripCdata(value);
  const decodedValue = decodeXmlEntities(stripTags(rawValue));

  if (options.preserveMarkupText) {
    return normalizeDescriptionText(decodedValue);
  }

  return decodedValue;
}

function extractBlock(input, tag) {
  const match = new RegExp(`<${escapeTag(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeTag(tag)}>`, 'i').exec(input);
  return match?.[1] ?? null;
}

function extractBlocks(input, tag) {
  return Array.from(
    input.matchAll(new RegExp(`<${escapeTag(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeTag(tag)}>`, 'gi')),
    (match) => match[1],
  );
}

function escapeTag(tag) {
  return tag.replace(':', '\\:');
}

function stripCdata(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ');
}

function decodeXmlEntities(value) {
  return String(value ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, rawToken) => {
    const token = rawToken.toLowerCase();

    if (token.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    }

    if (token.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    }

    return ENTITY_MAP[token] ?? entity;
  });
}

function cleanText(value) {
  const cleaned = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
}

function normalizeDescriptionText(value) {
  const decoded = decodeXmlEntities(String(value ?? ''));

  if (!containsHtmlMarkup(decoded)) {
    return decoded;
  }

  return decodeXmlEntities(stripTags(decoded));
}

function containsHtmlMarkup(value) {
  const text = String(value ?? '');

  return /<([a-z][\w:-]*)(\s[^>]*)?>[\s\S]*<\/\1>/i.test(text) || /^<([a-z][\w:-]*)(\s[^>]*)?\/?>/i.test(text);
}

function readRootTagName(xml) {
  const sanitized = String(xml ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  const match = /^<([A-Za-z_][\w.:-]*)\b/.exec(sanitized);

  return match?.[1]?.toLowerCase() ?? null;
}
