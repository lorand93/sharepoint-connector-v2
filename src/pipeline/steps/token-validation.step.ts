import { Injectable, Logger } from '@nestjs/common';
import { IPipelineStep } from './pipeline-step.interface';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { AuthService } from '../../common/auth/auth.service';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class TokenValidationStep implements IPipelineStep {
  private readonly logger = new Logger(TokenValidationStep.name);
  readonly stepName = PipelineStep.TOKEN_VALIDATION;

  constructor(
    private readonly authService: AuthService,
    private readonly metricsService: MetricsService,
  ) {}

  async execute(context: ProcessingContext): Promise<ProcessingContext> {
    const stepStartTime = Date.now();

    try {
      this.logger.log(`[${context.correlationId}] Starting token validation for file: ${context.fileName}`);

      const [graphToken, uniqueToken] = await Promise.all([this.authService.getGraphApiToken(), this.authService.getUniqueApiToken()]);

      if (!graphToken || !uniqueToken) {
        throw new Error(`Failed to obtain valid token from ${graphToken ? 'Zitadel' : 'Microsoft Graph'}`);
      }

      context.metadata.tokens = {
        graphApiToken: graphToken,
        uniqueApiToken: uniqueToken,
        validatedAt: new Date().toISOString(),
      };

      this.logger.log(`[${context.correlationId}] Token validation completed - Both tokens are valid and ready`);

      const stepDuration = Date.now() - stepStartTime;
      this.metricsService.recordPipelineStepDuration(this.stepName, stepDuration / 1000);

      return context;
    } catch (error) {
      this.logger.error(`[${context.correlationId}] Token validation failed: ${error.message}`);
      throw error;
    }
  }
}
