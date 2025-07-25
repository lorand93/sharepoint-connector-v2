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
  },

  uniqueApi: {
    endpoint: process.env.UNIQUE_API_ENDPOINT,
    tokenUrl: process.env.UNIQUE_API_TOKEN_URL,
    clientId: process.env.UNIQUE_API_CLIENT_ID,
    clientSecret: process.env.UNIQUE_API_CLIENT_SECRET,
  },
});
