import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { UniqueApiService } from '../../common/unique-api/unique-api.service';
import { ContentRegistrationRequest } from '../../common/unique-api/types/unique-api.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ContentRegistrationStep implements IPipelineStep {
  private readonly logger = new Logger(ContentRegistrationStep.name);
  readonly stepName = PipelineStep.CONTENT_REGISTRATION;

  constructor(
    private readonly uniqueApiService: UniqueApiService,
    private readonly configService: ConfigService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.log(
        `[${context.correlationId}] Starting content registration for file: ${context.fileName}`,
      );

      // Get the unique API token from previous step
      const uniqueToken = context.metadata.tokens?.uniqueApiToken;
      if (!uniqueToken) {
        throw new Error(
          'Unique API token not found in context - token validation may have failed',
        );
      }

      // Generate unique key for this file
      const fileKey = this.generateFileKey(context);

      // Prepare content registration request
      const registrationRequest: ContentRegistrationRequest = {
        title: context.fileName,
        key: fileKey,
        mimeType: context.metadata.mimeType || 'application/octet-stream',
        ownerType: 'SCOPE',
        scopeId: this.configService.get<string>('uniqueApi.scopeId')!,
        sourceOwnerType: 'COMPANY',
        sourceKind: 'SHAREPOINT_ONLINE',
        sourceName: this.extractSiteName(context.siteUrl),
      };

      this.logger.log(
        `[${context.correlationId}] Registering content with key: ${fileKey}`,
      );

      // Register content with Unique API
      const registrationResponse = await this.uniqueApiService.registerContent(
        registrationRequest,
        uniqueToken,
      );

      // Store registration data in context for subsequent steps
      context.uploadUrl = registrationResponse.writeUrl;
      context.uniqueContentId = registrationResponse.id;
      context.metadata.registrationResponse = registrationResponse;

      this.logger.log(
        `[${context.correlationId}] Content registration completed for file: ${context.fileName}`,
      );

      // Record step timing
      const stepDuration = Date.now() - stepStartTime;
      context.stepTimings.set(this.stepName, stepDuration);

      return context;
    } catch (error) {
      this.logger.error(
        `[${context.correlationId}] Content registration failed: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Generate a unique key for the file based on SharePoint metadata
   */
  private generateFileKey(context: ProcessingContext): string {
    const siteId = context.metadata.siteId || 'unknown-site';
    const driveId = context.metadata.driveId || 'unknown-drive';

    // Create a unique key based on SharePoint structure
    return `sharepoint_${siteId}_${driveId}_${context.fileId}`;
  }

  /**
   * Extract site name from site URL for source naming
   */
  private extractSiteName(siteUrl: string): string {
    if (!siteUrl) return 'SharePoint';

    try {
      // Extract site name from URL like "https://tenant.sharepoint.com/sites/sitename"
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
