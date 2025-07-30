import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { UniqueApiService } from '../../common/unique-api/unique-api.service';
import { ContentRegistrationRequest } from '../../common/unique-api/types/unique-api.types';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../common/metrics/metrics.service';
import { AuthService } from '../../common/auth/auth.service';

@Injectable()
export class ContentRegistrationStep implements IPipelineStep {
  private readonly logger = new Logger(ContentRegistrationStep.name);
  readonly stepName = PipelineStep.CONTENT_REGISTRATION;

  constructor(
    private readonly authService: AuthService,
    private readonly uniqueApiService: UniqueApiService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.debug(`[${context.correlationId}] Starting content registration for file: ${context.fileName}`);
      const uniqueToken = await this.authService.getUniqueApiToken();
      const fileKey = this.generateFileKey(context);

      const registrationRequest: ContentRegistrationRequest = {
        key: fileKey,
        mimeType: context.metadata.mimeType || 'application/octet-stream',
        ownerType: 'SCOPE',
        scopeId: this.configService.get<string>('uniqueApi.scopeId')!,
        sourceOwnerType: 'USER',
        sourceKind: 'MICROSOFT_365_SHAREPOINT',
        sourceName: this.extractSiteName(context.siteUrl),
      };

      this.logger.debug(`[${context.correlationId}] Registering content with key: ${fileKey}`);
      const registrationResponse = await this.uniqueApiService.registerContent(registrationRequest, uniqueToken);

      context.uploadUrl = registrationResponse.writeUrl;
      context.uniqueContentId = registrationResponse.id;
      context.metadata.registrationResponse = registrationResponse;

      this.logger.debug(`[${context.correlationId}] Content registration completed for file: ${context.fileName}`);

      const stepDuration = Date.now() - stepStartTime;
      this.metricsService.recordPipelineStepDuration(this.stepName, stepDuration / 1000);

      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Content registration failed: ${error.message}`);
      throw error;
    }
  }

  private generateFileKey(context: ProcessingContext): string {
    const siteId = context.metadata.siteId || 'unknown-site';
    const driveId = context.metadata.driveId || 'unknown-drive';

    return `sharepoint_${siteId}_${driveId}_${context.fileId}`;
  }

  private extractSiteName(siteUrl: string): string {
    if (!siteUrl) return 'SharePoint';

    try {
      const url = new URL(siteUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts.length >= 2 && pathParts[0] === 'sites') {
        return pathParts[1];
      }

      return url.hostname;
    } catch {
      return 'SharePoint';
    }
  }
}
