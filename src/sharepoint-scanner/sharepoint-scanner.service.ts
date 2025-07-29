import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../common/auth/auth.service';
import { SharepointApiService } from '../common/microsoft-graph/sharepoint-api.service';
import { QueueService } from '../queue/queue.service';
import { UniqueApiService } from '../common/unique-api/unique-api.service';
import { FileDiffFileItem } from '../common/unique-api/types/unique-api.types';
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

      this.logger.log(`File diff complete - ${diffResult.newAndUpdatedFiles.length} files need processing, 
      ${diffResult.unchangedFiles.length} unchanged, ${diffResult.deletedFiles.length} deleted`);

      this.metricsService.recordFileDiffResults(
        diffResult.newAndUpdatedFiles.length,
        diffResult.unchangedFiles.length,
        diffResult.deletedFiles.length,
        diffResult.movedFiles.length,
      );

      const newFileKeys = new Set(diffResult.newAndUpdatedFiles);
      const filesToProcess = allFiles.filter((file) =>
        newFileKeys.has(`sharepoint_file_${file.id}`),
      );

      const addFileProcessingJobPromises = filesToProcess.map(file => this.queueService.addFileProcessingJob(file));

      try {
        await Promise.all(addFileProcessingJobPromises);
      } catch (error) {
        this.logger.error(
          `Failed to queue file ${file.name} (${file.id}):`,
          error.message,
        );

        this.logger.log(`Scan complete. ${addFileProcessingJobPromises.length + 1} 
        files added to processing queue out of ${totalFilesFound} total files scanned.`);

        this.metricsService.recordFilesQueued(addFileProcessingJobPromises.length + 1);

        if (diffResult.deletedFiles.length > 0) {
          this.logger.debug(`Note: ${diffResult.deletedFiles.length} files were deleted and will be handled by Unique backend.`);
        }

        const scanDurationSeconds = (Date.now() - scanStartTime) / 1000;
        this.metricsService.recordScanCompleted(scanDurationSeconds);
      } catch (error) {
        this.logger.error('Failed to complete SharePoint scan:', error.stack);
        this.metricsService.recordScanError('global', 'scan_failed');
      }
    }
  }
}
