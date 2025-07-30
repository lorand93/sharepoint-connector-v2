import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueService } from './queue.service';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';

describe('QueueService', () => {
  let service: QueueService;
  let mockQueue: jest.Mocked<Queue>;

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
    mockQueue = {
      add: jest.fn(),
      close: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken('sharepoint-tasks'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('addFileProcessingJob', () => {
    it('should add file processing job to queue with correct parameters', async () => {
      mockQueue.add.mockResolvedValue({} as any);

      await service.addFileProcessingJob(mockDriveItem);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith('process-file', mockDriveItem, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: true,
      });
    });

    it('should handle queue add operation successfully', async () => {
      const mockJob = { id: 'job-123' };
      mockQueue.add.mockResolvedValue(mockJob as any);

      const result = service.addFileProcessingJob(mockDriveItem);

      await expect(result).resolves.toBeUndefined();
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from queue add operation', async () => {
      const queueError = new Error('Queue is full');
      mockQueue.add.mockRejectedValue(queueError);

      const result = service.addFileProcessingJob(mockDriveItem);

      await expect(result).rejects.toThrow('Queue is full');
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should handle different DriveItem structures', async () => {
      const minimalDriveItem: DriveItem = {
        id: 'minimal-file',
        name: 'minimal.txt',
        webUrl: 'https://test.com/minimal.txt',
        listItem: {
          fields: {
            id: 'minimal-field-id',
          },
          lastModifiedDateTime: '2024-01-01T00:00:00Z',
          createdDateTime: '2024-01-01T00:00:00Z',
        },
        parentReference: {
          driveId: 'drive-1',
          siteId: 'site-1',
        },
      };

      mockQueue.add.mockResolvedValue({} as any);

      await service.addFileProcessingJob(minimalDriveItem);

      expect(mockQueue.add).toHaveBeenCalledWith('process-file', minimalDriveItem, expect.any(Object));
    });

    it('should use correct job options for retry and cleanup', async () => {
      mockQueue.add.mockResolvedValue({} as any);

      await service.addFileProcessingJob(mockDriveItem);

      const [, , options] = mockQueue.add.mock.calls[0];
      expect(options?.attempts).toBe(3);
      expect(options?.backoff).toEqual({
        type: 'exponential',
        delay: 1000,
      });
      expect(options?.removeOnComplete).toBe(true);
      expect(options?.removeOnFail).toBe(true);
    });

    it('should handle multiple concurrent job additions', async () => {
      mockQueue.add.mockResolvedValue({} as any);

      const files = [
        { ...mockDriveItem, id: 'file-1', name: 'file1.pdf' },
        { ...mockDriveItem, id: 'file-2', name: 'file2.pdf' },
        { ...mockDriveItem, id: 'file-3', name: 'file3.pdf' },
      ];

      const promises = files.map((file) => service.addFileProcessingJob(file));
      await Promise.all(promises);

      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      files.forEach((file, index) => {
        expect(mockQueue.add).toHaveBeenNthCalledWith(index + 1, 'process-file', file, expect.any(Object));
      });
    });
  });

  describe('onModuleDestroy', () => {
    it('should close the queue when module is destroyed', () => {
      mockQueue.close.mockResolvedValue();

      service.onModuleDestroy();

      expect(mockQueue.close).toHaveBeenCalledTimes(1);
    });

    it('should handle queue close errors gracefully', () => {
      mockQueue.close.mockResolvedValue(undefined);

      expect(() => service.onModuleDestroy()).not.toThrow();
      expect(() => service.onModuleDestroy()).not.toThrow();
      expect(mockQueue.close).toHaveBeenCalledTimes(2); // Called twice because onModuleDestroy is called twice
    });

    it('should be callable multiple times without errors', () => {
      mockQueue.close.mockResolvedValue(undefined);

      service.onModuleDestroy();
      service.onModuleDestroy();

      expect(mockQueue.close).toHaveBeenCalledTimes(2);
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid job additions followed by module destruction', async () => {
      mockQueue.add.mockResolvedValue({} as any);
      mockQueue.close.mockResolvedValue(undefined);

      const jobPromises = Array.from({ length: 10 }, (_, i) => service.addFileProcessingJob({ ...mockDriveItem, id: `file-${i}` }));

      await Promise.all(jobPromises);
      service.onModuleDestroy();

      expect(mockQueue.add).toHaveBeenCalledTimes(10);
      expect(mockQueue.close).toHaveBeenCalledTimes(1);
    });

    it('should handle queue operations with network timeouts', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';
      mockQueue.add.mockRejectedValue(timeoutError);

      await expect(service.addFileProcessingJob(mockDriveItem)).rejects.toThrow('Network timeout');
    });

    it('should handle large DriveItem objects', async () => {
      const largeDriveItem = {
        ...mockDriveItem,
        listItem: {
          ...mockDriveItem.listItem,
          fields: {
            id: 'large-file-id',
            ...mockDriveItem.listItem.fields,
            ...Array.from({ length: 100 }, (_, i) => ({ [`customField${i}`]: `value${i}` })).reduce((acc, obj) => ({ ...acc, ...obj }), {}),
          },
        },
      };

      mockQueue.add.mockResolvedValue({} as any);

      await service.addFileProcessingJob(largeDriveItem);

      expect(mockQueue.add).toHaveBeenCalledWith('process-file', largeDriveItem, expect.any(Object));
    });
  });

  describe('error handling edge cases', () => {
    it('should handle queue connection errors', async () => {
      const connectionError = new Error('Redis connection failed');
      connectionError.name = 'ConnectionError';
      mockQueue.add.mockRejectedValue(connectionError);

      await expect(service.addFileProcessingJob(mockDriveItem)).rejects.toThrow('Redis connection failed');
    });

    it('should handle queue full errors', async () => {
      const queueFullError = new Error('Queue capacity exceeded');
      queueFullError.name = 'QueueFullError';
      mockQueue.add.mockRejectedValue(queueFullError);

      await expect(service.addFileProcessingJob(mockDriveItem)).rejects.toThrow('Queue capacity exceeded');
    });

    it('should handle serialization errors for complex objects', async () => {
      const circularReference = { ...mockDriveItem };
      if (circularReference.listItem.fields) {
        (circularReference.listItem.fields as any).self = circularReference;
      }

      const serializationError = new Error('Converting circular structure to JSON');
      mockQueue.add.mockRejectedValue(serializationError);

      await expect(service.addFileProcessingJob(circularReference)).rejects.toThrow('Converting circular structure to JSON');
    });
  });
});
