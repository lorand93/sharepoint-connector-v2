import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

@Injectable()
export class IngestionFinalizationStep implements IPipelineStep {
  private readonly logger = new Logger(IngestionFinalizationStep.name);
  readonly stepName = PipelineStep.INGESTION_FINALIZATION;

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting ingestion finalization for file: ${context.fileName}`);
      
      // TODO: Implement ingestion finalization logic
      // - Notify Unique API that upload is complete
      // - Trigger indexing process
      // - Record success metrics
      
      this.logger.log(`[${context.correlationId}] Ingestion finalization completed for file: ${context.fileName}`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Ingestion finalization failed: ${error.message}`);
      throw error;
    }
  }
} 