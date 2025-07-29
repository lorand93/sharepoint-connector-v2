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
import { MetricsService } from '../common/metrics/metrics.service';
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
    private readonly metricsService: MetricsService,
  ) {
    this.steps = [this.tokenValidationStep, this.contentFetchingStep, this.contentRegistrationStep, this.storageUploadStep, this.ingestionFinalizationStep];

    this.stepTimeoutMs = (this.configService.get<number>('STEP_TIMEOUT_SECONDS') || 30) * 1000;
  }

  async processFile(file: DriveItem): Promise<PipelineResult> {
    const correlationId = randomUUID();
    const startTime = new Date();

    const context: ProcessingContext = {
      correlationId,
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size || 0, // Use file size if available, otherwise determine during content fetching
      siteUrl: file.parentReference?.siteId || '',
      libraryName: file.parentReference?.driveId || '',
      downloadUrl: file.webUrl,
      startTime,
      metadata: {
        mimeType: file.file?.mimeType,
        isFolder: Boolean(file.folder),
        listItemFields: file.listItem.fields,
        driveId: file.parentReference?.driveId,
        siteId: file.parentReference?.siteId,
        lastModifiedDateTime: file.lastModifiedDateTime,
        ...file,
      },
    };

    const completedSteps: string[] = [];
    let currentStepIndex = 0;

    try {
      this.logger.debug(`[${correlationId}] Starting pipeline for file: ${file.name} (${file.id})`);

      for (let i = 0; i < this.steps.length; i++) {
        currentStepIndex = i;
        const step = this.steps[i];

        this.logger.debug(`[${correlationId}] Executing step ${i + 1}/${this.steps.length}: ${step.stepName}`);

        await this.executeStepWithTimeout(step, context);
        completedSteps.push(step.stepName);

        this.logger.debug(`[${correlationId}] Completed step: ${step.stepName}`);

        await this.cleanupStep(step, context);
      }

      const totalDuration = Date.now() - startTime.getTime();

      this.logger.log(`[${correlationId}] Pipeline completed successfully in ${totalDuration}ms for file: ${file.name}`);

      this.metricsService.recordPipelineCompleted(true, totalDuration / 1000);
      this.metricsService.recordFileSize(context.fileSize);

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

      this.metricsService.recordPipelineCompleted(false, totalDuration / 1000);

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
      await Promise.race([step.execute(context), timeoutPromise]);
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
        const step = this.steps.find((s) => s.stepName === stepName);
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
}
