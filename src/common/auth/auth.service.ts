import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConfidentialClientApplication,
  AuthenticationResult,
} from '@azure/msal-node';
import { Configuration } from '@azure/msal-node/src/config/Configuration';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private msalClient: ConfidentialClientApplication;
  private graphApiTokenCache: AuthenticationResult | null = null;
  private uniqueApiTokenCache: {accessToken: string; expiresOn: number} | null = null;

  private readonly TOKEN_EXPIRATION_BUFFER_MS = 15 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    const msalConfig: Configuration = {
      auth: {
        clientId: this.configService.get<string>('sharepoint.clientId', ''),
        authority: `https://login.microsoftonline.com/${this.configService.get<string>('sharepoint.tenantId')}`,
        clientSecret: this.configService.get<string>('sharepoint.clientSecret'),
      },
    };
    this.msalClient = new ConfidentialClientApplication(msalConfig);
  }

  async getGraphApiToken(): Promise<string> {
    if (!this.isGraphApiTokenExpiringSoon()) {
      this.logger.debug('Returning cached Microsoft Graph API token.');
      return this.graphApiTokenCache!.accessToken;
    }

    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    try {
      this.logger.debug('Acquiring new Microsoft Graph API token...');
      const response = await this.msalClient.acquireTokenByClientCredential(tokenRequest);

      if (!response?.accessToken) {
        throw new Error('Failed to acquire Graph API token: Response was null or did not contain an access token.');
      }

      this.graphApiTokenCache = response;
      this.logger.debug('Successfully acquired new Microsoft Graph API token.');
      return this.graphApiTokenCache.accessToken;
    } catch (error) {
      this.logger.error('Failed to acquire Graph API token', error);
      throw error;
    }
  }

  async getUniqueApiToken(): Promise<string> {
    if (this.uniqueApiTokenCache && this.uniqueApiTokenCache.expiresOn > Date.now() + 300000) {
      this.logger.debug('Returning cached Unique API token.');
      return this.uniqueApiTokenCache.accessToken;
    }

    this.logger.debug('Acquiring new Unique API token...');
    try {
      const accessToken = 'dummy-unique-api-token';
      const expiresInSeconds = 3600;

      this.uniqueApiTokenCache = {
        accessToken,
        expiresOn: Date.now() + expiresInSeconds * 1000,
      };

      this.logger.debug('Successfully acquired new Unique API token.');
      return this.uniqueApiTokenCache.accessToken;
    } catch (error) {
      this.logger.error('Failed to acquire Unique API token', error);
      throw error;
    }
  }

  private isGraphApiTokenExpiringSoon(): boolean {
    if (!this.graphApiTokenCache?.expiresOn) {
      return true;
    }
    return this.graphApiTokenCache.expiresOn.getTime() <= Date.now() + this.TOKEN_EXPIRATION_BUFFER_MS;
  }
}
