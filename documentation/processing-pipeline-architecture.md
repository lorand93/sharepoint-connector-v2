# SharePoint Connector v2 - Processing Pipeline Architecture

## Overview
This document outlines the architecture for the SharePoint file processing pipeline, implementing a robust 5-step process for ingesting SharePoint files into the Unique knowledge base.

## Core Requirements
- **Maximum File Size**: 200MB
- **Step Timeout**: 30 seconds per step
- **Retry Strategy**: 3 retries per job (BullMQ configuration)
- **Error Handling**: Log errors and record metrics (no dead letter queue)
- **Concurrency**: 4 parallel jobs (configurable)

## Pipeline Architecture

### 1. Pipeline Pattern with Orchestration

**Core Architecture:**
- **PipelineService**: Orchestrates the 5-step flow with clear boundaries
- **Step-based Design**: Each step is independent, testable, and composable
- **Context Passing**: Rich context object flows through all steps
- **Early Exit**: Any step can terminate the pipeline cleanly

**Pipeline Steps:**
```
Job → Step 1: Token Validation
    → Step 2: Content Fetching (SharePoint)
    → Step 3: Content Registration (Unique API)
    → Step 4: Storage Upload (Direct to blob)
    → Step 5: Ingestion Finalization (Unique API)
```

### 2. Service Layer Design

#### UniqueApiService (Central API Hub)
- **Token Management**: Automatic refresh, caching, expiration handling
- **Rate Limiting**: Built-in 1000/minute limiter (from reference code)
- **Circuit Breaker**: Protect against API outages
- **Request Deduplication**: Prevent duplicate operations
- **Endpoints**:
  - Token acquisition (Zitadel)
  - Content registration (GraphQL)
  - Ingestion finalization (GraphQL)
  - File diff API integration

#### ContentService (SharePoint Integration)
- **Streaming Downloads**: Memory-efficient file handling for up to 200MB files
- **Retry Logic**: Handle Graph API throttling with exponential backoff
- **Content Validation**: MIME type checking, size limits
- **Metadata Extraction**: File properties for ingestion
- **Token Refresh**: Handle Graph API token expiration during long operations

#### StorageService (Upload Management)
- **Direct Upload**: Using pre-signed URLs from Unique API
- **Progress Tracking**: For large files (up to 200MB)
- **Checksum Validation**: Ensure upload integrity
- **No Local Storage**: Stream directly from SharePoint to Unique's blob storage
- **Memory Management**: Process files in chunks to handle 200MB files efficiently

### 3. Error Handling Strategy

#### Three-Tier Error Classification
- **Retryable**: Network issues, 5xx errors, rate limits → Exponential backoff (3 retries)
- **Non-Retryable**: 4xx errors, invalid files → Log and record metrics
- **Partial Failures**: Some steps succeed → Resume from last checkpoint where possible

#### Resilience Patterns
- **Circuit Breaker**: For external APIs (SharePoint, Unique)
- **Bulkhead**: Isolate SharePoint failures from Unique API failures
- **Timeout**: 30-second timeout per step
- **Idempotency**: All operations can be safely retried

#### Failed Job Handling
- Log comprehensive error details with correlation ID
- Record failure metrics by error type
- Mark job as failed in BullMQ (no dead letter queue needed)
- Emit failure events for monitoring

### 4. Performance & Concurrency

#### Processing Model
- **BullMQ Worker**: 4 parallel jobs (configurable via PROCESSING_CONCURRENCY)
- **Per-Job Pipeline**: Single file processed through all 5 steps
- **Resource Management**: Memory limits for 200MB files, connection pooling
- **Backpressure**: Monitor queue size and external API health

#### Optimization Points
- **Token Reuse**: Share Unique API tokens across concurrent jobs
- **HTTP Connection Pooling**: Reuse connections to SharePoint/Unique APIs
- **Streaming**: Stream file downloads and uploads (never load full 200MB into memory)
- **Parallel I/O**: Fetch metadata while downloading content where possible

### 5. Observability & Monitoring

#### Structured Logging
- **Correlation ID**: Track single file through entire pipeline
- **Step Timing**: Duration of each pipeline step
- **Error Context**: Rich error information with stack traces
- **Business Metrics**: Files processed, success rates, throughput
- **File Metadata**: File size, type, SharePoint source

#### Key Metrics (Prometheus-compatible)
- `pipeline_duration_seconds{step}` (histogram by step)
- `pipeline_errors_total{error_type, step}` (counter by error type and step)
- `unique_api_requests_total{endpoint, status}` (counter by endpoint)
- `sharepoint_download_bytes` (histogram)
- `file_processing_total{status}` (counter: success/failure)
- `concurrent_jobs_active` (gauge)

#### Health Checks
- Pipeline service health
- External API connectivity (SharePoint, Unique)
- Queue health and size
- Worker availability

### 6. Configuration Strategy

#### Runtime Configuration
- **Concurrency**: PROCESSING_CONCURRENCY (default: 4)
- **Timeouts**: STEP_TIMEOUT_SECONDS (default: 30)
- **Retry Limits**: MAX_RETRIES (default: 3)
- **File Limits**: MAX_FILE_SIZE_BYTES (default: 200MB)
- **Rate Limits**: UNIQUE_API_RATE_LIMIT (default: 1000/minute)

#### Environment Variables
```bash
# Processing Configuration
PROCESSING_CONCURRENCY=4
STEP_TIMEOUT_SECONDS=30
MAX_RETRIES=3
MAX_FILE_SIZE_BYTES=209715200  # 200MB

# Unique API Configuration
UNIQUE_INGESTION_URL_GRAPHQL=https://gateway.qa.unique.app/ingestion-gen2/graphql
UNIQUE_INGESTION_URL=https://gateway.qa.unique.app/ingestion-gen2/v1/content
UNIQUE_SCOPE_ID=scope_d4m5cpcu81bszot56ncvo5jx
ZITADEL_OAUTH_TOKEN_URL=https://id.qa.unique.app/oauth/v2/token
ZITADEL_PROJECT_ID=225317577440629855
ZITADEL_CLIENT_ID=manual-confluence-connector-zitadel-client-id
ZITADEL_CLIENT_SECRET=manual-confluence-connector-zitadel-client-secret
```

### 7. Implementation Phases

#### Phase 1: Core Pipeline Foundation
1. **PipelineService** - Main orchestrator with 5-step flow
2. **ProcessingContext** - Rich context object passed between steps
3. **Step Interfaces** - Clean contracts for each pipeline step
4. **Basic Error Handling** - Try/catch with step isolation
5. **Job Processor Integration** - Wire pipeline into BullMQ worker

#### Phase 2: Service Implementation
1. **UniqueApiService** - Token management and API calls
2. **ContentService** - SharePoint file downloading with streaming
3. **StorageService** - Direct blob upload handling
4. **Configuration** - Environment-based configuration management
5. **Timeout Handling** - 30-second timeouts per step

#### Phase 3: Resilience & Observability
1. **Circuit Breakers** - For external API protection
2. **Advanced Retry Logic** - Exponential backoff, retry classification
3. **Comprehensive Logging** - Structured logs with correlation IDs
4. **Metrics Integration** - Prometheus metrics collection
5. **Performance Tuning** - Memory optimization, connection pooling

### 8. Pipeline Step Details

#### Step 1: Token Validation
- Validate/refresh Unique API token
- Early exit if token acquisition fails
- Cache valid tokens for reuse

#### Step 2: Content Fetching
- Download file from SharePoint using Graph API
- Stream directly to memory buffer (no local file storage)
- Validate file size (≤200MB) and type
- Handle Graph API token refresh if needed

#### Step 3: Content Registration
- Call Unique GraphQL API to register content
- Receive pre-signed upload URL
- Prepare metadata for ingestion

#### Step 4: Storage Upload
- Stream file buffer directly to pre-signed URL
- Monitor upload progress
- Verify upload completion
- Release memory buffer after successful upload

#### Step 5: Ingestion Finalization
- Notify Unique API that upload is complete
- Trigger indexing process
- Record success metrics

### 9. Data Structures

#### ProcessingContext
```typescript
interface ProcessingContext {
  correlationId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  siteUrl: string;
  libraryName: string;
  downloadUrl?: string;
  uploadUrl?: string;
  uniqueContentId?: string;
  contentBuffer?: Buffer;
  startTime: Date;
  stepTimings: Map<string, number>;
  metadata: Record<string, any>;
}
```

#### PipelineResult
```typescript
interface PipelineResult {
  success: boolean;
  context: ProcessingContext;
  error?: Error;
  completedSteps: string[];
  totalDuration: number;
}
```

### 10. Monitoring & Alerting

#### Critical Alerts
- Pipeline failure rate > 10%
- Average processing time > 5 minutes
- Queue size > 100 pending jobs
- External API circuit breaker trips

#### Dashboard Metrics
- Files processed per hour
- Success/failure ratio
- Average processing time per step
- Queue health and worker status
- API response times

---

## Next Steps

1. **Implement Phase 1**: Core pipeline foundation
2. **Set up credentials**: Zitadel and Unique API access
3. **Create service interfaces**: Define contracts for each service
4. **Build pipeline orchestrator**: Main processing flow
5. **Integrate with BullMQ**: Wire into existing job processor
6. **Add observability**: Logging and basic metrics
7. **Performance testing**: Validate with various file sizes
8. **Production hardening**: Error handling and resilience patterns 