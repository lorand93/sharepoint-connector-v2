export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),

  redis: {
    url: process.env.REDIS_URL,
    concurrency: parseInt(process.env.PROCESSING_CONCURRENCY || '4', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  },

  sharepoint: {
    clientId: process.env.GRAPH_CLIENT_ID,
    clientSecret: process.env.GRAPH_CLIENT_SECRET,
    tenantId: process.env.GRAPH_TENANT_ID,
    sites: process.env.SHAREPOINT_SITES ? process.env.SHAREPOINT_SITES.split(',') : [],
    syncColumnName: process.env.SHAREPOINT_SYNC_COLUMN_NAME || 'FinanceGPTKnowledge',
    allowedMimeTypes: process.env.ALLOWED_MIME_TYPES ? process.env.ALLOWED_MIME_TYPES.split(',') : [],
  },

  pipeline: {
    stepTimeoutSeconds: parseInt(process.env.STEP_TIMEOUT_SECONDS || '30', 10),
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '209715200', 10),
  },

  uniqueApi: {
    ingestionUrl: process.env.UNIQUE_INGESTION_URL,
    ingestionGraphQLUrl: process.env.UNIQUE_INGESTION_URL_GRAPHQL,
    scopeId: process.env.UNIQUE_SCOPE_ID,
    zitadelOAuthTokenUrl: process.env.ZITADEL_OAUTH_TOKEN_URL,
    zitadelProjectId: process.env.ZITADEL_PROJECT_ID,
    zitadelClientId: process.env.ZITADEL_CLIENT_ID,
    zitadelClientSecret: process.env.ZITADEL_CLIENT_SECRET,
  },
});
