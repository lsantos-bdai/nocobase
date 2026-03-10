import { BigQuery } from '@google-cloud/bigquery';

let _client: BigQuery | null = null;

export function getBigQueryClient(): BigQuery {
  if (!_client) {
    _client = new BigQuery({
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  return _client;
}
