import { describe, it, expect, vi, beforeEach } from 'vitest';
import { graphql, GraphQLError } from '../../src/github/graphql';
import * as http from '../../src/github/http';

beforeEach(() => {
  vi.spyOn(http, 'request');
});

describe('graphql', () => {
  it('posts query + variables to /graphql with JSON content type', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: { ok: true } });
    await graphql('query Foo { x }', { a: 1 });
    const [path, opts] = vi.mocked(http.request).mock.calls[0];
    expect(path).toBe('/graphql');
    expect(opts!.method).toBe('POST');
    expect((opts!.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts!.body as string)).toEqual({
      query: 'query Foo { x }',
      variables: { a: 1 },
    });
  });

  it('defaults variables to {} when omitted', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: { ok: true } });
    await graphql('query Q { x }');
    const [, opts] = vi.mocked(http.request).mock.calls[0];
    expect(JSON.parse(opts!.body as string).variables).toEqual({});
  });

  it('returns data on success', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: { user: { id: 'abc' } } });
    const result = await graphql<{ user: { id: string } }>('query Q { user { id } }');
    expect(result).toEqual({ user: { id: 'abc' } });
  });

  it('throws GraphQLError when response contains errors', async () => {
    vi.mocked(http.request).mockResolvedValue({
      errors: [{ message: 'Field x not allowed', type: 'FORBIDDEN' }],
    });
    await expect(graphql('query Q { x }')).rejects.toBeInstanceOf(GraphQLError);
  });

  it('GraphQLError carries the full errors array', async () => {
    const errors = [
      { message: 'first', type: 'A' },
      { message: 'second', type: 'B' },
    ];
    vi.mocked(http.request).mockResolvedValue({ errors });
    try {
      await graphql('query Q { x }');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GraphQLError);
      expect((err as GraphQLError).errors).toEqual(errors);
      expect((err as GraphQLError).message).toBe('first');
    }
  });

  it('throws GraphQLError when data is missing and no errors set', async () => {
    vi.mocked(http.request).mockResolvedValue({});
    await expect(graphql('query Q { x }')).rejects.toThrow('GraphQL response missing data');
  });

  it('propagates http.request errors verbatim', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(graphql('query Q { x }')).rejects.toThrow('AUTH_ERROR');
  });
});
