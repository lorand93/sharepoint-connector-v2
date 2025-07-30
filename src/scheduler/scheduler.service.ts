import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SharepointScannerService } from '../sharepoint-scanner/sharepoint-scanner.service';
import { DistributedLockService } from '../common/lock/distributed-lock.service';

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly lockKey = 'sharepoint:scan:lock';
  private readonly lockTTL = 900; // 15 minutes TTL (same as cron interval)
  private readonly lockExtensionInterval = 600000; // 10 minutes in milliseconds

  private lockExtensionTimer?: NodeJS.Timeout;
  private currentLockValue?: string;

  constructor(
    private readonly sharepointScanner: SharepointScannerService,
    private readonly distributedLockService: DistributedLockService,
  ) {
    this.logger.log('SchedulerService initialized with distributed locking');
  }

  onModuleInit() {
    this.logger.log('Triggering initial scan on service startup...');
    this.runScheduledScan();
  }

  @Cron('*/15 * * * *')
  async runScheduledScan() {
    this.logger.log('Scheduler triggered. Attempting to acquire lock...');

    const lockResult = await this.distributedLockService.acquireLock(this.lockKey, this.lockTTL);

    if (!lockResult.acquired) {
      this.logger.warn('Scan skipped: Failed to acquire lock - another process may be running');
      return;
    }

    // Store lock value and start extension mechanism
    this.currentLockValue = lockResult.lockValue;
    this.startLockExtension();

    try {

      this.logger.log('Lock acquired. Starting SharePoint scan...');
      await this.sharepointScanner.scanForWork();
      this.logger.log('SharePoint scan completed successfully.');

    } catch (error) {
      this.logger.error('An unexpected error occurred during the scheduled scan.', error.stack);
    } finally {
      this.stopLockExtension();
      if (this.currentLockValue) {
        await this.distributedLockService.releaseLock(this.lockKey, this.currentLockValue);
      }
      this.currentLockValue = undefined;
    }
  }

  /**
   * Starts the periodic lock extension timer
   */
  private startLockExtension() {
    if (this.lockExtensionTimer) {
      clearInterval(this.lockExtensionTimer);
    }

    this.lockExtensionTimer = setInterval(async () => {
      if (this.currentLockValue) {
        const extended = await this.distributedLockService.extendLock(this.lockKey, this.lockTTL, this.currentLockValue);

        if (extended) {
          this.logger.debug(`Lock extended successfully for scan operation`);
        } else {
          this.logger.warn(`Failed to extend lock - scan may be interrupted`);
        }
      }
    }, this.lockExtensionInterval);

    this.logger.debug(`Lock extension timer started (interval: ${this.lockExtensionInterval}ms)`);
  }

  private stopLockExtension() {
    if (this.lockExtensionTimer) {
      clearInterval(this.lockExtensionTimer);
      this.lockExtensionTimer = undefined;
      this.logger.debug('Lock extension timer stopped');
    }
  }

  /**
   * Graceful shutdown handler - releases locks before app termination
   */
  async onModuleDestroy() {
    this.logger.log('SchedulerService shutting down - cleaning up resources...');

    try {
      // Stop lock extension timer
      this.stopLockExtension();

      // Release any active locks
      if (this.currentLockValue) {
        const released = await this.distributedLockService.releaseLock(this.lockKey, this.currentLockValue);
        if (released) {
          this.logger.log(`Released active lock: ${this.lockKey}`);
        } else {
          this.logger.warn(`Failed to release lock during shutdown: ${this.lockKey}`);
        }
        this.currentLockValue = undefined;
      }

      this.logger.log('SchedulerService cleanup completed');
    } catch (error) {
      this.logger.error('Error during SchedulerService cleanup:', error);
    }
  }
}
