import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import { TokenValidationStep } from './steps/token-validation.step';
import { ContentFetchingStep } from './steps/content-fetching.step';
import { ContentRegistrationStep } from './steps/content-registration.step';
import { StorageUploadStep } from './steps/storage-upload.step';
import { IngestionFinalizationStep } from './steps/ingestion-finalization.step';
import { MetricsService } from '../common/metrics/metrics.service';
import { ProcessingContext, PipelineResult } from './types/processing-context';
import { IPipelineStep } from './steps/pipeline-step.interface';

describe('PipelineService', () => {
  let service: PipelineService;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;
  let tokenValidationStep: jest.Mocked<TokenValidationStep>;
  let contentFetchingStep: jest.Mocked<ContentFetchingStep>;
  let contentRegistrationStep: jest.Mocked<ContentRegistrationStep>;
  let storageUploadStep: jest.Mocked<StorageUploadStep>;
  let ingestionFinalizationStep: jest.Mocked<IngestionFinalizationStep>;

  const createMockStep = (name: string): jest.Mocked<IPipelineStep> => ({
    stepName: name,
    execute: jest.fn(),
    cleanup: jest.fn(),
  });

  const mockDriveItem: DriveItem = {
    id: 'test-file-id-123',
    name: 'test-document.pdf',
    webUrl: 'https://tenant.sharepoint.com/sites/test/document.pdf',
    size: 1024000,
    lastModifiedDateTime: '2024-01-15T10:30:00Z',
    file: {
      mimeType: 'application/pdf',
    },
    parentReference: {
      driveId: 'test-drive-id-456',
      siteId: 'test-site-id-789',
      path: '/sites/test/documents',
    },
    listItem: {
      fields: {
        id: 'test-listitem-id',
        OData__ModerationStatus: 0,
      },
      lastModifiedDateTime: '2024-01-15T10:30:00Z',
      createdDateTime: '2024-01-15T10:30:00Z',
    },
  };

  beforeEach(async () => {
    // Create mocked services
    configService = {
    
    } as any;

    metricsService = {
      recordPipelineCompleted: jest.fn(),
      recordFileSize: jest.fn(),
    } as any;

    // Create mocked pipeline steps
    tokenValidationStep = createMockStep('token-validation') as any;
    
    contentRegistrationStep = createMockStep('content-registration') as any;
    storageUploadStep = createMockStep('storage-upload') as any;
    ingestionFinalizationStep = createMockStep('ingestion-finalization') as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineService,
        { provide: ConfigService, useValue: configService },
        { provide: MetricsService, useValue: metricsService },
        { provide: TokenValidationStep, useValue: tokenValidationStep },
        { provide: ContentFetchingStep, useValue: contentFetchingStep },
        { provide: ContentRegistrationStep, useValue: contentRegistrationStep },
        { provide: StorageUploadStep, useValue: storageUploadStep },
        { provide: IngestionFinalizationStep, useValue: ingestionFinalizationStep },
      ],
    }).compile();

    service = module.get<PipelineService>(PipelineService);
    
    // Setup default config values
    configService.get.mockImplementation((key: string) => {
    
      return undefined;
    });

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should configure step timeout from config', () => {
      expect(configService.get).toHaveBeenCalledWith('STEP_TIMEOUT_SECONDS');
    });
  });

  describe('processFile', () => {
    beforeEach(() => {
      // Setup successful execution mocks
      tokenValidationStep.execute.mockResolvedValue({} as ProcessingContext);
      
      contentRegistrationStep.execute.mockResolvedValue({} as ProcessingContext);
      storageUploadStep.execute.mockResolvedValue({} as ProcessingContext);
      ingestionFinalizationStep.execute.mockResolvedValue({} as ProcessingContext);
    });

    it('should successfully process a file through all steps', async () => {
      const result: PipelineResult = await service.processFile(mockDriveItem);

      expect(result.success).toBe(true);
      expect(result.context.fileId).toBe('test-file-id-123');
      expect(result.context.fileName).toBe('test-document.pdf');
      expect(result.context.correlationId).toBeDefined();
      expect(result.completedSteps).toHaveLength(5);
      expect(result.totalDuration).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

         it('should create correct processing context from DriveItem', async () => {
       await service.processFile(mockDriveItem);

       const contextArg = tokenValidationStep.execute.mock.calls[0][0];
       expect(contextArg.fileId).toBe('test-file-id-123');
       expect(contextArg.fileName).toBe('test-document.pdf');
       expect(contextArg.fileSize).toBe(1024000);
       expect(contextArg.siteUrl).toBe('test-site-id-789');
       expect(contextArg.libraryName).toBe('test-drive-id-456');
       expect(contextArg.downloadUrl).toBe('https://tenant.sharepoint.com/sites/test/document.pdf');
       expect(contextArg.correlationId).toBeDefined();
       expect(contextArg.startTime).toBeInstanceOf(Date);
       // The metadata contains the DriveItem properties spread
       expect(contextArg.metadata.id).toBe('test-file-id-123');
      
       expect(contextArg.metadata.driveId).toBe('test-drive-id-456');
       expect(contextArg.metadata.siteId).toBe('test-site-id-789');
     });

    it('should execute all pipeline steps in correct order', async () => {
      await service.processFile(mockDriveItem);

      expect(tokenValidationStep.execute).toHaveBeenCalledTimes(1);
      expect(contentFetchingStep.execute).toHaveBeenCalledTimes(1);
      expect(contentRegistrationStep.execute).toHaveBeenCalledTimes(1);
      expect(storageUploadStep.execute).toHaveBeenCalledTimes(1);
      expect(ingestionFinalizationStep.execute).toHaveBeenCalledTimes(1);

      // Verify order of execution
      const callOrder = [
      
        contentFetchingStep.execute.mock.invocationCallOrder[0],
        contentRegistrationStep.execute.mock.invocationCallOrder[0],
        storageUploadStep.execute.mock.invocationCallOrder[0],
        ingestionFinalizationStep.execute.mock.invocationCallOrder[0],
      ];
      
      expect(callOrder).toEqual([...callOrder].sort((a, b) => a - b));
    });

    it('should record metrics on successful completion', async () => {
      await service.processFile(mockDriveItem);

      expect(metricsService.recordPipelineCompleted).toHaveBeenCalledWith(true, expect.any(Number));
      expect(metricsService.recordFileSize).toHaveBeenCalledWith(1024000);
    });

         it('should handle step failure and return error result', async () => {
       const stepError = new Error('Step failed');
       tokenValidationStep.execute.mockImplementation(() => 
         new Promise((_, reject) => setTimeout(() => reject(stepError), 1))
       );

       const result: PipelineResult = await service.processFile(mockDriveItem);

       expect(result.success).toBe(false);
       expect(result.error).toBe(stepError);
       expect(result.completedSteps).toHaveLength(0);
       expect(result.totalDuration).toBeGreaterThan(0);
       expect(metricsService.recordPipelineCompleted).toHaveBeenCalledWith(false, expect.any(Number));
     });

    it('should stop execution and cleanup on step failure', async () => {
      const stepError = new Error('Content fetching failed');
      contentFetchingStep.execute.mockRejectedValue(stepError);

      await service.processFile(mockDriveItem);

      // First step should have completed
      expect(tokenValidationStep.execute).toHaveBeenCalledTimes(1);
      // Second step should have failed
      expect(contentFetchingStep.execute).toHaveBeenCalledTimes(1);
      // Subsequent steps should not have been called
      expect(contentRegistrationStep.execute).not.toHaveBeenCalled();
      expect(storageUploadStep.execute).not.toHaveBeenCalled();
      expect(ingestionFinalizationStep.execute).not.toHaveBeenCalled();
      
      // Failed step should have cleanup called
      expect(contentFetchingStep.cleanup).toHaveBeenCalledTimes(1);
    });

      
      // Mock a step that takes longer than timeout
      contentFetchingStep.execute.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 35000)) // 35 seconds > 30 second timeout
      );

      const result = await service.processFile(mockDriveItem);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timed out after');
    }, 40000); // Increase test timeout to accommodate the timeout test

         it('should handle DriveItem with missing optional fields', async () => {
       const minimalDriveItem: DriveItem = {
         id: 'test-id',
         name: 'test.txt',
         webUrl: 'https://test.com/file.txt',
         listItem: {
           fields: {},
           lastModifiedDateTime: '2024-01-01T00:00:00Z',
           createdDateTime: '2024-01-01T00:00:00Z',
         },
         parentReference: {
           driveId: '',
           siteId: '',
         },
       } as DriveItem;

      const result = await service.processFile(minimalDriveItem);

      expect(result.success).toBe(true);
      expect(result.context.fileSize).toBe(0);
      expect(result.context.siteUrl).toBe('');
      expect(result.context.libraryName).toBe('');
    });

         it('should handle cleanup errors gracefully', async () => {
       const stepError = new Error('Step failed');
       const cleanupError = new Error('Cleanup failed');
      
       // Make content fetching step have cleanup method that fails
       contentFetchingStep.execute.mockRejectedValue(stepError);
       contentFetchingStep.cleanup!.mockRejectedValue(cleanupError);

       const result = await service.processFile(mockDriveItem);

       expect(result.success).toBe(false);
       expect(result.error).toBe(stepError); // Original error should be preserved
       expect(contentFetchingStep.cleanup).toHaveBeenCalledTimes(1);
     });

    it('should perform final cleanup on successful completion', async () => {
      const contextWithBuffer = {} as ProcessingContext;
      contextWithBuffer.contentBuffer = Buffer.from('test content');
      tokenValidationStep.execute.mockResolvedValue(contextWithBuffer);

      const result = await service.processFile(mockDriveItem);

      expect(result.success).toBe(true);
      expect(result.context.contentBuffer).toBeUndefined();
      expect(result.context.metadata).toEqual({});
    });

      
      // This test ensures that final cleanup errors don't affect the result
      const originalContext = { contentBuffer: Buffer.from('test') } as ProcessingContext;
      tokenValidationStep.execute.mockResolvedValue(originalContext);

      const result = await service.processFile(mockDriveItem);

      expect(result.success).toBe(true);
    });
  });

  describe('step timeout configuration', () => {
    it('should use default timeout when config value is not provided', async () => {
      configService.get.mockReturnValue(undefined);
      
      // Create a new service instance to test constructor behavior
      const moduleWithoutTimeout: TestingModule = await Test.createTestingModule({
        providers: [
          PipelineService,
          { provide: ConfigService, useValue: configService },
          { provide: MetricsService, useValue: metricsService },
          { provide: TokenValidationStep, useValue: tokenValidationStep },
          { provide: ContentFetchingStep, useValue: contentFetchingStep },
          { provide: ContentRegistrationStep, useValue: contentRegistrationStep },
          { provide: StorageUploadStep, useValue: storageUploadStep },
          { provide: IngestionFinalizationStep, useValue: ingestionFinalizationStep },
        ],
      }).compile();

      const serviceWithDefault = moduleWithoutTimeout.get<PipelineService>(PipelineService);
      expect(serviceWithDefault).toBeDefined();
    });

    it('should use custom timeout when config value is provided', async () => {
      configService.get.mockReturnValue(60); // 60 seconds
      
      const moduleWithTimeout: TestingModule = await Test.createTestingModule({
        providers: [
          PipelineService,
          { provide: ConfigService, useValue: configService },
          { provide: MetricsService, useValue: metricsService },
          { provide: TokenValidationStep, useValue: tokenValidationStep },
          { provide: ContentFetchingStep, useValue: contentFetchingStep },
          { provide: ContentRegistrationStep, useValue: contentRegistrationStep },
          { provide: StorageUploadStep, useValue: storageUploadStep },
          { provide: IngestionFinalizationStep, useValue: ingestionFinalizationStep },
        ],
      }).compile();

      const serviceWithCustomTimeout = moduleWithTimeout.get<PipelineService>(PipelineService);
      expect(serviceWithCustomTimeout).toBeDefined();
    });
  });
});
