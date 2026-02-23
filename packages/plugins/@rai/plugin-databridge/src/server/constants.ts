export const SCHEMA_STORAGE = {
  dippy_prod: {
    bucket: 'schema-management-proj-mle-396318',
    baseUrl: 'https://storage.cloud.google.com/schema-management-proj-mle-396318',
    pathPattern: 'bdai/ingestion/{name}/latest/spec/{name}.yaml',
  },
  dippy_dev: {
    bucket: 'schema-management-mle-sandbox-401920',
    baseUrl: 'https://storage.cloud.google.com/schema-management-mle-sandbox-401920',
    pathPattern: 'bdai/ingestion/{name}/latest/spec/{name}.yaml',
  },
} as const;

export type ResponseType = 'default' | 'dippy_prod' | 'dippy_dev';

export function getSchemaUrl(responseType: 'dippy_prod' | 'dippy_dev', collectionTitle: string): string {
  const config = SCHEMA_STORAGE[responseType];
  const path = config.pathPattern.replace(/{name}/g, collectionTitle);
  return `${config.baseUrl}/${path}`;
}
