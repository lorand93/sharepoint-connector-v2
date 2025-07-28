import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

@Injectable()
export class ContentFetchingStep implements IPipelineStep {
  private readonly logger = new Logger(ContentFetchingStep.name);
  readonly stepName = PipelineStep.CONTENT_FETCHING;

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting content fetching for file: ${context.fileName}`);
      
      // TODO: Implement content fetching logic
      // - Download file from SharePoint using Graph API
      // - Stream directly to memory buffer (no local file storage)
      // - Validate file size (≤200MB) and type
      // - Handle Graph API token refresh if needed
      // - Set context.contentBuffer
      
      this.logger.log(`[${context.correlationId}] Content fetching completed for file: ${context.fileName}`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Content fetching failed: ${error.message}`);
      throw error;
    }
  }

  async cleanup(context: ProcessingContext): Promise<void> {
    this.logger.log(`[${context.correlationId}] Content fetching cleanup completed (buffer preserved for next steps)`);
  }
} 