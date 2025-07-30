import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { StorageUploadStep } from './storage-upload.step';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ProcessingContext, PipelineStep } from '../types/processing-context';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

// Mock the logger to prevent any potential issues
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  })),
}));

describe('StorageUploadStep', () => {
  let step: StorageUploadStep;
  let httpService: jest.Mocked<HttpService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockContext: ProcessingContext = {
    correlationId: 'test-correlation-id',
    fileId: 'test-file-id',
    fileName: 'test-document.pdf',
    fileSize: 156948,
    siteUrl: 'https://tenant.sharepoint.com/sites/testsite',
    libraryName: 'Documents',
    downloadUrl: 'https://graph.microsoft.com/download/file123',
    uniqueContentId: 'cont_test123',
    uploadUrl: 'https://storage.example.com/upload/test123',
    startTime: new Date(),
    contentBuffer: Buffer.from('test file content'),
    metadata: {
      siteId: 'site123',
      driveId: 'drive456',
      mimeType: 'application/pdf',
      webUrl: 'https://tenant.sharepoint.com/sites/testsite/documents/test-document.pdf',
    },
  };

  const mockHttpResponse: AxiosResponse = {
    status: 200,
    statusText: 'OK',
    data: {},
    headers: {},
    config: {} as any,
  };

  beforeEach(() => {
    // Create simple mocks
    httpService = {
      put: jest.fn(),
    } as any;

    metricsService = {
      recordPipelineStepDuration: jest.fn(),
    } as any;

    // Create step instance directly
    step = new StorageUploadStep(httpService, metricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully upload content to storage', async () => {
      httpService.put.mockReturnValue(of(mockHttpResponse));

      const result = await step.execute({ ...mockContext });

      expect(httpService.put).toHaveBeenCalledWith(
        mockContext.uploadUrl,
        mockContext.contentBuffer,
        {
          headers: {
            'Content-Type': 'application/pdf',
            'x-ms-blob-type': 'BlockBlob',
          },
        }
      );

      expect(result).toEqual(mockContext);
    }, 10000);

    it('should use default mime type when not provided', async () => {
      const contextWithoutMimeType = {
        ...mockContext,
        metadata: {
          ...mockContext.metadata,
          mimeType: undefined,
        },
      };

      httpService.put.mockReturnValue(of(mockHttpResponse));

      await step.execute(contextWithoutMimeType);

      expect(httpService.put).toHaveBeenCalledWith(
        mockContext.uploadUrl,
        mockContext.contentBuffer,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob',
          },
        }
      );
    }, 5000);

    it('should throw error when content buffer is missing', async () => {
      const contextWithoutBuffer = {
        ...mockContext,
        contentBuffer: undefined,
      };

      await expect(step.execute(contextWithoutBuffer)).rejects.toThrow(
        'Content buffer not found - content fetching may have failed'
      );

      expect(httpService.put).not.toHaveBeenCalled();
    }, 5000);

    it('should throw error when upload URL is missing', async () => {
      const contextWithoutUploadUrl = {
        ...mockContext,
        uploadUrl: undefined,
      };

      await expect(step.execute(contextWithoutUploadUrl)).rejects.toThrow(
        'Upload URL not found - content registration may have failed'
      );

      expect(httpService.put).not.toHaveBeenCalled();
    }, 5000);

    it('should throw error when HTTP request fails', async () => {
      const httpError = new Error('Network error');
      httpService.put.mockReturnValue(throwError(() => httpError));

      await expect(step.execute({ ...mockContext })).rejects.toThrow('Network error');

      expect(httpService.put).toHaveBeenCalledTimes(1);
    }, 5000);

    it('should record metrics on successful execution', async () => {
      httpService.put.mockReturnValue(of(mockHttpResponse));

      await step.execute({ ...mockContext });

      expect(metricsService.recordPipelineStepDuration).toHaveBeenCalledWith(
        PipelineStep.STORAGE_UPLOAD,
        expect.any(Number)
      );
    }, 5000);

    it('should throw error for non-success HTTP status codes', async () => {
      const errorResponse = { ...mockHttpResponse, status: 400, statusText: 'Bad Request' };
      httpService.put.mockReturnValue(of(errorResponse));

      await expect(step.execute({ ...mockContext })).rejects.toThrow(
        'Upload failed with status 400: Bad Request'
      );
    }, 5000);
  });

  describe('cleanup', () => {
    it('should release content buffer memory', async () => {
      const contextWithBuffer = { ...mockContext };

      await step.cleanup(contextWithBuffer);

      expect(contextWithBuffer.contentBuffer).toBeUndefined();
    }, 5000);
  });

  describe('stepName', () => {
    it('should have the correct step name', () => {
      expect(step.stepName).toBe(PipelineStep.STORAGE_UPLOAD);
    });
  });
});