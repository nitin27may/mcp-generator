import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FetchPolicy } from './fetch-policy.js';
import { isBlockedAddress } from './ip-blocklist.js';

export class BlockedFetchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BlockedFetchError';
  }
}

/**
 * TIP §9.2: "Resolve DNS and check the final IP for every redirect. Do not
 * trust the hostname only." A literal IP in the URL needs no DNS lookup — the
 * address itself is what gets checked. `dns.lookup`'s result is what the
 * *next* connection attempt will race against, not a cryptographic proof of
 * what IP the TCP connection actually uses a few milliseconds later — full
 * rebinding-proof protection needs a custom low-level dispatcher that pins
 * the exact validated IP (not implemented here; this is the same level of
 * protection most fetch-wrapper SSRF guards provide without one).
 */
async function assertHostAllowed(hostname: string, policy: FetchPolicy): Promise<void> {
  if (policy.allowPrivateNetworks) return;

  if (hostname.toLowerCase() === 'localhost') {
    throw new BlockedFetchError('SEC-IMP-002', 'Blocked host "localhost"');
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new BlockedFetchError('SEC-IMP-002', `Blocked private/reserved address "${hostname}"`);
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new BlockedFetchError('SEC-IMP-006', `DNS resolution failed for "${hostname}": ${(error as Error).message}`);
  }
  if (addresses.length === 0) {
    throw new BlockedFetchError('SEC-IMP-006', `DNS resolution returned no addresses for "${hostname}"`);
  }
  const blocked = addresses.find((a) => isBlockedAddress(a.address));
  if (blocked) {
    throw new BlockedFetchError('SEC-IMP-002', `Host "${hostname}" resolves to a blocked address (${blocked.address})`);
  }
}

async function readWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer());

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BlockedFetchError('SEC-IMP-003', `Response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function urlOf(input: string | URL | Request): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

/**
 * A `fetch`-compatible function enforcing TIP §9's remote-fetch policy:
 * scheme allowlist, private/link-local/loopback address blocking (checked
 * fresh at every redirect hop, not just the first URL), a redirect cap, a
 * refusal of https→http downgrade redirects, a per-document byte cap, and a
 * cumulative byte cap shared across every call made through one instance
 * (`totalBytesFetched()` — reset by creating a new instance per resolution
 * pass). Manages its own redirect following (`redirect: 'manual'`) because
 * following-and-revalidating is the entire point — the platform default of
 * "just follow redirects" is exactly the behavior TIP §9.2 forbids.
 */
export function createSafeFetch(policy: FetchPolicy): { fetch: typeof fetch; totalBytesFetched: () => number } {
  let totalBytes = 0;

  const safeFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url = urlOf(input);
    let redirects = 0;

    for (;;) {
      const scheme = url.protocol.replace(':', '') as 'http' | 'https';
      if (!policy.allowedSchemes.includes(scheme)) {
        throw new BlockedFetchError('SEC-IMP-001', `Blocked scheme "${url.protocol}"`);
      }
      await assertHostAllowed(url.hostname, policy);

      if (totalBytes >= policy.maxTotalBytes) {
        throw new BlockedFetchError('SEC-IMP-003', `Exceeded cumulative fetch budget of ${policy.maxTotalBytes} bytes`);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal });
      } catch (error) {
        if (error instanceof BlockedFetchError) throw error;
        const wasAborted = controller.signal.aborted;
        throw new BlockedFetchError('SEC-IMP-005', wasAborted ? `Timed out after ${policy.timeoutMs}ms` : String((error as Error).message ?? error));
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
        redirects++;
        if (redirects > policy.maxRedirects) {
          throw new BlockedFetchError('SEC-IMP-003', `Exceeded ${policy.maxRedirects} redirects`);
        }
        const next = new URL(response.headers.get('location')!, url);
        if (url.protocol === 'https:' && next.protocol === 'http:') {
          throw new BlockedFetchError('SEC-IMP-001', 'Refused a redirect downgrading from https to http');
        }
        url = next;
        continue; // loop re-validates scheme + DNS for the new hop before following it
      }

      const bytes = await readWithLimit(response, Math.min(policy.maxDocumentBytes, policy.maxTotalBytes - totalBytes));
      totalBytes += bytes.byteLength;
      return new Response(bytes, { status: response.status, headers: response.headers });
    }
  }) as typeof fetch;

  return { fetch: safeFetch, totalBytesFetched: () => totalBytes };
}
