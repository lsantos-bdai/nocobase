import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery';

export function createBigQueryClient(projectId: string, accessToken: string): BigQuery {
  // The BigQuery SDK accepts a `token` option at runtime (passed to the
  // underlying @google-cloud/common Service), but it's not in the TS types.
  return new BigQuery({ projectId, token: accessToken } as BigQueryOptions);
}
