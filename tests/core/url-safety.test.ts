// TRIAGE-2 / SEC-11 — full rejection matrix for the synchronous render-time URL
// origin guard. Hard-literal assertions (no round-tripping): each case pins the
// expected boolean directly.

import { describe, it, expect } from 'vitest';
import { isSafeExternalUrl } from '../../src/core/url-safety';

describe('isSafeExternalUrl', () => {
  it('allows an https github.com URL', () => {
    expect(isSafeExternalUrl('https://github.com/o/r/runs/1')).toBe(true);
  });

  it('allows an https URL on the exact configured enterprise host', () => {
    expect(isSafeExternalUrl('https://ghe.acme.corp/o/r/runs/1', 'ghe.acme.corp')).toBe(true);
  });

  it('rejects a host not on the allowlist', () => {
    expect(isSafeExternalUrl('https://evil.com/x', 'ghe.acme.corp')).toBe(false);
  });

  it('rejects the wrong enterprise host', () => {
    expect(isSafeExternalUrl('https://ghe.acme.corp/x', 'github.acme.corp')).toBe(false);
  });

  it('rejects a suffix-attack hostname (exact match only)', () => {
    expect(isSafeExternalUrl('https://github.com.evil.com/x')).toBe(false);
  });

  it('rejects a non-https scheme', () => {
    expect(isSafeExternalUrl('http://github.com/x')).toBe(false);
  });

  it('rejects a data: URL', () => {
    expect(isSafeExternalUrl('data:text/html,<script>')).toBe(false);
  });

  it('rejects a javascript: URL', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects an enterprise-host URL when enterpriseHost is unset', () => {
    expect(isSafeExternalUrl('https://ghe.acme.corp', null)).toBe(false);
  });

  it('rejects nullish / unparseable input', () => {
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('::::')).toBe(false);
  });
});
