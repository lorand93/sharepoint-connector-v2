import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { Drive, DriveItem, ModerationStatus } from './types/sharepoint.types';
import { Readable } from 'stream';

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
    this.logger.debug(`Starting recursive file scan for site: ${siteId}`);
    const drives = await this.getDrivesForSite(siteId);
    let allSyncableFiles: DriveItem[] = [];

    for (const drive of drives) {
      this.logger.debug(`Scanning library (drive): ${drive.name} (${drive.id})`);
      const filesInDrive = await this.recursivelyFetchAndFilterFiles(drive.id, 'root');
      allSyncableFiles.push(...filesInDrive);
    }

    this.logger.debug(`Completed scan for site ${siteId}. Found ${allSyncableFiles.length} syncable files.`);
    return allSyncableFiles;
  }

  private async getDrivesForSite(siteId: string): Promise<Drive[]> {
    let allDrives: Drive[] = [];
    let url = `${this.GRAPH_API_BASE_URL}/sites/${siteId}/drives`;

    while (url) {
      const response = await this.makeGraphRequest<{data: {value: Drive[]}}>((token) => {
        const headers = {Authorization: `Bearer ${token}`};
        return firstValueFrom(this.httpService.get(url, {headers}));
      });
      allDrives.push(...(response.data.value || []));
      url = response.data['@odata.nextLink'];
    }
    return allDrives;
  }

  private async recursivelyFetchAndFilterFiles(driveId: string, itemId: string): Promise<DriveItem[]> {
    let syncableFiles: DriveItem[] = [];
    const queryParams = 'select=id,name,webUrl,size,lastModifiedDateTime,folder,file,listItem,parentReference&expand=listItem(expand=fields,parentReference)';
    let url = `${this.GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}/children?${queryParams}`;

    while (url) {
      const response = await this.makeGraphRequest<{data: {value: DriveItem[]}}>((token) => {
        const headers = {Authorization: `Bearer ${token}`};
        return firstValueFrom(this.httpService.get(url, {headers}));
      });
      const items: DriveItem[] = response.data.value || [];

      for (const item of items) {
        if (item.parentReference) {
          item.parentReference.driveId = driveId;
        }

        if (!item.parentReference && item.listItem?.parentReference) {
          item.parentReference = item.listItem.parentReference;
        }

        if (item.folder) {
          const filesInSubfolder = await this.recursivelyFetchAndFilterFiles(driveId, item.id);
          syncableFiles.push(...filesInSubfolder);
        } else if (item.file) {
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

  /**
   * Downloads file content from SharePoint and returns it as a Buffer
   * @param driveId - The drive ID containing the file
   * @param itemId - The item ID of the file
   * @returns Promise<Buffer> - The file content as a buffer
   */
  async downloadFileContent(driveId: string, itemId: string): Promise<Buffer> {
    this.logger.debug(`Downloading file content for item ${itemId} from drive ${driveId}`);
    const maxFileSizeBytes = this.configService.get<number>('pipeline.maxFileSizeBytes', 209715200); // 200MB default

    const responseStream = await this.makeGraphRequest(async (token) => {
      const headers = {Authorization: `Bearer ${token}`};
      const downloadUrl = `${this.GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}/content`;

      const response = await firstValueFrom(
        this.httpService.get<Readable>(downloadUrl, {
          headers,
          responseType: 'stream',
          maxBodyLength: maxFileSizeBytes,
          maxContentLength: maxFileSizeBytes,
        }),
      );
      return response.data;
    });

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      responseStream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxFileSizeBytes) {
          responseStream.destroy();
          reject(new Error(`File size exceeds maximum limit of ${maxFileSizeBytes} bytes.`));
        }
        chunks.push(chunk);
      });
      responseStream.on('end', () => {
        this.logger.log(`File download completed. Size: ${totalSize} bytes.`);
        resolve(Buffer.concat(chunks));
      });
      responseStream.on('error', (error) => {
        this.logger.error(`File download stream failed: ${error.message}`);
        reject(error);
      });
    });
  }

  private async makeGraphRequest<T>(apiCall: (token: string) => Promise<T>): Promise<T> {
    let token = await this.authService.getGraphApiToken();
    try {
      return await apiCall(token);
    } catch (error) {
      if (error.response?.status === 401) {
        this.logger.warn('Graph API token expired or invalid, refreshing and retrying request once...');
        const newToken = await this.authService.getGraphApiToken();
        try {
          return await apiCall(newToken);
        } catch (retryError) {
          this.logger.error('Graph API request failed on retry', retryError.response?.data || retryError.message);
          throw retryError;
        }
      }
      this.logger.error('Graph API request failed', error.response?.data || error.message);
      throw error;
    }
  }
}
