import { request } from './http';

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    type?: string;
    message: string;
    path?: Array<string | number>;
  }>;
}

export class GraphQLError extends Error {
  constructor(
    message: string,
    public readonly errors: NonNullable<GraphQLResponse<unknown>['errors']>
  ) {
    super(message);
    this.name = 'GraphQLError';
  }
}

export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await request<GraphQLResponse<T>>('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (result.errors && result.errors.length > 0) {
    throw new GraphQLError(result.errors[0].message, result.errors);
  }
  if (!result.data) {
    throw new GraphQLError('GraphQL response missing data', []);
  }
  return result.data;
}
