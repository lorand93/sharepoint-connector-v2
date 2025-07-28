import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../common/auth/auth.service';
import { SharepointApiService } from '../common/microsoft-graph/sharepoint-api.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class SharepointScannerService {
  private readonly logger = new Logger(SharepointScannerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly sharepointApiService: SharepointApiService,
    private readonly queueService: QueueService
  ) {
  }

  async scanForWork(): Promise<void> {
    let totalFilesFound = 0;
    const sitesToScan = this.configService.get<string[]>('sharepoint.sites');

    if (!sitesToScan || sitesToScan.length === 0) {
      this.logger.warn('No SharePoint sites configured for scanning. Please check your configuration.');
      return;
    }

    try {
      for (const siteId of sitesToScan) {
        try {
          const files = await this.sharepointApiService.findAllSyncableFilesForSite(siteId);
          this.logger.log(`Found ${files.length} files to sync in site ${siteId}.`);

          for (const file of files) {
            await this.queueService.addFileProcessingJob(file);
          }

          totalFilesFound += files.length;
        } catch (error) {
          this.logger.error(`Failed to scan site ${siteId}.`, error.stack);
        }
      }
      this.logger.log(`Scan complete. Total files added to queue: ${totalFilesFound}`);

    } catch (error) {
      this.logger.error('Failed to complete SharePoint scan due to authentication or other error.', error.stack);
    }
  }
}
