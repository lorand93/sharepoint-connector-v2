import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { SharepointApiService } from '../../common/microsoft-graph/sharepoint-api.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ContentFetchingStep implements IPipelineStep {
  private readonly logger = new Logger(ContentFetchingStep.name);
  readonly stepName = PipelineStep.CONTENT_FETCHING;

  constructor(
    private readonly sharepointApiService: SharepointApiService,
    private readonly configService: ConfigService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting content fetching for file: ${context.fileName}`);
      
      // Extract drive and item IDs from metadata
      const driveId = this.extractDriveId(context);
      const itemId = context.fileId;
      
      if (!driveId) {
        throw new Error('Drive ID not found in file metadata');
      }

      this.logger.log(`[${context.correlationId}] Downloading file content - Drive: ${driveId}, Item: ${itemId}`);
      
      // Download file content from SharePoint
      const contentBuffer = await this.sharepointApiService.downloadFileContent(driveId, itemId);
      
      // Validate file size and update context
      const fileSizeBytes = contentBuffer.length;
      const maxFileSizeBytes = this.configService.get<number>('pipeline.maxFileSizeBytes') || 209715200; // 200MB
      
      if (fileSizeBytes > maxFileSizeBytes) {
        throw new Error(`File size ${fileSizeBytes} bytes exceeds maximum limit of ${maxFileSizeBytes} bytes`);
      }

      // Update context with downloaded content
      context.contentBuffer = contentBuffer;
      context.fileSize = fileSizeBytes;
      
      // Validate MIME type if specified
      const mimeType = context.metadata.mimeType;
      if (mimeType) {
        this.validateMimeType(mimeType, context.correlationId);
      }
      
      this.logger.log(`[${context.correlationId}] Content fetching completed for file: ${context.fileName} (${Math.round(fileSizeBytes / 1024 / 1024)}MB)`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Content fetching failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract drive ID from the context metadata
   */
  private extractDriveId(context: ProcessingContext): string | null {
    // Try to get drive ID from different possible locations in metadata
    const metadata = context.metadata;
    
    // Check if it's directly available
    if (metadata.driveId) {
      return metadata.driveId;
    }
    
    // Check if it's in parentReference (common Graph API structure)
    if (metadata.parentReference?.driveId) {
      return metadata.parentReference.driveId;
    }
    
    // Check if it's stored as a direct property (from scanner)
    if (metadata.listItem?.fields?.driveId) {
      return metadata.listItem.fields.driveId;
    }

    this.logger.warn(`[${context.correlationId}] Drive ID not found in metadata. Available keys: ${Object.keys(metadata).join(', ')}`);
    return null;
  }

  /**
   * Validate MIME type against allowed types
   */
  private validateMimeType(mimeType: string, correlationId: string): void {
    const allowedMimeTypes = this.configService.get<string[]>('sharepoint.allowedMimeTypes') || [];
    
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
      throw new Error(`MIME type ${mimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }
    
    this.logger.log(`[${correlationId}] MIME type validation passed: ${mimeType}`);
  }

  async cleanup(context: ProcessingContext): Promise<void> {
    this.logger.log(`[${context.correlationId}] Content fetching cleanup completed (buffer preserved for next steps)`);
  }
} 