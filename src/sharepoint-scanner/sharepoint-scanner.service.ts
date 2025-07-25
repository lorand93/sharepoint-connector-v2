import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../common/auth/auth.service';

@Injectable()
export class SharepointScannerService {
  private readonly logger = new Logger(SharepointScannerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    // private readonly queueService: QueueService,
  ) {
  }

  async scanForWork(): Promise<void> {
    this.logger.log('Attempting to authenticate with Microsoft Graph...');

    try {
      const token = await this.authService.getGraphApiToken();

      // to prove we can get a token.
      if (token) {
        this.logger.log('Successfully authenticated and acquired Graph API token.', token);
      }

      // const sites = this.configService.get('sharepoint.sites');

      this.logger.log('SharePoint scan logic placeholder executed.');

    } catch (error) {
      this.logger.error('Failed to complete SharePoint scan due to authentication or other error.', error.stack);
    }
  }
}
