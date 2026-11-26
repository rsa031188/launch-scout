export function summaryPreview(value) {
  const characters = [...String(value ?? '').replace(/\s+/g, ' ').trim()];
  if (characters.length <= 200) return characters.join('');
  return `${characters.slice(0, 199).join('').trimEnd()}…`;
}

export function safeWebUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function attributesFromTag(tag) {
  const attributes = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

export function extractPreviewImage(html, pageUrl) {
  const safePageUrl = safeWebUrl(pageUrl);
  if (!safePageUrl) return '';

  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    const attributes = attributesFromTag(tag);
    const property = (attributes.property || attributes.name || '').toLowerCase();
    if (!['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(property)) continue;
    if (!attributes.content) continue;

    let imageUrl = '';
    try { imageUrl = safeWebUrl(new URL(decodeHtmlEntities(attributes.content), safePageUrl).toString()); } catch {}
    if (imageUrl) return imageUrl;
  }

  return '';
}
