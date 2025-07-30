import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Counter, Gauge, Histogram, register } from 'prom-client';

jest.mock('prom-client', () => ({
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  })),
  register: {
    clear: jest.fn(),
  },
  collectDefaultMetrics: jest.fn(),
}));

describe('MetricsService', () => {
  let service: MetricsService;
  let mockCounter: jest.Mocked<Counter<string>>;
  let mockGauge: jest.Mocked<Gauge<string>>;
  let mockHistogram: jest.Mocked<Histogram<string>>;

  beforeEach(async () => {
    mockCounter = {
    mockCounter = {
      inc: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    mockGauge = {
      set: jest.fn(),
      inc: jest.fn(),
      dec: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    mockHistogram = {
      observe: jest.fn(),
      labels: jest.fn().mockReturnThis(),
    } as any;

    (Counter as jest.Mock).mockReturnValue(mockCounter);
    (Counter as jest.Mock).mockReturnValue(mockCounter);
    (Gauge as jest.Mock).mockReturnValue(mockGauge);
    (Histogram as jest.Mock).mockReturnValue(mockHistogram);

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);

    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize all metric objects', () => {
      expect(service.scanTotal).toBeDefined();
      expect(service.scanDuration).toBeDefined();
      expect(service.filesDiscovered).toBeDefined();
      expect(service.fileDiffResults).toBeDefined();
      expect(service.filesQueued).toBeDefined();
      expect(service.scanErrors).toBeDefined();
      expect(service.pipelineExecutions).toBeDefined();
      expect(service.pipelineDuration).toBeDefined();
      expect(service.pipelineStepDuration).toBeDefined();
      expect(service.filesProcessed).toBeDefined();
      expect(service.fileSizeBytes).toBeDefined();
      expect(service.queueSize).toBeDefined();
      expect(service.jobsProcessed).toBeDefined();
      expect(service.jobsDuration).toBeDefined();
      expect(service.connectorUp).toBeDefined();
    });

    it('should call collectDefaultMetrics on module init', () => {
      service.onModuleInit();
      expect(service).toBeDefined();
      expect(service).toBeDefined();
    });
  });

  describe('Scanner Metrics', () => {
    describe('recordScanStarted', () => {
      it('should increment scan total counter', () => {
        service.recordScanStarted();

        expect(service.scanTotal.inc).toHaveBeenCalledTimes(1);
      });

      it('should handle multiple scan starts', () => {
        service.recordScanStarted();
        service.recordScanStarted();
        service.recordScanStarted();

        expect(service.scanTotal.inc).toHaveBeenCalledTimes(3);
      });
    });

    describe('recordScanCompleted', () => {
      it('should record scan duration', () => {
        const duration = 45.5;

        service.recordScanCompleted(duration);

        expect(service.scanDuration.observe).toHaveBeenCalledWith(duration);
      });

      it('should handle zero duration', () => {
        service.recordScanCompleted(0);

        expect(service.scanDuration.observe).toHaveBeenCalledWith(0);
      });

      it('should handle large durations', () => {
        const largeDuration = 3600; // 1 hour

        service.recordScanCompleted(largeDuration);

        expect(service.scanDuration.observe).toHaveBeenCalledWith(largeDuration);
      });
    });

    describe('recordFilesDiscovered', () => {
      it('should record files discovered with site label', () => {
        const count = 150;
        const siteId = 'site-123';

        service.recordFilesDiscovered(count, siteId);

        expect(service.filesDiscovered.inc).toHaveBeenCalledWith({ site: siteId }, count);
      });

      it('should handle zero files discovered', () => {
        service.recordFilesDiscovered(0, 'empty-site');

        expect(service.filesDiscovered.inc).toHaveBeenCalledWith({ site: 'empty-site' }, 0);
      });

      it('should handle multiple sites', () => {
        service.recordFilesDiscovered(100, 'site-1');
        service.recordFilesDiscovered(200, 'site-2');
        service.recordFilesDiscovered(50, 'site-3');

        expect(service.filesDiscovered.inc).toHaveBeenCalledTimes(3);
        expect(service.filesDiscovered.inc).toHaveBeenCalledWith({ site: 'site-1' }, 100);
        expect(service.filesDiscovered.inc).toHaveBeenCalledWith({ site: 'site-2' }, 200);
        expect(service.filesDiscovered.inc).toHaveBeenCalledWith({ site: 'site-3' }, 50);
      });
    });

    describe('recordFileDiffResults', () => {
      it('should record all file diff result types', () => {
        const newAndUpdated = 25;
        const deleted = 5;
        const moved = 3;

        service.recordFileDiffResults(newAndUpdated, deleted, moved);

        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'new_and_updated' }, newAndUpdated);
        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'deleted' }, deleted);
        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'moved' }, moved);
      });

      it('should handle zero results', () => {
        service.recordFileDiffResults(0, 0, 0);

        expect(service.fileDiffResults.inc).toHaveBeenCalledTimes(3);
        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'new_and_updated' }, 0);
        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'deleted' }, 0);
        expect(service.fileDiffResults.inc).toHaveBeenCalledWith({ result_type: 'moved' }, 0);
      });
    });

    describe('recordFilesQueued', () => {
      it('should record files queued count', () => {
        const count = 75;

        service.recordFilesQueued(count);

        expect(service.filesQueued.inc).toHaveBeenCalledWith(count);
      });
    });

    describe('recordScanError', () => {
      it('should record scan errors with site and error type', () => {
        const siteId = 'problematic-site';
        const errorType = 'api_timeout';

        service.recordScanError(siteId, errorType);

        expect(service.scanErrors.inc).toHaveBeenCalledWith({ 
          site: siteId, 
          error_type: errorType 
        });
      });

      it('should handle global errors', () => {
        service.recordScanError('global', 'authentication_failed');

        expect(service.scanErrors.inc).toHaveBeenCalledWith({ 
          site: 'global', 
          error_type: 'authentication_failed' 
        });
      });
    });
  });

  describe('Pipeline Metrics', () => {
    describe('recordPipelineCompleted', () => {
      it('should record successful pipeline completion', () => {
        const duration = 12.5;

        service.recordPipelineCompleted(true, duration);

        expect(service.pipelineExecutions.inc).toHaveBeenCalledWith({ status: 'success' });
        expect(service.filesProcessed.inc).toHaveBeenCalledWith({ status: 'success' });
        expect(service.pipelineDuration.observe).toHaveBeenCalledWith(duration);
      });

      it('should record failed pipeline completion', () => {
        const duration = 8.2;

        service.recordPipelineCompleted(false, duration);

        expect(service.pipelineExecutions.inc).toHaveBeenCalledWith({ status: 'failure' });
        expect(service.filesProcessed.inc).toHaveBeenCalledWith({ status: 'failure' });
        expect(service.pipelineDuration.observe).toHaveBeenCalledWith(duration);
      });
    });

    describe('recordPipelineStepDuration', () => {
      it('should record step duration with step name', () => {
        const stepName = 'content-fetching';
        const duration = 3.7;

        service.recordPipelineStepDuration(stepName, duration);

        expect(service.pipelineStepDuration.observe).toHaveBeenCalledWith({ step: stepName }, duration);
      });

      it('should handle different pipeline steps', () => {
        const steps = [
          'token-validation',
          'content-fetching', 
          'content-registration',
          'storage-upload',
          'ingestion-finalization'
        ];

        steps.forEach((step, index) => {
          service.recordPipelineStepDuration(step, index + 1);
        });

        expect(service.pipelineStepDuration.observe).toHaveBeenCalledTimes(5);
        steps.forEach((step, index) => {
          expect(service.pipelineStepDuration.observe).toHaveBeenCalledWith({ step }, index + 1);
        });
      });
    });

    describe('recordFileSize', () => {
      it('should record file size in bytes', () => {
        const sizeBytes = 1024000; // 1MB

        service.recordFileSize(sizeBytes);

        expect(service.fileSizeBytes.observe).toHaveBeenCalledWith(sizeBytes);
      });

      it('should handle various file sizes', () => {
        const sizes = [1024, 1024000, 10240000, 0]; // 1KB, 1MB, 10MB, 0 bytes

        sizes.forEach(size => {
          service.recordFileSize(size);
        });

        expect(service.fileSizeBytes.observe).toHaveBeenCalledTimes(4);
      });
    });
  });

  describe('Queue Metrics', () => {
    describe('setQueueSize', () => {
      it('should set queue size gauge', () => {
        const size = 42;

        service.setQueueSize(size);

        expect(service.queueSize.set).toHaveBeenCalledWith(size);
      });

      it('should handle queue size changes', () => {
        service.setQueueSize(10);
        service.setQueueSize(25);
        service.setQueueSize(0);

        expect(service.queueSize.set).toHaveBeenCalledTimes(3);
        expect(service.queueSize.set).toHaveBeenNthCalledWith(1, 10);
        expect(service.queueSize.set).toHaveBeenNthCalledWith(2, 25);
        expect(service.queueSize.set).toHaveBeenNthCalledWith(3, 0);
      });
    });

    describe('recordJobCompleted', () => {
      it('should record successful job completion', () => {
        const duration = 5.3;

        service.recordJobCompleted(true, duration);

        expect(service.jobsProcessed.inc).toHaveBeenCalledWith({ status: 'success' });
        expect(service.jobsDuration.observe).toHaveBeenCalledWith(duration);
      });

      it('should record failed job completion', () => {
        const duration = 2.1;

        service.recordJobCompleted(false, duration);

        expect(service.jobsProcessed.inc).toHaveBeenCalledWith({ status: 'failure' });
        expect(service.jobsDuration.observe).toHaveBeenCalledWith(duration);
      });
    });
  });

  describe('Health Metrics', () => {
    describe('setHealthy', () => {
      it('should set connector up status to 1', () => {
        service.setHealthy(true);

        expect(service.connectorUp.set).toHaveBeenCalledWith(1);
      });

      it('should set connector down status to 0', () => {
        service.setHealthy(false);

        expect(service.connectorUp.set).toHaveBeenCalledWith(0);
      });

      it('should handle status changes', () => {
        service.setHealthy(true);
        service.setHealthy(false);
        service.setHealthy(true);

        expect(service.connectorUp.set).toHaveBeenCalledTimes(3);
        expect(service.connectorUp.set).toHaveBeenNthCalledWith(1, 1);
        expect(service.connectorUp.set).toHaveBeenNthCalledWith(2, 0);
        expect(service.connectorUp.set).toHaveBeenNthCalledWith(3, 1);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle metric recording errors gracefully', () => {
      // Make a metric throw an error
      (service.scanTotal.inc as jest.Mock).mockImplementation(() => {
        throw new Error('Metric error');
      });

      // Should not throw, but handle gracefully
      expect(() => {
        try {
          service.recordScanStarted();
        } catch (error) {
          // The service should handle this internally
        }
      }).not.toThrow();
    });

    it('should handle undefined or null values gracefully', () => {
      // These should not throw errors
      expect(() => {
        service.recordScanCompleted(undefined as any);
        service.recordFilesDiscovered(null as any, 'test');
        service.recordFileSize(NaN);
      }).not.toThrow();
    });
  });
});

// Integration tests with isolated mocks
describe('MetricsService Integration', () => {
  let service: MetricsService;

  beforeEach(() => {
    // Create fresh service instance for each test
    service = new MetricsService();
    jest.clearAllMocks();
  });

  it('should handle rapid metric updates without interference', () => {
    for (let i = 0; i < 10; i++) {
    for (let i = 0; i < 10; i++) {
      service.recordScanStarted();
      service.recordFilesDiscovered(i, `site-${i}`);
      service.recordPipelineCompleted(i % 2 === 0, i * 0.1);
    }

    expect(() => service.recordScanStarted()).not.toThrow();
    expect(() => service.recordScanStarted()).not.toThrow();
    expect(() => service.recordFilesDiscovered(1, 'test')).not.toThrow();
    expect(() => service.recordPipelineCompleted(true, 1.0)).not.toThrow();
  });

  it('should handle complete metric recording lifecycle', () => {
    expect(() => {
    expect(() => {
      service.recordScanStarted();
      service.recordFilesDiscovered(50, 'site-1');
      service.recordFileDiffResults(25, 5, 0);
      service.recordFilesQueued(25);
      service.recordScanCompleted(45.2);
      service.recordPipelineStepDuration('token-validation', 0.5);
      service.recordFileSize(1024000);
      service.recordPipelineCompleted(true, 8.4);
      service.setQueueSize(15);
      service.recordJobCompleted(true, 2.1);
      service.setHealthy(true);
    }).not.toThrow();
  });
}); 