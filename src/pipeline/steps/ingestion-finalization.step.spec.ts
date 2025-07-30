import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IngestionFinalizationStep } from './ingestion-finalization.step';
import { AuthService } from '../../common/auth/auth.service';
import { UniqueApiService } from '../../common/unique-api/unique-api.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { IngestionFinalizationRequest } from '../../common/unique-api/types/unique-api.types';

describe('IngestionFinalizationStep', () => {
  let step: IngestionFinalizationStep;
  let authService: jest.Mocked<AuthService>;
  let uniqueApiService: jest.Mocked<UniqueApiService>;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockRegistrationResponse = {
    id: 'cont_test123',
    key: 'sharepoint_site_drive_file123',
    byteSize: 156948,
    mimeType: 'application/pdf',
    ownerType: 'SCOPE',
    ownerId: 'scope_test123',
    writeUrl: 'https://storage.example.com/upload/test123',
    readUrl: 'unique://content/cont_test123',
    createdAt: '2024-01-01T00:00:00Z',
    internallyStoredAt: null,
  };

  const mockFinalizationResponse = {
    id: 'cont_final456',
  };

  const mockContext: ProcessingContext = {
    correlationId: 'test-correlation-id',
    fileName: 'test-document.pdf',
    fileId: 'file123',
    fileSize: 156948,
    siteUrl: 'https://tenant.sharepoint.com/sites/testsite',
    libraryName: 'Documents',
    downloadUrl: 'https://graph.microsoft.com/download/file123',
    uniqueContentId: 'cont_test123',
    uploadUrl: 'https://storage.example.com/upload/test123',
    startTime: new Date('2024-01-01T00:00:00Z'),
    metadata: {
      siteId: 'site123',
      driveId: 'drive456',
      mimeType: 'application/pdf',
      webUrl: 'https://tenant.sharepoint.com/sites/testsite/documents/test-document.pdf',
      registrationResponse: mockRegistrationResponse,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionFinalizationStep,
        {
          provide: AuthService,
          useValue: {
            getUniqueApiToken: jest.fn(),
          },
        },
        {
          provide: UniqueApiService,
          useValue: {
            finalizeIngestion: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            recordPipelineStepDuration: jest.fn(),
          },
        },
      ],
    }).compile();

    step = module.get<IngestionFinalizationStep>(IngestionFinalizationStep);
    authService = module.get(AuthService) as jest.Mocked<AuthService>;
    uniqueApiService = module.get(UniqueApiService) as jest.Mocked<UniqueApiService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
    metricsService = module.get(MetricsService) as jest.Mocked<MetricsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    const uniqueToken = 'valid-unique-token';

    beforeEach(() => {
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      configService.get.mockReturnValue('test-scope-id');
      uniqueApiService.finalizeIngestion.mockResolvedValue(mockFinalizationResponse);
      metricsService.recordPipelineStepDuration.mockReturnValue();
    });

    it('should successfully finalize ingestion', async () => {
      const result = await step.execute({ ...mockContext });

      expect(result.metadata.finalizationResponse).toBe(mockFinalizationResponse);
      expect(result.metadata.finalContentId).toBe(mockFinalizationResponse.id);

      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(configService.get).toHaveBeenCalledWith('uniqueApi.scopeId');
      
      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          key: mockRegistrationResponse.key,
          mimeType: mockRegistrationResponse.mimeType,
          ownerType: mockRegistrationResponse.ownerType,
          byteSize: mockRegistrationResponse.byteSize,
          scopeId: 'test-scope-id',
          sourceOwnerType: 'USER',
          sourceName: 'testsite',
          sourceKind: 'MICROSOFT_365_SHAREPOINT',
          fileUrl: mockRegistrationResponse.readUrl,
        } as IngestionFinalizationRequest),
        uniqueToken
      );

      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.INGESTION_FINALIZATION,
        expect.any(Number)
      );
    });

    it('should extract site name from different URL formats', async () => {
      // Test standard SharePoint site URL
      const contextWithSiteUrl = {
        ...mockContext,
        siteUrl: 'https://tenant.sharepoint.com/sites/marketing-team',
      };

      await step.execute(contextWithSiteUrl);

      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'marketing-team',
        }),
        uniqueToken
      );
    });

    it('should handle root site URL', async () => {
      const contextWithRootSite = {
        ...mockContext,
        siteUrl: 'https://tenant.sharepoint.com',
      };

      await step.execute(contextWithRootSite);

      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'tenant.sharepoint.com',
        }),
        uniqueToken
      );
    });

    it('should handle invalid site URL', async () => {
      const contextWithInvalidUrl = {
        ...mockContext,
        siteUrl: 'invalid-url',
      };

      await step.execute(contextWithInvalidUrl);

      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'SharePoint',
        }),
        uniqueToken
      );
    });

    it('should handle missing site URL', async () => {
      const contextWithoutSiteUrl = {
        ...mockContext,
        siteUrl: '',
      };

      await step.execute(contextWithoutSiteUrl);

      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'SharePoint',
        }),
        uniqueToken
      );
    });

    it('should throw error when registration response is missing', async () => {
      const contextWithoutRegistration = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          registrationResponse: undefined,
        },
      };

      await expect(step.execute(contextWithoutRegistration)).rejects.toThrow(
        'Registration response not found in context - content registration may have failed'
      );

      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(uniqueApiService.finalizeIngestion).not.toHaveBeenCalled();
      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should handle token acquisition failure', async () => {
      const tokenError = new Error('Token acquisition failed');
      authService.getUniqueApiToken.mockRejectedValue(tokenError);

      await expect(step.execute({ ...mockContext })).rejects.toThrow('Token acquisition failed');

      expect(uniqueApiService.finalizeIngestion).not.toHaveBeenCalled();
      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should handle finalization failure', async () => {
      const finalizationError = new Error('Finalization failed');
      uniqueApiService.finalizeIngestion.mockRejectedValue(finalizationError);

      await expect(step.execute({ ...mockContext })).rejects.toThrow('Finalization failed');

      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledTimes(1);
      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should handle config service error', async () => {
      configService.get.mockImplementation(() => {
        throw new Error('Config service failed');
      });

      await expect(step.execute({ ...mockContext })).rejects.toThrow('Config service failed');

      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(uniqueApiService.finalizeIngestion).not.toHaveBeenCalled();
      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should record metrics on successful execution', async () => {
      await step.execute({ ...mockContext });

      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.INGESTION_FINALIZATION,
        expect.any(Number)
      );

      // Verify duration is a number (can be 0 for very fast tests)
      const recordedDuration = (metricsService.recordPipelineStepDuration as jest.Mock).mock.calls[0][1];
      expect(recordedDuration).toBeGreaterThanOrEqual(0);
      expect(recordedDuration).toBeLessThan(1);
    });

    it('should not record metrics on failure', async () => {
      uniqueApiService.finalizeIngestion.mockRejectedValue(new Error('API Error'));

      await expect(step.execute({ ...mockContext })).rejects.toThrow('API Error');

      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should preserve original context properties', async () => {
      const result = await step.execute({ ...mockContext });

      // Verify original context is preserved
      expect(result.correlationId).toBe(mockContext.correlationId);
      expect(result.fileName).toBe(mockContext.fileName);
      expect(result.fileId).toBe(mockContext.fileId);
      expect(result.siteUrl).toBe(mockContext.siteUrl);
      expect(result.downloadUrl).toBe(mockContext.downloadUrl);
      expect(result.uniqueContentId).toBe(mockContext.uniqueContentId);
      expect(result.uploadUrl).toBe(mockContext.uploadUrl);

      // Verify metadata is enhanced, not replaced
      expect(result.metadata.siteId).toBe(mockContext.metadata.siteId);
      expect(result.metadata.driveId).toBe(mockContext.metadata.driveId);
      expect(result.metadata.mimeType).toBe(mockContext.metadata.mimeType);
      expect(result.metadata.registrationResponse).toBe(mockContext.metadata.registrationResponse);
    });
  });

  describe('stepName', () => {
    it('should return correct step name', () => {
      expect(step.stepName).toBe(PipelineStep.INGESTION_FINALIZATION);
    });
  });

  describe('extractSiteName', () => {
    it('should handle various URL formats correctly', async () => {
      const testCases = [
        {
          input: 'https://tenant.sharepoint.com/sites/marketing',
          expected: 'marketing',
          description: 'standard site URL',
        },
        {
          input: 'https://tenant.sharepoint.com/sites/team-project-alpha',
          expected: 'team-project-alpha',
          description: 'site with dashes',
        },
        {
          input: 'https://tenant.sharepoint.com',
          expected: 'tenant.sharepoint.com',
          description: 'root site URL',
        },
        {
          input: 'https://tenant.sharepoint.com/',
          expected: 'tenant.sharepoint.com',
          description: 'root site URL with trailing slash',
        },
        {
          input: 'https://tenant.sharepoint.com/personal/user_tenant_com',
          expected: 'tenant.sharepoint.com',
          description: 'personal site URL',
        },
        {
          input: '',
          expected: 'SharePoint',
          description: 'empty URL',
        },
        {
          input: 'invalid-url',
          expected: 'SharePoint',
          description: 'invalid URL',
        },
      ];

      for (const testCase of testCases) {
        // Setup mocks for this iteration
        jest.clearAllMocks();
        authService.getUniqueApiToken.mockResolvedValue('token');
        configService.get.mockReturnValue('test-scope-id');
        uniqueApiService.finalizeIngestion.mockResolvedValue(mockFinalizationResponse);
        metricsService.recordPipelineStepDuration.mockReturnValue();

        const contextWithUrl = {
          ...mockContext,
          siteUrl: testCase.input,
        };

        await step.execute(contextWithUrl);

        expect(uniqueApiService.finalizeIngestion).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceName: testCase.expected,
          }),
          expect.any(String)
        );
      }
    });
  });
});