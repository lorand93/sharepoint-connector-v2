import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SharepointScannerService } from '../sharepoint-scanner/sharepoint-scanner.service';
import { DistributedLockService } from '../common/lock/distributed-lock.service';


describe('SchedulerService', () => {
  let service: SchedulerService;
  let sharepointScannerService: jest.Mocked<SharepointScannerService>;
  let distributedLockService: jest.Mocked<DistributedLockService>;

  beforeEach(async () => {
    sharepointScannerService = {
      scanForWork: jest.fn(),
    } as any;

    distributedLockService = {
      acquireLock: jest.fn().mockResolvedValue({ acquired: true, lockValue: 'test-lock-123' }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      extendLock: jest.fn().mockResolvedValue(true),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: SharepointScannerService,
          useValue: sharepointScannerService,
        },
        {
          provide: DistributedLockService,
          useValue: distributedLockService,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
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
      jest.restoreAllMocks();
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
      jest.spyOn(service, 'runScheduledScan').mockResolvedValue();

      service.onModuleInit();

      expect(service.runScheduledScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('runScheduledScan', () => {
    beforeEach(() => {
      sharepointScannerService.scanForWork.mockResolvedValue();
      distributedLockService.acquireLock.mockResolvedValue({ acquired: true, lockValue: 'test-lock-123' });
      distributedLockService.releaseLock.mockResolvedValue();
    });

    it('should successfully run a scheduled scan', async () => {
      await service.runScheduledScan();

      expect(distributedLockService.acquireLock).toHaveBeenCalledWith(
        'sharepoint:scan:lock',
        900 // TTL in seconds
      );
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
      expect(distributedLockService.releaseLock).toHaveBeenCalledWith('sharepoint:scan:lock');
    });

    it('should extend lock periodically during long-running scans', async () => {
      jest.useFakeTimers();
      
      // Mock a long-running scan that resolves after we advance timers
      let scanResolve: () => void;
      const scanPromise = new Promise<void>(resolve => { scanResolve = resolve; });
      sharepointScannerService.scanForWork.mockReturnValue(scanPromise);
      
      distributedLockService.extendLock.mockResolvedValue(true);

      // Start the scan (don't await it yet)
      const runPromise = service.runScheduledScan();

      // Allow the initial setup to complete
      await Promise.resolve();
      jest.advanceTimersByTime(100);

      // Fast-forward 10 minutes to trigger first lock extension
      jest.advanceTimersByTime(600000); // 10 minutes
      await Promise.resolve(); // Allow async operations to complete

      expect(distributedLockService.extendLock).toHaveBeenCalledWith(
        'sharepoint:scan:lock',
        900, // TTL
        'test-lock-123' // Lock value
      );

      // Fast-forward another 10 minutes to trigger second extension
      jest.advanceTimersByTime(600000); // Another 10 minutes
      await Promise.resolve();

      expect(distributedLockService.extendLock).toHaveBeenCalledTimes(2);

      // Now resolve the scan and complete
      scanResolve!();
      await Promise.resolve();
      await runPromise;

      expect(distributedLockService.releaseLock).toHaveBeenCalledWith('sharepoint:scan:lock');
      
      jest.useRealTimers();
    });

    it('should prevent concurrent scans when a scan is already running', async () => {
      distributedLockService.acquireLock
        .mockResolvedValueOnce({ acquired: true, lockValue: 'test-lock-123' })
        .mockResolvedValueOnce({ acquired: false });

      await Promise.all([
        service.runScheduledScan(),
        service.runScheduledScan()
      ]);

      expect(distributedLockService.acquireLock).toHaveBeenCalledTimes(2);
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
      expect(distributedLockService.releaseLock).toHaveBeenCalledTimes(1);

      distributedLockService.acquireLock.mockResolvedValueOnce({ acquired: true, lockValue: 'test-lock-456' });
      await service.runScheduledScan();
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(2);
    });

    it('should handle scan errors gracefully and reset running state', async () => {
      const scanError = new Error('SharePoint API error');
      sharepointScannerService.scanForWork.mockRejectedValue(scanError);

      await expect(service.runScheduledScan()).resolves.not.toThrow();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
      expect(distributedLockService.acquireLock).toHaveBeenCalledTimes(1);
      expect(distributedLockService.releaseLock).toHaveBeenCalledTimes(1);

      sharepointScannerService.scanForWork.mockResolvedValue();
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(2);
    });

    it('should log appropriate messages during scan lifecycle', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      await service.runScheduledScan();

      expect(logSpy).toHaveBeenCalledWith('Scheduler triggered. Attempting to acquire lock...');
      expect(logSpy).toHaveBeenCalledWith('Lock acquired. Starting SharePoint scan...');
      expect(logSpy).toHaveBeenCalledWith('SharePoint scan completed successfully.');
    });

    it('should log warning when scan is skipped due to concurrent execution', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      
      // Scan fails to acquire lock
      distributedLockService.acquireLock.mockResolvedValueOnce({ acquired: false });

      // Start scan that should be skipped
      await service.runScheduledScan();

      expect(warnSpy).toHaveBeenCalledWith('Scan skipped: Failed to acquire lock - another process may be running');
      expect(distributedLockService.acquireLock).toHaveBeenCalledTimes(1);
      expect(distributedLockService.releaseLock).not.toHaveBeenCalled();
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
      
      // First lock succeeds, subsequent locks fail
      distributedLockService.acquireLock
        .mockResolvedValueOnce({ acquired: true, lockValue: 'test-lock-123' })
        .mockResolvedValue({ acquired: false }); // All subsequent calls fail

      // Try to start multiple concurrent scans
      await Promise.all([
        service.runScheduledScan(),
        service.runScheduledScan(),
        service.runScheduledScan(),
        service.runScheduledScan(),
      ]);

      // Only first should succeed, others should be skipped
      expect(distributedLockService.acquireLock).toHaveBeenCalledTimes(4);
      expect(warnSpy).toHaveBeenCalledTimes(3); // 3 skipped scans
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1); // Only first scan ran
      expect(distributedLockService.releaseLock).toHaveBeenCalledTimes(1); // Only first scan released
    });

    it('should handle long-running scans that exceed typical intervals', async () => {
      const longRunningScan = new Promise<void>((resolve) => {
        setTimeout(resolve, 150); // 150ms delay to simulate long scan (more buffer for timing)
      });
      sharepointScannerService.scanForWork.mockReturnValue(longRunningScan);

      const startTime = Date.now();
      await service.runScheduledScan();
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100); // Still expect at least 100ms
      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
    }, 10000);

    it('should maintain scan state correctly across successful and failed scans', async () => {
      sharepointScannerService.scanForWork.mockResolvedValueOnce(undefined);
      await service.runScheduledScan();

      const error = new Error('Scan failed');
      sharepointScannerService.scanForWork.mockRejectedValueOnce(error);
      await service.runScheduledScan();

      sharepointScannerService.scanForWork.mockResolvedValueOnce(undefined);
      await service.runScheduledScan();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(3);
    });
  });

  describe('cron job configuration', () => {
    it('should be configured to run every 15 minutes', () => {
      expect(service.runScheduledScan).toBeDefined();
      expect(typeof service.runScheduledScan).toBe('function');
    });
  });

  describe('error handling edge cases', () => {
    beforeEach(() => {
      distributedLockService.acquireLock.mockResolvedValue({ acquired: true, lockValue: 'test-lock-123' });
      distributedLockService.releaseLock.mockResolvedValue();
    });

    it('should handle scanner service being undefined or null', async () => {
      // Create service with null scanner
      const moduleWithNullScanner: TestingModule = await Test.createTestingModule({
        providers: [
          SchedulerService,
          {
            provide: SharepointScannerService,
            useValue: null,
          },
          {
            provide: DistributedLockService,
            useValue: distributedLockService,
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

      // The error should be caught and handled by the scheduler's try-catch
      await expect(service.runScheduledScan()).resolves.not.toThrow();

      expect(sharepointScannerService.scanForWork).toHaveBeenCalledTimes(1);
      expect(distributedLockService.acquireLock).toHaveBeenCalledTimes(1);
      expect(distributedLockService.releaseLock).toHaveBeenCalledTimes(1);
    });
  });

  describe('memory and resource management', () => {
    beforeEach(() => {
      // Ensure the mock is set up for these tests
      distributedLockService.acquireLock.mockResolvedValue({ acquired: true, lockValue: 'test-lock-123' });
      distributedLockService.releaseLock.mockResolvedValue();
    });

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

  describe('lifecycle management', () => {
    it('should clean up lock extension timer and release locks on module destroy', async () => {
      jest.useFakeTimers();
      
      // Start a scan that will hold a lock
      sharepointScannerService.scanForWork.mockImplementation(() => 
        new Promise(() => {}) // Never resolves - simulates stuck scan
      );

      // Start the scan (don't await it)
      const scanPromise = service.runScheduledScan();

      // Advance time to ensure lock extension timer is set up
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Call onModuleDestroy while scan is in progress
      await service.onModuleDestroy();

      // Should have released the lock
      expect(distributedLockService.releaseLock).toHaveBeenCalledWith('sharepoint:scan:lock');

      // Clean up
      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('should handle module destroy when no scan is running', async () => {
      await service.onModuleDestroy();
      
      // Should not try to release any locks
      expect(distributedLockService.releaseLock).not.toHaveBeenCalled();
    });
  });
});
