import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { Drive, DriveItem, ModerationStatus } from './types/sharepoint.types';

@Injectable()
export class SharepointApiService {
  private readonly logger = new Logger(SharepointApiService.name);
  private readonly GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly httpService: HttpService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
  }

  public async findAllSyncableFilesForSite(siteId: string): Promise<DriveItem[]> {
    this.logger.log(`Starting recursive file scan for site: ${siteId}`);
    const drives = await this.getDrivesForSite(siteId);
    const allSyncableFiles: DriveItem[] = [];

    for (const drive of drives) {
      this.logger.log(`Scanning library (drive): ${drive.name} (${drive.id})`);
      const filesInDrive = await this.recursivelyFetchAndFilterFiles(drive.id, 'root');
      allSyncableFiles.push(...filesInDrive);
    }

    this.logger.log(`Completed scan for site ${siteId}. Found ${allSyncableFiles.length} syncable files.`);
    return allSyncableFiles;
  }

  private async getDrivesForSite(siteId: string): Promise<Drive[]> {
    let url = `${this.GRAPH_API_BASE_URL}/sites/${siteId}/drives`;
    const allDrives: Drive[] = [];

    while (url) {
      const response = await this.makeGraphRequest((token) => {
        const headers = {Authorization: `Bearer ${token}`};
        return firstValueFrom(this.httpService.get(url, {headers}));
      });
      allDrives.push(...(response.data.value || []));
      url = response.data['@odata.nextLink'];
    }
    return allDrives;
  }

  private async recursivelyFetchAndFilterFiles(driveId: string, itemId: string): Promise<DriveItem[]> {
    const syncColumnName: string = this.configService.get<string>('sharepoint.syncColumnName')!;
    const syncableFiles: DriveItem[] = [];

    const queryParams = 'select=id,name,webUrl,folder,file,listItem&expand=listItem';
    let url = `${this.GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}/children?${queryParams}`;

    while (url) {
      const response = await this.makeGraphRequest((token) => {
        const headers = {Authorization: `Bearer ${token}`};
        return firstValueFrom(this.httpService.get(url, {headers}));
      });
      const items = response.data.value || [];

      for (const item of items) {
        if (item.folder) {
          const filesInSubfolder = await this.recursivelyFetchAndFilterFiles(driveId, item.id);
          syncableFiles.push(...filesInSubfolder);
        } else if (item.file) {
          const fields = item.listItem?.fields;
          if (this.isFileSyncable(item)) {
            syncableFiles.push(item);
          }
        }
      }
      url = response.data['@odata.nextLink'];
    }
    return syncableFiles;
  }

  private isFileSyncable(item: DriveItem): boolean {
    const syncColumnName = this.configService.get<string>('sharepoint.syncColumnName')!;
    const allowedMimeTypes = this.configService.get<string[]>('sharepoint.allowedMimeTypes')!;

    const fields = item.listItem?.fields;
    if (!fields) {
      return false;
    }

    const hasSyncFlag = fields[syncColumnName] === true;
    const isApproved = fields._ModerationStatus === ModerationStatus.Approved;
    const isAllowedMimeType = item.file?.mimeType && allowedMimeTypes.includes(item.file.mimeType);

    return Boolean(hasSyncFlag && isApproved && isAllowedMimeType);
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
