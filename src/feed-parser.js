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
