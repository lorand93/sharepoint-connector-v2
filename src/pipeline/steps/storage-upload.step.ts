import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

@Injectable()
export class StorageUploadStep implements IPipelineStep {
  private readonly logger = new Logger(StorageUploadStep.name);
  readonly stepName = PipelineStep.STORAGE_UPLOAD;

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting storage upload for file: ${context.fileName}`);
      
      // TODO: Implement storage upload logic
      // - Stream file buffer directly to pre-signed URL
      // - Monitor upload progress
      // - Verify upload completion
      // - Release memory buffer after successful upload
      
      this.logger.log(`[${context.correlationId}] Storage upload completed for file: ${context.fileName}`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Storage upload failed: ${error.message}`);
      throw error;
    }
  }

  async cleanup(context: ProcessingContext): Promise<void> {
    // Always release memory buffer after this step (success or failure)
    if (context.contentBuffer) {
      context.contentBuffer = undefined;
      this.logger.log(`[${context.correlationId}] Released content buffer memory`);
    }
  }
} 