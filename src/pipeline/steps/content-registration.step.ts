import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

@Injectable()
export class ContentRegistrationStep implements IPipelineStep {
  private readonly logger = new Logger(ContentRegistrationStep.name);
  readonly stepName = PipelineStep.CONTENT_REGISTRATION;

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting content registration for file: ${context.fileName}`);
      
      // TODO: Implement content registration logic
      // - Call Unique GraphQL API to register content
      // - Receive pre-signed upload URL
      // - Prepare metadata for ingestion
      // - Set context.uploadUrl and context.uniqueContentId
      
      this.logger.log(`[${context.correlationId}] Content registration completed for file: ${context.fileName}`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Content registration failed: ${error.message}`);
      throw error;
    }
  }
} 