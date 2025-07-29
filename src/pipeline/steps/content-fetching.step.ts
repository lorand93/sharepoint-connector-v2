import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { SharepointApiService } from '../../common/microsoft-graph/sharepoint-api.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class ContentFetchingStep implements IPipelineStep {
  private readonly logger = new Logger(ContentFetchingStep.name);
  readonly stepName = PipelineStep.CONTENT_FETCHING;

  constructor(
    private readonly sharepointApiService: SharepointApiService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.debug(`[${context.correlationId}] Starting content fetching for file: ${context.fileName}`);

      const driveId = this.extractDriveId(context);
      const itemId = context.fileId;

      if (!driveId) {
        throw new Error('Drive ID not found in file metadata');
      }

      const contentBuffer = await this.sharepointApiService.downloadFileContent(driveId, itemId);

      context.contentBuffer = contentBuffer;
      context.fileSize = contentBuffer.length;

      this.validateMimeType(context.metadata.mimeType, context.correlationId);
      this.logger.debug(`[${context.correlationId}] Content fetching completed for file: ${context.fileName} (${Math.round(contentBuffer.length / 1024 / 1024)}MB)`);

      const stepDuration = Date.now() - stepStartTime;
      this.metricsService.recordPipelineStepDuration(this.stepName, stepDuration / 1000);

      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Content fetching failed: ${error.message}`);
      throw error;
    }
  }

  private extractDriveId(context: ProcessingContext): string | null {
    const metadata = context.metadata;

    if (metadata.driveId) {
      return metadata.driveId;
    }

    if (metadata.parentReference?.driveId) {
      return metadata.parentReference.driveId;
    }

    if (metadata.listItem?.fields?.driveId) {
      return metadata.listItem.fields.driveId;
    }

    this.logger.warn(`[${context.correlationId}] Drive ID not found in metadata. Available keys: ${Object.keys(metadata).join(', ')}`);
    return null;
  }

  private validateMimeType(mimeType: string, correlationId: string): void {
    const allowedMimeTypes = this.configService.get<string[]>('sharepoint.allowedMimeTypes') || [];

    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
      throw new Error(`MIME type ${mimeType} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }
  }

  async cleanup(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.correlationId}] Content fetching cleanup completed (buffer preserved for next steps)`);
  }
}
