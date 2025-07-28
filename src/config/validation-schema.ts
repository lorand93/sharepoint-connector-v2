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

  UNIQUE_API_ENDPOINT: Joi.string().uri().required(),
  UNIQUE_API_TOKEN_URL: Joi.string().uri().required(),
  UNIQUE_API_CLIENT_ID: Joi.string().required(),
  UNIQUE_API_CLIENT_SECRET: Joi.string().required(),
});
