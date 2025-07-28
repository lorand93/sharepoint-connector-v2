import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

@Injectable()
export class TokenValidationStep implements IPipelineStep {
  private readonly logger = new Logger(TokenValidationStep.name);
  readonly stepName = PipelineStep.TOKEN_VALIDATION;

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();
    
    try {
      this.logger.log(`[${context.correlationId}] Starting token validation`);
      
      // TODO: Implement token validation logic
      // - Validate/refresh Unique API token
      // - Early exit if token acquisition fails
      // - Cache valid tokens for reuse
      
      this.logger.log(`[${context.correlationId}] Token validation completed`);
      
      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);
      
      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Token validation failed: ${error.message}`);
      throw error;
    }
  }
} 