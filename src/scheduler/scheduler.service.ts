import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SharepointScannerService } from '../sharepoint-scanner/sharepoint-scanner.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isScanRunning = false;

  constructor(private readonly sharepointScanner: SharepointScannerService) {}

  onModuleInit() {
    this.logger.log('Triggering initial scan on service startup...');
    this.runScheduledScan();
  }

  @Cron('*/15 * * * *')
  async runScheduledScan() {
    if (this.isScanRunning) {
      this.logger.warn('Scan skipped: A previous scan is still in progress.');
      return;
    }

    this.logger.log('Scheduler triggered. Starting SharePoint scan...');
    try {
      this.isScanRunning = true;
      await this.sharepointScanner.scanForWork();
    } catch (error) {
      this.logger.error(
        'An unexpected error occurred during the scheduled scan.',
        error.stack,
      );
    } finally {
      this.isScanRunning = false;
      this.logger.log('Scan finished. Ready for the next scheduled run.');
    }
  }
}
