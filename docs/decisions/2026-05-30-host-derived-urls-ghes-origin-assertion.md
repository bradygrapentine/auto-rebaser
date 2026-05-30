# Host-derived GitHub URLs (GHES) + per-request origin assertion

**Date:** 2026-05-30
**Status:** Accepted
**Backlog:** DOC-1 (retrospective — v2 GHES support + SSRF guard)

## Context

The extension must work against both github.com and GitHub Enterprise Server
(GHES), whose origin and API paths differ (`/api/v3` for REST, `/api/graphql`
for GraphQL — neither applies on cloud). Hardcoding `api.github.com` would
preclude GHES. Separately, a credential-bearing client must never send the user's
token to a non-GitHub origin — a request URL derived from settings or data is an
SSRF/exfiltration surface if left unchecked.

## Decision

Derive **every** GitHub host URL from the user's `enterpriseHost` setting in one
place (`src/core/host-config.ts`): `ghOriginFor`, `ghApiBaseFor`
(`https://<host>/api/v3` for GHES, `https://api.github.com` for cloud), and the
GraphQL endpoint. github.com is the implicit default when no host is configured.

Guard every outbound request with `assertGithubOrigin` (`host-config.ts:80`),
called on each request in `src/github/http.ts` (`:55`, `:66`). It validates the
URL's origin against the configured host and **fails closed** — `throw
new Error('INVALID_HOST')` — for anything that doesn't match.

## Consequences

- **Benefit:** cloud and GHES are supported from one client with no host strings
  hardcoded in the request layer.
- **Benefit:** the origin assertion is a defense-in-depth SSRF/exfil guard
  (aligned with `docs/security/2026-05-14-owasp-review.md`): a crafted or
  misconfigured URL can't carry the token off to an attacker origin.
- **Cost:** a misconfigured `enterpriseHost` fails closed at the assertion rather
  than silently falling back to cloud — correct for security, but it surfaces as
  an `INVALID_HOST` error the user must resolve.
- **Cost:** all request construction must route through `host-config.ts`; a new
  endpoint added with a hardcoded URL would bypass both the GHES derivation and
  the origin guard.
