import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { UniqueApiService } from '../../common/unique-api/unique-api.service';
import { IngestionFinalizationRequest } from '../../common/unique-api/types/unique-api.types';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../common/metrics/metrics.service';
import { AuthService } from '../../common/auth/auth.service';

@Injectable()
export class IngestionFinalizationStep implements IPipelineStep {
  private readonly logger = new Logger(IngestionFinalizationStep.name);
  readonly stepName = PipelineStep.INGESTION_FINALIZATION;

  constructor(
    private readonly authService: AuthService,
    private readonly uniqueApiService: UniqueApiService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.debug(`[${context.correlationId}] Starting ingestion finalization for file: ${context.fileName}`);

      const uniqueToken = await this.authService.getUniqueApiToken();

      const registrationResponse = context.metadata.registrationResponse;
      if (!registrationResponse) {
        throw new Error('Registration response not found in context - content registration may have failed');
      }

      const finalizationRequest: IngestionFinalizationRequest = {
        key: registrationResponse.key,
        mimeType: registrationResponse.mimeType,
        ownerType: registrationResponse.ownerType,
        url: context.downloadUrl || context.metadata.webUrl,
        scopeId: this.configService.get<string>('uniqueApi.scopeId')!,
        fileUrl: registrationResponse.readUrl,
      };

      this.logger.debug(`[${context.correlationId}] Finalizing ingestion for content ID: ${context.uniqueContentId}`);

      const finalizationResponse = await this.uniqueApiService.finalizeIngestion(finalizationRequest, uniqueToken);

      context.metadata.finalizationResponse = finalizationResponse;
      context.metadata.finalContentId = finalizationResponse.id;

      this.logger.debug(`[${context.correlationId}] Ingestion finalized successfully - Final content ID: ${finalizationResponse.id}`);

      const stepDuration = Date.now() - stepStartTime;
      this.metricsService.recordPipelineStepDuration(this.stepName, stepDuration / 1000);

      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Ingestion finalization failed: ${error.message}`);
      throw error;
    }
  }
}
