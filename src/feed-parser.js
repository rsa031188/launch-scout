export function xmlValue(block, tag) {
  const pattern = String.raw`<${tag}(?:\s[^>]*)?>([\s\S]*?)</${tag}>`;
  const match = block.match(new RegExp(pattern, 'i'));
  return match
    ? match[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000)
    : '';
}

export async function readFeedBody(response, maxBytes) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('provider_response_too_large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('provider_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseFeedEntries(body, feedUrl) {
  const blocks = [...body.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map(([block]) => block);
  return blocks.map((block) => {
    const title = xmlValue(block, 'title');
    if (!title) return null;

    const links = [...block.matchAll(/<link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/link\s*>)/gi)];
    const atomLinks = links
      .map(([, attributes, content]) => {
        const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
        const rel = attributes.match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2];
        return { href, rel };
      })
      .filter(({ href }) => href);
    const atomLink = atomLinks.find(({ rel }) => !rel || rel === 'alternate') || atomLinks[0];
    const rssLink = links.find(([, attributes, content]) => !attributes.includes('href') && content)?.[2];
    const link = atomLink?.href || rssLink || '';
    const rawLink = link ? xmlValue(`<value>${link}</value>`, 'value') : feedUrl;
    let normalizedLink = feedUrl;
    try { normalizedLink = new URL(rawLink, feedUrl).toString(); } catch {}

    return {
      title,
      link: normalizedLink || feedUrl,
      date: xmlValue(block, 'pubDate') || xmlValue(block, 'published') || xmlValue(block, 'updated'),
      summary: xmlValue(block, 'description') || xmlValue(block, 'summary') || xmlValue(block, 'content')
    };
  }).filter(Boolean);
}
