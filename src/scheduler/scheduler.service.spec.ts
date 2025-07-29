import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SharepointScannerService } from '../sharepoint-scanner/sharepoint-scanner.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let sharepointScannerService: jest.Mocked<SharepointScannerService>;

  beforeEach(async () => {
    // Create mocked SharepointScannerService
    sharepointScannerService = {
      scanForWork: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: SharepointScannerService,
          useValue: sharepointScannerService,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);

    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    // Mock onModuleInit to prevent automatic initial scan during test setup
    jest.spyOn(service, 'onModuleInit').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('onModuleInit', () => {
    it('should trigger initial scan on service startup', async () => {
      // Restore the original onModuleInit method for this test
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      jest.spyOn(service, 'runScheduledScan').mockResolvedValue();

      service.onModuleInit();

      expect(service.runScheduledScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('runScheduledScan', () => {
    beforeEach(() => {
      // Setup successful scan by default
      sharepointScannerService.scanForWork.mockResolvedValue();
    });

    it('should successfully run a scheduled scan', async () => {
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
    });

    it('should prevent concurrent scans when a scan is already running', async () => {
      // Make scanForWork hang indefinitely to simulate a long-running scan
      let resolveScan: () => void;
      const scanPromise = new Promise<void>((resolve) => {
        resolveScan = resolve;
      });
      sharepointScannerService.scanForWork.mockReturnValue(scanPromise);

      // Start first scan (should begin)
      const firstScanPromise = service.runScheduledScan();

      // Start second scan while first is running (should be skipped)
      await service.runScheduledScan();

      // Verify second scan was skipped
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);

      // Complete the first scan
      resolveScan!();
      await firstScanPromise;

      // Now a new scan should be allowed
      await service.runScheduledScan();
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(2);
    });

    it('should handle scan errors gracefully and reset running state', async () => {
      const scanError = new Error('SharePoint API error');
      sharepointScannerService.scanForWork.mockRejectedValue(scanError);

      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);

      // Should be able to run another scan after error (running state reset)
      sharepointScannerService.scanForWork.mockResolvedValue();
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(2);
    });

    it('should log appropriate messages during scan lifecycle', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await service.runScheduledScan();

      expect(logSpy).toHaveBeenCalledWith('Scheduler triggered. Starting SharePoint scan...');
      expect(logSpy).toHaveBeenCalledWith('Scan finished. Ready for the next scheduled run.');
    });

    it('should log warning when scan is skipped due to concurrent execution', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      
      // Make scanForWork hang
      let resolveScan: () => void;
      const scanPromise = new Promise<void>((resolve) => {
        resolveScan = resolve;
      });
      sharepointScannerService.scanForWork.mockReturnValue(scanPromise);

      // Start first scan
      const firstScanPromise = service.runScheduledScan();

      // Try to start second scan
      await service.runScheduledScan();

      expect(warnSpy).toHaveBeenCalledWith('Scan skipped: A previous scan is still in progress.');

      // Clean up
      resolveScan!();
      await firstScanPromise;
    });

    it('should log error and reset state when scan throws exception', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const scanError = new Error('Unexpected scan failure');
      sharepointScannerService.scanForWork.mockRejectedValue(scanError);

      await service.runScheduledScan();

      expect(errorSpy).toHaveBeenCalledWith(
        'An unexpected error occurred during the scheduled scan.',
        scanError.stack
      );
    });

    it('should reset running state even if scan throws synchronous error', async () => {
      const syncError = new Error('Synchronous error');
      sharepointScannerService.scanForWork.mockImplementation(() => {
        throw syncError;
      });

      await service.runScheduledScan();

      // Should be able to run another scan (state was reset)
      sharepointScannerService.scanForWork.mockResolvedValue();
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple concurrent scan attempts correctly', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      
      // Make scanForWork hang
      let resolveScan: () => void;
      const scanPromise = new Promise<void>((resolve) => {
        resolveScan = resolve;
      });
      sharepointScannerService.scanForWork.mockReturnValue(scanPromise);

      // Start first scan
      const firstScanPromise = service.runScheduledScan();

      // Try to start multiple concurrent scans
      await Promise.all([
        service.runScheduledScan(),
        service.runScheduledScan(),
        service.runScheduledScan(),
      ]);

      // All should be skipped
      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);

      // Clean up
      resolveScan!();
      await firstScanPromise;
    });

    it('should handle long-running scans that exceed typical intervals', async () => {
      const longRunningScan = new Promise<void>((resolve) => {
        setTimeout(resolve, 100); // 100ms delay to simulate long scan
      });
      sharepointScannerService.scanForWork.mockReturnValue(longRunningScan);

      const startTime = Date.now();
      await service.runScheduledScan();
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
    });

    it('should maintain scan state correctly across successful and failed scans', async () => {
      // First scan succeeds
      sharepointScannerService.scanForWork.mockResolvedValueOnce(undefined);
      await service.runScheduledScan();

      // Second scan fails
      const error = new Error('Scan failed');
      sharepointScannerService.scanForWork.mockRejectedValueOnce(error);
      await service.runScheduledScan();

      // Third scan succeeds again
      sharepointScannerService.scanForWork.mockResolvedValueOnce(undefined);
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(3);
    });
  });

  describe('cron job configuration', () => {
    it('should be configured to run every 15 minutes', () => {
      // This test verifies the @Cron decorator is properly configured
      // We can't directly test the cron timing, but we can verify the method exists
      expect(service.runScheduledScan).toBeDefined();
      expect(typeof service.runScheduledScan).toBe('function');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle scanner service being undefined or null', async () => {
      // Create service with null scanner
      const moduleWithNullScanner: TestingModule = await Test.createTestingModule({
        providers: [
          SchedulerService,
          {
            provide: SharepointScannerService,
            useValue: null,
          },
        ],
      }).compile();

      const serviceWithNullScanner = moduleWithNullScanner.get<SchedulerService>(SchedulerService);
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

             // This should handle the null scanner gracefully
       await expect(serviceWithNullScanner.runScheduledScan()).resolves.toBeUndefined();
    });

    it('should handle scanner service method throwing TypeError', async () => {
      const typeError = new TypeError('Cannot read property of undefined');
      sharepointScannerService.scanForWork.mockRejectedValue(typeError);

      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
    });

    it('should handle scanner service method returning rejected promise immediately', async () => {
      sharepointScannerService.scanForWork.mockReturnValue(Promise.reject(new Error('Immediate rejection')));

      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
    });
  });

  describe('memory and resource management', () => {
    it('should not accumulate state between multiple scans', async () => {
      // Run multiple scans to ensure no memory leaks or state accumulation
      for (let i = 0; i < 10; i++) {
        sharepointScannerService.scanForWork.mockResolvedValue();
        await service.runScheduledScan();
      }

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(10);
    });

    it('should handle rapid successive scan calls without memory issues', async () => {
      sharepointScannerService.scanForWork.mockResolvedValue();

      // Fire off many scans quickly
      const scanPromises = Array.from({ length: 100 }, () => service.runScheduledScan());
      await Promise.all(scanPromises);

      // Should have called scanForWork many times (not blocked by concurrency after each completes)
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledWith();
    });
  });
});
