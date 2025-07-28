import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test'),
  PORT: Joi.number(),

  REDIS_URL: Joi.string().uri().required(),
  PROCESSING_CONCURRENCY: Joi.number(),
  MAX_RETRIES: Joi.number(),

  GRAPH_CLIENT_ID: Joi.string().required(),
  GRAPH_CLIENT_SECRET: Joi.string().required(),
  GRAPH_TENANT_ID: Joi.string().required(),

  SHAREPOINT_SITES: Joi.string().required(),
  SHAREPOINT_SYNC_COLUMN_NAME: Joi.string().required(),
  ALLOWED_MIME_TYPES: Joi.string().required(),

  // Pipeline Processing Configuration
  STEP_TIMEOUT_SECONDS: Joi.number().default(30),
  MAX_FILE_SIZE_BYTES: Joi.number().default(209715200), // 200MB

  // Unique API Configuration  
  UNIQUE_INGESTION_URL_GRAPHQL: Joi.string().uri().required(),
  UNIQUE_INGESTION_URL: Joi.string().uri().required(),
  UNIQUE_SCOPE_ID: Joi.string().required(),
  ZITADEL_OAUTH_TOKEN_URL: Joi.string().uri().required(),
  ZITADEL_PROJECT_ID: Joi.string().required(),
  ZITADEL_CLIENT_ID: Joi.string().required(),
  ZITADEL_CLIENT_SECRET: Joi.string().required(),
});
