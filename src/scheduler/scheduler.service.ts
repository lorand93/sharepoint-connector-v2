import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SharepointScannerService } from '../sharepoint-scanner/sharepoint-scanner.service';
import { DistributedLockService } from '../common/lock/distributed-lock.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly lockKey = 'sharepoint:scan:lock';
  private readonly lockTTL = 900; // 15 minutes TTL (same as cron interval)

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

    try {
      this.logger.log('Lock acquired. Starting SharePoint scan...');
      await this.sharepointScanner.scanForWork();
      this.logger.log('SharePoint scan completed successfully.');
    } catch (error) {
      this.logger.error('An unexpected error occurred during the scheduled scan.', error.stack);
    } finally {
      await this.distributedLockService.releaseLock(this.lockKey);
    }
  }
}
