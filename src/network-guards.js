import net from 'node:net';

function isNonPublicIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => value < 0 || value > 255)) return true;
  const [first, second, third] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 168 || second === 0 && third === 0))
    || (first === 198 && (second === 18 || second === 19 || second === 51 && third === 100))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function ipv6Words(address) {
  let value = address.toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const splitAt = value.lastIndexOf(':');
    const octets = value.slice(splitAt + 1).split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => part < 0 || part > 255)) return null;
    value = `${value.slice(0, splitAt)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const words = [...left, ...Array(missing).fill('0'), ...right].map((part) => Number.parseInt(part, 16));
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null;
}

export function isNonPublicAddress(address) {
  if (net.isIPv4(address)) return isNonPublicIpv4(address);
  if (!net.isIPv6(address)) return true;
  const words = ipv6Words(address);
  if (!words) return true;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mapped = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff
    ].join('.');
    return isNonPublicIpv4(mapped);
  }
  const globalUnicast = (words[0] & 0xe000) === 0x2000;
  const documentation = words[0] === 0x2001 && words[1] === 0x0db8;
  const teredo = words[0] === 0x2001 && words[1] === 0;
  const sixToFour = words[0] === 0x2002;
  return !globalUnicast || documentation || teredo || sixToFour;
}
