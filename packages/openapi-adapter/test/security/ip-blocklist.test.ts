import { describe, expect, it } from 'vitest';
import { isBlockedAddress } from '../../src/remote-fetch/ip-blocklist.js';

describe('isBlockedAddress — IPv4', () => {
  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('10.255.255.255')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.0.1')).toBe(true);
    expect(isBlockedAddress('192.168.255.255')).toBe(true);
  });

  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('127.255.255.254')).toBe(true);
  });

  it('blocks link-local, including the 169.254.169.254 cloud metadata endpoint', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('169.254.0.1')).toBe(true);
  });

  it('blocks carrier-grade NAT, multicast, and reserved ranges', () => {
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('224.0.0.1')).toBe(true);
    expect(isBlockedAddress('240.0.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('does not false-positive adjacent public ranges just outside a blocked block', () => {
    expect(isBlockedAddress('11.0.0.1')).toBe(false); // just past 10.0.0.0/8
    expect(isBlockedAddress('172.32.0.1')).toBe(false); // just past 172.16.0.0/12
    expect(isBlockedAddress('192.169.0.1')).toBe(false); // just past 192.168.0.0/16
  });
});

describe('isBlockedAddress — IPv6', () => {
  it('blocks loopback and unspecified', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
  });

  it('blocks link-local (fe80::/10)', () => {
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('fe80::abcd:1234')).toBe(true);
  });

  it('blocks unique local (fc00::/7)', () => {
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 addresses using the IPv4 rules', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows a public IPv6 address', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false); // Cloudflare DNS
  });
});

describe('isBlockedAddress — unclassifiable input', () => {
  it('blocks anything that is not a valid IPv4 or IPv6 literal, conservatively', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});
