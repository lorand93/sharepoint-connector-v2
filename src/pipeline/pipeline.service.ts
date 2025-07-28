import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPipelineStep } from './steps/pipeline-step.interface';
import { ProcessingContext, PipelineResult } from './types/processing-context';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import { TokenValidationStep } from './steps/token-validation.step';
import { ContentFetchingStep } from './steps/content-fetching.step';
import { ContentRegistrationStep } from './steps/content-registration.step';
import { StorageUploadStep } from './steps/storage-upload.step';
import { IngestionFinalizationStep } from './steps/ingestion-finalization.step';
import { randomUUID } from 'crypto';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly steps: IPipelineStep[];
  private readonly stepTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenValidationStep: TokenValidationStep,
    private readonly contentFetchingStep: ContentFetchingStep,
    private readonly contentRegistrationStep: ContentRegistrationStep,
    private readonly storageUploadStep: StorageUploadStep,
    private readonly ingestionFinalizationStep: IngestionFinalizationStep,
  ) {
    // Initialize pipeline steps in order
    this.steps = [
      this.tokenValidationStep,
      this.contentFetchingStep,
      this.contentRegistrationStep,
      this.storageUploadStep,
      this.ingestionFinalizationStep,
    ];

    // Get step timeout from configuration (default: 30 seconds)
    this.stepTimeoutMs = (this.configService.get<number>('STEP_TIMEOUT_SECONDS') || 30) * 1000;
  }

  /**
   * Process a single SharePoint file through the complete pipeline
   */
  async processFile(file: DriveItem): Promise<PipelineResult> {
    const correlationId = randomUUID();
    const startTime = new Date();

    // Initialize processing context
    const context: ProcessingContext = {
      correlationId,
      fileId: file.id,
      fileName: file.name,
      fileSize: 0, // Will be determined during content fetching
      siteUrl: '', // To be populated from job metadata
      libraryName: '', // To be populated from job metadata  
      downloadUrl: file.webUrl,
      startTime,
      stepTimings: new Map(),
      metadata: {
        mimeType: file.file?.mimeType,
        isFolder: !!file.folder,
        listItemFields: file.listItem?.fields,
        ...file,
      },
    };

    const completedSteps: string[] = [];
    let currentStepIndex = 0;

    try {
      this.logger.log(`[${correlationId}] Starting pipeline for file: ${file.name} (${file.id})`);

      // Execute each step in sequence
      for (let i = 0; i < this.steps.length; i++) {
        currentStepIndex = i;
        const step = this.steps[i];

        this.logger.log(`[${correlationId}] Executing step ${i + 1}/${this.steps.length}: ${step.stepName}`);

        // Execute step with timeout
        await this.executeStepWithTimeout(step, context);
        completedSteps.push(step.stepName);

        this.logger.log(`[${correlationId}] Completed step: ${step.stepName}`);

        await this.cleanupStep(step, context);
      }

      const totalDuration = Date.now() - startTime.getTime();
      
      this.logger.log(`[${correlationId}] Pipeline completed successfully in ${totalDuration}ms for file: ${file.name}`);
      this.logStepTimings(correlationId, context.stepTimings);

      await this.finalCleanup(context);

      return {
        success: true,
        context,
        completedSteps,
        totalDuration,
      };

    } catch (error) {
      const totalDuration = Date.now() - startTime.getTime();
      
      this.logger.error(`[${correlationId}] Pipeline failed at step: ${this.steps[currentStepIndex]?.stepName} after ${totalDuration}ms`, error.stack);

      if (this.steps[currentStepIndex]?.cleanup) {
        await this.cleanupStep(this.steps[currentStepIndex], context);
      }

      return {
        success: false,
        context,
        error: error as Error,
        completedSteps,
        totalDuration,
      };
    }
  }

  /**
   * Execute a pipeline step with timeout protection
   */
  private async executeStepWithTimeout(step: IPipelineStep, context: ProcessingContext): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step ${step.stepName} timed out after ${this.stepTimeoutMs}ms`));
      }, this.stepTimeoutMs);
    });

    try {
      await Promise.race([
        step.execute(context),
        timeoutPromise,
      ]);
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Step ${step.stepName} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup completed steps in reverse order when pipeline fails
   */
  private async cleanupSteps(context: ProcessingContext, completedStepNames: string[]): Promise<void> {
    for (const stepName of completedStepNames) {
      try {
        const step = this.steps.find(s => s.stepName === stepName);
        if (step?.cleanup) {
          this.logger.log(`[${context.correlationId}] Cleaning up step: ${stepName}`);
          await step.cleanup(context);
        }
      } catch (cleanupError) {
        this.logger.error(`[${context.correlationId}] Cleanup failed for step ${stepName}:`, cleanupError);
      }
    }
  }



  /**
   * Cleanup a single step
   */
  private async cleanupStep(step: IPipelineStep, context: ProcessingContext): Promise<void> {
    try {
      if (step.cleanup) {
        this.logger.log(`[${context.correlationId}] Cleaning up step: ${step.stepName}`);
        await step.cleanup(context);
      }
    } catch (cleanupError) {
      this.logger.error(`[${context.correlationId}] Cleanup failed for step ${step.stepName}:`, cleanupError);
      // Don't throw - continue with pipeline
    }
  }

  /**
   * Final cleanup for any remaining resources after successful pipeline completion
   */
  private async finalCleanup(context: ProcessingContext): Promise<void> {
    try {
      if (context.contentBuffer) {
        context.contentBuffer = undefined;
        this.logger.log(`[${context.correlationId}] Released remaining content buffer memory`);
      }
      
      context.metadata = {};
    } catch (cleanupError) {
      this.logger.error(`[${context.correlationId}] Final cleanup failed:`, cleanupError);
    }
  }

  /**
   * Log step timings for observability
   */
  private logStepTimings(correlationId: string, stepTimings: Map<string, number>): void {
    const timings: Record<string, number> = {};
    stepTimings.forEach((duration, stepName) => {
      timings[stepName] = duration;
    });
    
    this.logger.log(`[${correlationId}] Step timings: ${JSON.stringify(timings, null, 2)}`);
  }
} 