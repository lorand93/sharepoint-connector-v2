import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContentRegistrationStep } from './content-registration.step';
import { AuthService } from '../../common/auth/auth.service';
import { UniqueApiService } from '../../common/unique-api/unique-api.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { ContentRegistrationRequest } from '../../common/unique-api/types/unique-api.types';

describe('ContentRegistrationStep', () => {
  let step: ContentRegistrationStep;
  let authService: jest.Mocked<AuthService>;
  let uniqueApiService: jest.Mocked<UniqueApiService>;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockContext: ProcessingContext = {
    correlationId: 'test-correlation-id',
    fileId: 'test-file-id',
    fileName: 'test-file.pdf',
    fileSize: 1024,
    siteUrl: 'https://tenant.sharepoint.com/sites/testsite',
    libraryName: 'test-library',
    downloadUrl: 'https://example.com/file.pdf',
    startTime: new Date(),
    metadata: {
      siteId: 'test-site-id',
      driveId: 'test-drive-id',
      mimeType: 'application/pdf',
    },
  };

  const mockRegistrationResponse = {
    id: 'unique-content-id',
    key: 'generated-file-key',
    writeUrl: 'https://storage.com/upload/url',
    readUrl: 'https://storage.com/read/url',
    mimeType: 'application/pdf',
    ownerType: 'SCOPE',
    byteSize: 1024,
    ownerId: 'test-owner-id',
    createdAt: '2024-01-15T10:30:00Z',
    internallyStoredAt: null,
    source: 'UNIQUE_BLOB_STORAGE',
  };

  beforeEach(async () => {
    const mockAuthService = {
      getUniqueApiToken: jest.fn(),
    };

    const mockUniqueApiService = {
      registerContent: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockMetricsService = {
      recordPipelineStepDuration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentRegistrationStep,
        { provide: AuthService, useValue: mockAuthService },
        { provide: UniqueApiService, useValue: mockUniqueApiService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    step = module.get<ContentRegistrationStep>(ContentRegistrationStep);
    authService = module.get(AuthService);
    uniqueApiService = module.get(UniqueApiService);
    configService = module.get(ConfigService);
    metricsService = module.get(MetricsService);

    // Setup default config values
    configService.get.mockImplementation((key) => {
      if (key === 'uniqueApi.scopeId') return 'test-scope-id';
      return undefined;
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(step).toBeDefined();
      expect(step.stepName).toBe(PipelineStep.CONTENT_REGISTRATION);
    });
  });

  describe('execute', () => {
    it('should successfully register content', async () => {
      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      const result = await step.execute({ ...mockContext });

      expect(result.uploadUrl).toBe(mockRegistrationResponse.writeUrl);
      expect(result.uniqueContentId).toBe(mockRegistrationResponse.id);
      expect(result.metadata.registrationResponse).toBe(mockRegistrationResponse);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'test-file.pdf',
          key: 'sharepoint_test-site-id_test-drive-id_test-file-id',
          mimeType: 'application/pdf',
          ownerType: 'SCOPE',
          scopeId: 'test-scope-id',
          sourceOwnerType: 'COMPANY',
          sourceKind: 'UNIQUE_BLOB_STORAGE',
          sourceName: 'testsite',
        } as ContentRegistrationRequest),
        uniqueToken
      );

      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.CONTENT_REGISTRATION,
        expect.any(Number)
      );
    });

    it('should handle missing metadata gracefully', async () => {
      const contextWithMissingMetadata = {
        ...mockContext,
        metadata: {
          mimeType: 'application/pdf',
          // Missing siteId and driveId
        },
      };

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      const result = await step.execute(contextWithMissingMetadata);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'sharepoint_unknown-site_unknown-drive_test-file-id',
        }),
        uniqueToken
      );
      expect(result.uploadUrl).toBe(mockRegistrationResponse.writeUrl);
    });

    it('should use default MIME type when not provided', async () => {
      const contextWithoutMimeType = {
        ...mockContext,
        metadata: {
          siteId: 'test-site-id',
          driveId: 'test-drive-id',
          // No mimeType
        },
      };

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute(contextWithoutMimeType);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'application/octet-stream',
        }),
        uniqueToken
      );
    });

    it('should handle auth service errors', async () => {
      const authError = new Error('Token acquisition failed');
      authService.getUniqueApiToken.mockRejectedValue(authError);

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Token acquisition failed'
      );
    });

    it('should handle unique API service errors', async () => {
      const uniqueToken = 'valid-unique-token';
      const apiError = new Error('Registration failed');
      
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockRejectedValue(apiError);

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Registration failed'
      );
    });

    it('should preserve original context properties', async () => {
      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      const contextWithMetadata = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          existingProperty: 'should-be-preserved',
        },
      };

      const result = await step.execute(contextWithMetadata);

      expect(result.correlationId).toBe(mockContext.correlationId);
      expect(result.metadata.existingProperty).toBe('should-be-preserved');
      expect(result.metadata.siteId).toBe('test-site-id');
    });
  });

  describe('private method behavior', () => {
    it('should generate correct file keys', async () => {
      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute({ ...mockContext });

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'sharepoint_test-site-id_test-drive-id_test-file-id',
        }),
        uniqueToken
      );
    });

    it('should extract site name from URL correctly', async () => {
      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute({ ...mockContext });

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'testsite', // Extracted from /sites/testsite
        }),
        uniqueToken
      );
    });

    it('should handle invalid site URLs', async () => {
      const contextWithInvalidUrl = {
        ...mockContext,
        siteUrl: 'invalid-url',
      };

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute(contextWithInvalidUrl);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'SharePoint', // Default fallback
        }),
        uniqueToken
      );
    });

    it('should handle empty site URL', async () => {
      const contextWithEmptyUrl = {
        ...mockContext,
        siteUrl: '',
      };

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute(contextWithEmptyUrl);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'SharePoint', // Default fallback
        }),
        uniqueToken
      );
    });

    it('should extract hostname when not a /sites/ URL', async () => {
      const contextWithRootUrl = {
        ...mockContext,
        siteUrl: 'https://tenant.sharepoint.com/root/path',
      };

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute(contextWithRootUrl);

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceName: 'tenant.sharepoint.com', // Hostname fallback
        }),
        uniqueToken
      );
    });
  });

  describe('error handling', () => {
    it('should not record metrics when execution fails', async () => {
      authService.getUniqueApiToken.mockRejectedValue(new Error('Auth failed'));

      try {
        await step.execute({ ...mockContext });
      } catch (error) {
        // Expected to throw
      }

      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should handle missing config values', async () => {
      configService.get.mockReturnValue(undefined); // Missing scopeId

      const uniqueToken = 'valid-unique-token';
      authService.getUniqueApiToken.mockResolvedValue(uniqueToken);
      uniqueApiService.registerContent.mockResolvedValue(mockRegistrationResponse as any);

      await step.execute({ ...mockContext });

      expect(uniqueApiService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeId: undefined,
        }),
        uniqueToken
      );
    });
  });
});