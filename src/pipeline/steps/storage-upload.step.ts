import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class StorageUploadStep implements IPipelineStep {
  private readonly logger = new Logger(StorageUploadStep.name);
  readonly stepName = PipelineStep.STORAGE_UPLOAD;

  constructor(
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.debug(`[${context.correlationId}] Starting storage upload for file: ${context.fileName}`);

      if (!context.contentBuffer) {
        throw new Error('Content buffer not found - content fetching may have failed');
      }

      if (!context.uploadUrl) {
        throw new Error('Upload URL not found - content registration may have failed');
      }

      const fileSizeBytes = context.contentBuffer.length;
      const fileSizeMB = Math.round(fileSizeBytes / 1024);

      this.logger.debug(`[${context.correlationId}] Uploading ${fileSizeMB}KB to storage: ${context.uploadUrl}`);
      await this.performUpload(context);

      const stepDuration = Date.now() - stepStartTime;
      this.metricsService.recordPipelineStepDuration(this.stepName, stepDuration / 1000);

      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Storage upload failed: ${error.message}`);
      throw error;
    }
  }

  async cleanup(context: ProcessingContext): Promise<void> {
    if (context.contentBuffer) {
      context.contentBuffer = undefined;
      this.logger.debug(`[${context.correlationId}] Released content buffer memory`);
    }
  }

  private async performUpload(context: ProcessingContext): Promise<void> {
    const uploadUrl = context.uploadUrl!;
    const contentBuffer = context.contentBuffer!;
    const mimeType = context.metadata.mimeType || 'application/octet-stream';

    try {
      const response = await firstValueFrom(
        this.httpService.put(uploadUrl, contentBuffer, {
          headers: {
            'Content-Type': mimeType,
            'x-ms-blob-type': 'BlockBlob',
          },
        }),
      );

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
      }

      this.logger.debug(`[${context.correlationId}] Upload completed successfully`);
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Upload failed: ${error.message}`);
      throw error;
    }
  }
}
