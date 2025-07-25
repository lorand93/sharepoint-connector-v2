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
    return this.makeGraphRequest(async (token) => {
      const url = `${this.GRAPH_API_BASE_URL}/sites/${siteId}/drive/root/search(q='{search-term}')`;
      
      this.logger.log(`Would query for files in site: ${siteId}`);
      
      // For Iteration 1, we return an empty array.
      return [];
    });
  }

  private async makeGraphRequest<T>(apiCall: (token: string) => Promise<T>): Promise<T> {
    let token = await this.authService.getGraphApiToken();
    
    try {
      return await apiCall(token);
    } catch (error) {
      if (error.response?.status === 401) {
        this.logger.warn('Graph API token expired, refreshing and retrying...');
        token = await this.authService.getGraphApiToken();
        return await apiCall(token);
      }
      
      this.logger.error('Graph API request failed', error.response?.data || error.message);
      throw error;
    }
  }
}
