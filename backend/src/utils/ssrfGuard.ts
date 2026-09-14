import dns from 'dns';
import net from 'net';

/**
 * Blocks the URL-scraping feature from being pointed at internal
 * infrastructure (loopback, private ranges, link-local / cloud metadata
 * endpoints like 169.254.169.254). This is a pre-flight DNS check — it
 * doesn't pin the resolved address for the request itself, so it doesn't
 * defend against DNS-rebinding, but it stops the common cases of someone
 * pasting an internal or localhost URL into the "scrape a company page"
 * field.
 */

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const PRIVATE_V4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return PRIVATE_V4_RANGES.some((cidr) => inCidr(ip, cidr));
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — check the embedded address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true; // unrecognized format — treat as unsafe
}

export class UnsafeUrlError extends Error {}

/** Throws UnsafeUrlError if the hostname is (or resolves to) a private/internal address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const bare = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets, if any
  if (bare === 'localhost') {
    throw new UnsafeUrlError('That address can’t be scraped.');
  }
  if (net.isIP(bare)) {
    if (isPrivateOrReservedIp(bare)) {
      throw new UnsafeUrlError('That address can’t be scraped.');
    }
    return;
  }
  let records: dns.LookupAddress[];
  try {
    records = await dns.promises.lookup(bare, { all: true });
  } catch {
    throw new UnsafeUrlError('Couldn’t resolve that domain.');
  }
  if (records.length === 0 || records.some((r) => isPrivateOrReservedIp(r.address))) {
    throw new UnsafeUrlError('That address can’t be scraped.');
  }
}
