import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../common/auth/auth.service';
import { SharepointApiService } from '../common/microsoft-graph/sharepoint-api.service';

@Injectable()
export class SharepointScannerService {
  private readonly logger = new Logger(SharepointScannerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly sharepointApiService: SharepointApiService,
    // private readonly queueService: QueueService,
  ) {
  }

  async scanForWork(): Promise<void> {
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
        } catch (error) {
          this.logger.error(`Failed to scan site ${siteId}.`, error.stack);
        }
      }

    } catch (error) {
      this.logger.error('Failed to complete SharePoint scan due to authentication or other error.', error.stack);
    }
  }
}
