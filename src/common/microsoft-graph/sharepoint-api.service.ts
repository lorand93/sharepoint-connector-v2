import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class SharepointApiService {
  private readonly logger = new Logger(SharepointApiService.name);
  private readonly GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: AuthService,
  ) {}

  async getFilesToSync(siteId: string): Promise<any[]> {
    const token = await this.authService.getGraphApiToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const url = `${this.GRAPH_API_BASE_URL}/sites/${siteId}/drive/root/search(q='{search-term}')`;

      this.logger.log(`Would query for files in site: ${siteId}`);

      // For Iteration 1, we return an empty array.
      return [];
    } catch (error) {
      this.logger.error(`Failed to get files for site ${siteId}`, error.response?.data || error.message);
      throw error;
    }
  }
}
