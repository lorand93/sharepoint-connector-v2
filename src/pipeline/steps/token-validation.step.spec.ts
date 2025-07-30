import { Test, TestingModule } from '@nestjs/testing';
import { TokenValidationStep } from './token-validation.step';
import { AuthService } from '../../common/auth/auth.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

describe('TokenValidationStep', () => {
  let step: TokenValidationStep;
  let authService: jest.Mocked<AuthService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockContext: ProcessingContext = {
    correlationId: 'test-correlation-id',
    fileId: 'test-file-id',
    fileName: 'test-file.pdf',
    fileSize: 1024,
    siteUrl: 'test-site-url',
    libraryName: 'test-library',
    downloadUrl: 'https://example.com/file.pdf',
    startTime: new Date(),
    metadata: {},
  };

  beforeEach(async () => {
    const mockAuthService = {
      getGraphApiToken: jest.fn(),
      getUniqueApiToken: jest.fn(),
    };

    const mockMetricsService = {
      recordPipelineStepDuration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenValidationStep,
        { provide: AuthService, useValue: mockAuthService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    step = module.get<TokenValidationStep>(TokenValidationStep);
    authService = module.get(AuthService);
    metricsService = module.get(MetricsService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(step).toBeDefined();
      expect(step.stepName).toBe(PipelineStep.TOKEN_VALIDATION);
    });
  });

  describe('execute', () => {
    it('should successfully validate both tokens', async () => {
      const graphToken = 'valid-graph-token';
      const uniqueToken = 'valid-unique-token';

      authService.getGraphApiToken.mockResolvedValue(graphToken);
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);

      const result = await step.execute({ ...mockContext });

      expect(result.metadata.tokens).toEqual({
        graphApiToken: graphToken,
        uniqueApiToken: uniqueToken,
        validatedAt: expect.any(String),
      });
      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.TOKEN_VALIDATION,
        expect.any(Number)
      );
    });

    it('should throw error when graph token is missing', async () => {
      authService.getGraphApiToken.mockResolvedValue(null as any);
      authService.getUniqueApiToken.mockResolvedValue('valid-unique-token');

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Failed to obtain valid token from Microsoft Graph'
      );
    });

    it('should throw error when unique token is missing', async () => {
      authService.getGraphApiToken.mockResolvedValue('valid-graph-token');
      authService.getUniqueApiToken.mockResolvedValue(null as any);

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Failed to obtain valid token from Zitadel'
      );
    });

    it('should throw error when both tokens are missing', async () => {
      authService.getGraphApiToken.mockResolvedValue(null as any);
      authService.getUniqueApiToken.mockResolvedValue(null as any);

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Failed to obtain valid token from Microsoft Graph'
      );
    });

    it('should handle auth service errors', async () => {
      const authError = new Error('Authentication service failed');
      authService.getGraphApiToken.mockRejectedValue(authError);
      authService.getUniqueApiToken.mockResolvedValue('valid-unique-token');

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Authentication service failed'
      );
    });

    it('should preserve original context properties', async () => {
      authService.getGraphApiToken.mockResolvedValue('valid-graph-token');
      authService.getUniqueApiToken.mockResolvedValue('valid-unique-token');

      const contextWithMetadata = {
        ...mockContext,
        metadata: { existingProperty: 'should-be-preserved' },
      };

      const result = await step.execute(contextWithMetadata);

      expect(result.correlationId).toBe(mockContext.correlationId);
      expect(result.fileId).toBe(mockContext.fileId);
      expect(result.metadata.existingProperty).toBe('should-be-preserved');
      expect(result.metadata.tokens).toBeDefined();
    });

    it('should call both token services concurrently', async () => {
      const delay = 100;
      authService.getGraphApiToken.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('graph-token'), delay))
      );
      authService.getUniqueApiToken.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('unique-token'), delay))
      );

      const startTime = Date.now();
      await step.execute({ ...mockContext });
      const endTime = Date.now();

      // Should complete in roughly one delay period (concurrent), not two (sequential)
      expect(endTime - startTime).toBeLessThan(delay * 1.5);
      expect(authService.getGraphApiToken).toHaveBeenCalledTimes(1);
      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle Promise.all rejection properly', async () => {
      authService.getGraphApiToken.mockRejectedValue(new Error('Graph API error'));
      authService.getUniqueApiToken.mockRejectedValue(new Error('Unique API error'));

      await expect(step.execute({ ...mockContext })).rejects.toThrow();
    });

    it('should not record metrics when execution fails', async () => {
      authService.getGraphApiToken.mockRejectedValue(new Error('Auth failed'));
      authService.getUniqueApiToken.mockResolvedValue('valid-token');

      try {
        await step.execute({ ...mockContext });
      } catch (error) {
        // Expected to throw
      }

      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });
  });
});