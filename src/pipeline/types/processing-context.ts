export interface ProcessingContext {
  // Tracking
  correlationId: string;
  fileId: string;
  fileName: string;
  fileSize: number;

  // SharePoint metadata
  siteUrl: string;
  libraryName: string;
  downloadUrl?: string;

  // Processing state
  uploadUrl?: string;
  uniqueContentId?: string;
  contentBuffer?: Buffer;

  // Timing and metrics
  startTime: Date;
  stepTimings: Map<string, number>;

  // Additional metadata
  metadata: Record<string, any>;
}

export interface PipelineResult {
  success: boolean;
  context: ProcessingContext;
  error?: Error;
  completedSteps: string[];
  totalDuration: number;
}

export interface JobResult {
  success: boolean;
  fileId: string;
  fileName: string;
  correlationId: string;
  duration: number;
  completedSteps: string[];
  error?: string;
}

export enum PipelineStep {
  TOKEN_VALIDATION = 'token-validation',
  CONTENT_FETCHING = 'content-fetching',
  CONTENT_REGISTRATION = 'content-registration',
  STORAGE_UPLOAD = 'storage-upload',
  INGESTION_FINALIZATION = 'ingestion-finalization',
}
