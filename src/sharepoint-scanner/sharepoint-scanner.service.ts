import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../common/auth/auth.service';
import { SharepointApiService } from '../common/microsoft-graph/sharepoint-api.service';
import { QueueService } from '../queue/queue.service';
import { UniqueApiService } from '../common/unique-api/unique-api.service';
import { FileDiffFileItem, FileDiffResponse } from '../common/unique-api/types/unique-api.types';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import { MetricsService } from '../common/metrics/metrics.service';

@Injectable()
export class SharepointScannerService {
  private readonly logger = new Logger(SharepointScannerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly sharepointApiService: SharepointApiService,
    private readonly queueService: QueueService,
    private readonly uniqueApiService: UniqueApiService,
    private readonly metricsService: MetricsService,
  ) {
  }

  async scanForWork(): Promise<void> {
    const scanStartTime = Date.now();
    this.metricsService.recordScanStarted();

    const sitesToScan = this.configService.get<string[]>('sharepoint.sites');

    if (!sitesToScan || sitesToScan.length === 0) {
      this.logger.warn('No SharePoint sites configured for scanning. Please check your configuration.');
      return;
    }

    try {
      this.logger.log(`Starting scan of ${sitesToScan.length} SharePoint sites...`);
      const allFiles: DriveItem[] = [];

      let totalFilesFound = 0;
      for (const siteId of sitesToScan) {
        try {
          const files = await this.sharepointApiService.findAllSyncableFilesForSite(siteId);
          this.logger.debug(`Found ${files.length} syncable files in site ${siteId}`);

          allFiles.push(...files);
          totalFilesFound += files.length;

          this.metricsService.recordFilesDiscovered(files.length, siteId);
        } catch (error) {
          this.logger.error(`Failed to scan site ${siteId}:`, error.stack);
          this.metricsService.recordScanError(siteId, 'site_scan_failed');
        }
      }

      if (allFiles.length === 0) {
        this.logger.log('No syncable files found across all sites.');
        return;
      }

      this.logger.debug(`Collected ${totalFilesFound} total syncable files. Performing file diff...`);

      const fileDiffItems: FileDiffFileItem[] = allFiles.map((file) => ({
        id: file.id,
        name: file.name,
        url: file.webUrl,
        updatedAt: file.listItem.lastModifiedDateTime,
        key: `sharepoint_file_${file.id}`,
      }));

      const uniqueToken = await this.authService.getUniqueApiToken();
      const diffResult = await this.uniqueApiService.performFileDiff(
        fileDiffItems,
        uniqueToken,
      );

      this.logger.debug(`File diff complete - ${diffResult.newAndUpdatedFiles.length} files need processing,
      ${diffResult.deletedFiles.length} deleted`);

      this.metricsService.recordFileDiffResults(
        diffResult.newAndUpdatedFiles.length,
        diffResult.deletedFiles.length,
        diffResult.movedFiles.length,
      );

      const results = await this.loadJobsInQueue(diffResult, allFiles, totalFilesFound);

      this.metricsService.recordFilesQueued(results.length + 1);

      const scanDurationSeconds = (Date.now() - scanStartTime) / 1000;
      this.metricsService.recordScanCompleted(scanDurationSeconds);
    } catch (error) {
      this.logger.error('Failed to complete SharePoint scan:', error.stack);
      this.metricsService.recordScanError('global', 'scan_failed');
    }
  }

  private async loadJobsInQueue(diffResult: FileDiffResponse, allFiles: DriveItem[], totalFilesFound: number) {
    const newFileKeys = new Set(diffResult.newAndUpdatedFiles);
    const filesToProcess = allFiles.filter((file) =>
      newFileKeys.has(`sharepoint_file_${file.id}`),
    );

    this.logger.log(`Scan complete. ${filesToProcess.length + 1} files will be added to processing queue 
      out of ${totalFilesFound} total files scanned.`);

    const jobPromises = filesToProcess.map(file =>
      this.queueService.addFileProcessingJob(file),
    );

    const results = await Promise.allSettled(jobPromises);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const file = filesToProcess[index];
        this.logger.error(
          `Failed to queue file ${file.name} (${file.id}):`,
          result.reason,
        );
      }
    });
    return results;
  }
}

