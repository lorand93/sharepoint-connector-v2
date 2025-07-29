import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';
import { Configuration } from '@azure/msal-node/src/config/Configuration';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private msalClient: ConfidentialClientApplication;
  private graphApiTokenCache: AuthenticationResult | null = null;
  private uniqueApiTokenCache: {
    accessToken: string;
    expiresOn: number;
    acquiredAt: number;
  } | null = null;

  private readonly TOKEN_EXPIRATION_BUFFER_MS = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const msalConfig: Configuration = {
      auth: {
        clientId: this.configService.get<string>('sharepoint.clientId', ''),
        authority: `https://login.microsoftonline.com/${this.configService.get<string>('sharepoint.tenantId')}`,
        clientSecret: this.configService.get<string>('sharepoint.clientSecret'),
      },
    };
    this.msalClient = new ConfidentialClientApplication(msalConfig);
  }

  public async getGraphApiToken(): Promise<string> {
    if (!this.isGraphApiTokenExpiringSoon()) {
      return this.graphApiTokenCache!.accessToken;
    }

    this.logger.debug('Acquiring new Microsoft Graph API token...');

    const tokenRequest = {
      scopes: ['https://graph.microsoft.com/.default'],
    };

    try {
      const response = await this.msalClient.acquireTokenByClientCredential(tokenRequest);

      if (!response?.accessToken) {
        throw new Error('Failed to acquire Graph API token: Response was null or did not contain an access token');
      }

      this.graphApiTokenCache = response;
      this.logger.debug('Successfully acquired new Microsoft Graph API token.');
      return this.graphApiTokenCache.accessToken;
    } catch (error) {
      this.logger.error('Failed to acquire Graph API token', error);
      throw error;
    }
  }

  public async getUniqueApiToken(): Promise<string> {
    if (!this.isUniqueApiTokenExpiringSoon()) {
      return this.uniqueApiTokenCache!.accessToken;
    }

    this.logger.debug('Acquiring new Unique API token from Zitadel...');

    try {
      const oAuthTokenUrl = this.configService.get<string>('uniqueApi.zitadelOAuthTokenUrl')!;
      const clientId = this.configService.get<string>('uniqueApi.zitadelClientId')!;
      const clientSecret = this.configService.get<string>('uniqueApi.zitadelClientSecret')!;
      const projectId = this.configService.get<string>('uniqueApi.zitadelProjectId')!.replace(/\D/g, '');

      const params = new URLSearchParams({
        scope: `openid profile email urn:zitadel:iam:user:resourceowner urn:zitadel:iam:org:projects:roles urn:zitadel:iam:org:project:id:${projectId}:aud`,
        grant_type: 'client_credentials',
      });

      const now = Date.now();
      const response = await firstValueFrom(
        this.httpService.post(oAuthTokenUrl, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
        }),
      );

      const tokenData = response.data as {
        access_token: string;
        expires_in: number;
        token_type: string;
        id_token: string;
      };

      if (!tokenData.access_token) {
        throw new Error('Invalid token response: missing access_token');
      }

      const expiresAt = now + (tokenData.expires_in * 1000);
      this.uniqueApiTokenCache = {
        accessToken: tokenData.access_token,
        expiresOn: expiresAt,
        acquiredAt: now,
      };

      this.logger.debug(`Successfully acquired new Zitadel token that expires in ${tokenData.expires_in} seconds at ${new Date(expiresAt).toISOString()}`);

      return this.uniqueApiTokenCache.accessToken;
    } catch (error) {
      this.logger.error('Failed to acquire Unique API token from Zitadel:', error.response?.data || error.message);
      throw error;
    }
  }

  private isGraphApiTokenExpiringSoon(): boolean {
    if (!this.graphApiTokenCache?.expiresOn) {
      return true;
    }
    return this.graphApiTokenCache.expiresOn.getTime() <= Date.now() + this.TOKEN_EXPIRATION_BUFFER_MS;
  }

  private isUniqueApiTokenExpiringSoon(): boolean {
    if (!this.uniqueApiTokenCache?.expiresOn) {
      return true;
    }
    return this.uniqueApiTokenCache.expiresOn <= Date.now() + this.TOKEN_EXPIRATION_BUFFER_MS;
  }
}
