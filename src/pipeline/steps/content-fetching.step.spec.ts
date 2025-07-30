import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContentFetchingStep } from './content-fetching.step';
import { SharepointApiService } from '../../common/microsoft-graph/sharepoint-api.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ProcessingContext, PipelineStep } from '../types/processing-context';

describe('ContentFetchingStep', () => {
  let step: ContentFetchingStep;
  let sharepointApiService: jest.Mocked<SharepointApiService>;
  let configService: jest.Mocked<ConfigService>;
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
    metadata: {
      driveId: 'test-drive-id',
      mimeType: 'application/pdf',
    },
  };

  const mockContentBuffer = Buffer.from('test file content');

  beforeEach(async () => {
    const mockSharepointApiService = {
      downloadFileContent: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const mockMetricsService = {
      recordPipelineStepDuration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentFetchingStep,
        { provide: SharepointApiService, useValue: mockSharepointApiService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    step = module.get<ContentFetchingStep>(ContentFetchingStep);
    sharepointApiService = module.get(SharepointApiService);
    configService = module.get(ConfigService);
    metricsService = module.get(MetricsService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(step).toBeDefined();
      expect(step.stepName).toBe(PipelineStep.CONTENT_FETCHING);
    });
  });

  describe('execute', () => {
    it('should successfully fetch content', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue([]); // No MIME type restrictions

      const result = await step.execute({ ...mockContext });

      expect(result.contentBuffer).toBe(mockContentBuffer);
      expect(result.fileSize).toBe(mockContentBuffer.length);
      expect(sharepointApiService.downloadFileContent).toHaveBeenCalledWith(
        'test-drive-id',
        'test-file-id'
      );
      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.CONTENT_FETCHING,
        expect.any(Number)
      );
    });

    it('should throw error when drive ID is missing', async () => {
      const contextWithoutDriveId = {
        ...mockContext,
        metadata: { mimeType: 'application/pdf' }, // No driveId
      };

      await expect(step.execute(contextWithoutDriveId)).rejects.toThrow(
        'Drive ID not found in file metadata'
      );
    });

    it('should extract drive ID from parentReference', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue([]);

      const contextWithParentRef = {
        ...mockContext,
        metadata: {
          mimeType: 'application/pdf',
          parentReference: { driveId: 'parent-drive-id' },
        },
      };

      await step.execute(contextWithParentRef);

      expect(sharepointApiService.downloadFileContent).toHaveBeenCalledWith(
        'parent-drive-id',
        'test-file-id'
      );
    });

    it('should extract drive ID from listItem fields', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue([]);

      const contextWithListItem = {
        ...mockContext,
        metadata: {
          mimeType: 'application/pdf',
          listItem: { fields: { driveId: 'listitem-drive-id' } },
        },
      };

      await step.execute(contextWithListItem);

      expect(sharepointApiService.downloadFileContent).toHaveBeenCalledWith(
        'listitem-drive-id',
        'test-file-id'
      );
    });

    it('should validate MIME type when restrictions are configured', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue(['application/pdf', 'text/plain']);

      await expect(step.execute({ ...mockContext })).resolves.not.toThrow();
    });

    it('should throw error for disallowed MIME type', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue(['text/plain']); // PDF not allowed

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'MIME type application/pdf is not allowed. Allowed types: text/plain'
      );
    });

    it('should handle SharePoint API errors', async () => {
      const apiError = new Error('SharePoint API failed');
      sharepointApiService.downloadFileContent.mockRejectedValue(apiError);

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'SharePoint API failed'
      );
    });

    it('should preserve original context properties', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue([]);

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
      expect(result.metadata.driveId).toBe('test-drive-id');
    });
  });

  describe('cleanup', () => {
    it('should complete cleanup without errors', async () => {
      await expect(step.cleanup(mockContext)).resolves.not.toThrow();
    });
  });

  describe('private methods behavior', () => {
    it('should handle case where no drive ID is found anywhere', async () => {
      const contextWithNoDriveId = {
        ...mockContext,
        metadata: {
          mimeType: 'application/pdf',
          someOtherField: 'value',
        },
      };

      await expect(step.execute(contextWithNoDriveId)).rejects.toThrow(
        'Drive ID not found in file metadata'
      );
    });

    it('should skip MIME type validation when no restrictions configured', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue([]); // Empty array = no restrictions

      const contextWithUnknownMimeType = {
        ...mockContext,
        metadata: {
          driveId: 'test-drive-id',
          mimeType: 'application/unknown-type',
        },
      };

      await expect(step.execute(contextWithUnknownMimeType)).resolves.not.toThrow();
    });

    it('should handle undefined allowedMimeTypes config', async () => {
      sharepointApiService.downloadFileContent.mockResolvedValue(mockContentBuffer);
      configService.get.mockReturnValue(undefined); // Undefined config

      await expect(step.execute({ ...mockContext })).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should not record metrics when execution fails', async () => {
      sharepointApiService.downloadFileContent.mockRejectedValue(new Error('Download failed'));

      try {
        await step.execute({ ...mockContext });
      } catch (error) {
        // Expected to throw
      }

      expect(metricsService.recordPipelineStepDuration).not.toHaveBeenCalled();
    });

    it('should handle large files', async () => {
      const largeMockBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      sharepointApiService.downloadFileContent.mockResolvedValue(largeMockBuffer);
      configService.get.mockReturnValue([]);

      const result = await step.execute({ ...mockContext });

      expect(result.contentBuffer).toBe(largeMockBuffer);
      expect(result.fileSize).toBe(largeMockBuffer.length);
    });
  });
});