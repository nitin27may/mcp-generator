import { isIPv4, isIPv6 } from 'node:net';

/** TIP §9.2: block RFC1918 private ranges, link-local (incl. cloud metadata 169.254.169.254), loopback, and other non-routable/reserved ranges by default. */
const BLOCKED_IPV4_RANGES: readonly (readonly [base: string, prefix: number])[] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes the 169.254.169.254 cloud metadata endpoint
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function inIpv4Range(ipInt: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (ipv4ToInt(base) & mask);
}

function isBlockedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => inIpv4Range(ipInt, base, prefix));
}

/** First 16 bits, handling `::`-compressed forms — enough to classify fe80::/10 and fc00::/7. */
function firstHextet(ip: string): number | undefined {
  const first = ip.split(':')[0];
  if (first === undefined || first === '') return 0; // leading "::" — the address starts with a zero hextet
  const n = Number.parseInt(first, 16);
  return Number.isNaN(n) ? undefined : n;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true; // loopback / unspecified

  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (v4Mapped) return isBlockedIPv4(v4Mapped[1]!);

  const hextet = firstHextet(normalized);
  if (hextet === undefined) return true; // unparsable — block conservatively
  if ((hextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((hextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/** TIP §9.2. Unclassifiable input is blocked conservatively rather than let through. */
export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIPv4(ip);
  if (isIPv6(ip)) return isBlockedIPv6(ip);
  return true;
}
