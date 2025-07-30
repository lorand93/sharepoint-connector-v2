import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SharepointScannerService } from './sharepoint-scanner.service';
import { AuthService } from '../common/auth/auth.service';
import { SharepointApiService } from '../common/microsoft-graph/sharepoint-api.service';
import { QueueService } from '../queue/queue.service';
import { UniqueApiService } from '../common/unique-api/unique-api.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import { FileDiffResponse, FileDiffFileItem } from '../common/unique-api/types/unique-api.types';

describe('SharepointScannerService', () => {
  let service: SharepointScannerService;
  let configService: jest.Mocked<ConfigService>;
  let authService: jest.Mocked<AuthService>;
  let sharepointApiService: jest.Mocked<SharepointApiService>;
  let queueService: jest.Mocked<QueueService>;
  let uniqueApiService: jest.Mocked<UniqueApiService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockDriveItem: DriveItem = {
    id: 'file-1',
    name: 'document.pdf',
    webUrl: 'https://tenant.sharepoint.com/sites/site1/document.pdf',
    size: 1024000,
    lastModifiedDateTime: '2024-01-15T10:30:00Z',
    file: {
      mimeType: 'application/pdf',
    },
    parentReference: {
      driveId: 'drive-1',
      siteId: 'site-1',
      path: '/sites/site1/documents',
    },
    listItem: {
      fields: {
        id: 'listitem-1',
        OData__ModerationStatus: 0,
      },
      lastModifiedDateTime: '2024-01-15T10:30:00Z',
      createdDateTime: '2024-01-15T10:30:00Z',
    },
  };

  const mockDriveItem2: DriveItem = {
    id: 'file-2',
    name: 'spreadsheet.xlsx',
    webUrl: 'https://tenant.sharepoint.com/sites/site1/spreadsheet.xlsx',
    size: 512000,
    lastModifiedDateTime: '2024-01-16T14:20:00Z',
    file: {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    parentReference: {
      driveId: 'drive-1',
      siteId: 'site-1',
      path: '/sites/site1/documents',
    },
    listItem: {
      fields: {
        id: 'listitem-2',
        OData__ModerationStatus: 0,
      },
      lastModifiedDateTime: '2024-01-16T14:20:00Z',
      createdDateTime: '2024-01-16T14:20:00Z',
    },
  };

  const mockFileDiffResponse: FileDiffResponse = {
    newAndUpdatedFiles: ['sharepoint_file_file-1'],
    deletedFiles: [],
    movedFiles: [],
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    } as any;

    authService = {
      getUniqueApiToken: jest.fn(),
    } as any;

    sharepointApiService = {
      findAllSyncableFilesForSite: jest.fn(),
    } as any;

    queueService = {
      addFileProcessingJob: jest.fn(),
    } as any;

    uniqueApiService = {
      performFileDiff: jest.fn(),
    } as any;

    metricsService = {
      recordScanStarted: jest.fn(),
      recordFilesDiscovered: jest.fn(),
      recordScanError: jest.fn(),
      recordFileDiffResults: jest.fn(),
      recordFilesQueued: jest.fn(),
      recordScanCompleted: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharepointScannerService,
        { provide: ConfigService, useValue: configService },
        { provide: AuthService, useValue: authService },
        { provide: SharepointApiService, useValue: sharepointApiService },
        { provide: QueueService, useValue: queueService },
        { provide: UniqueApiService, useValue: uniqueApiService },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<SharepointScannerService>(SharepointScannerService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('scanForWork', () => {
    beforeEach(() => {
      configService.get.mockReturnValue(['site-1', 'site-2']);
      configService.get.mockReturnValue(['site-1', 'site-2']);
      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([mockDriveItem]);
      authService.getUniqueApiToken.mockResolvedValue('unique-token-123');
      uniqueApiService.performFileDiff.mockResolvedValue(mockFileDiffResponse);
      queueService.addFileProcessingJob.mockResolvedValue();
    });

    it('should successfully scan sites and queue files for processing', async () => {
      await service.scanForWork();

      expect(metricsService.recordScanStarted).toHaveBeenCalledTimes(1);
      expect(configService.get).toHaveBeenCalledWith('sharepoint.sites');
      expect(sharepointApiService.findAllSyncableFilesForSite).toHaveBeenCalledTimes(2);
      expect(sharepointApiService.findAllSyncableFilesForSite).toHaveBeenCalledWith('site-1');
      expect(sharepointApiService.findAllSyncableFilesForSite).toHaveBeenCalledWith('site-2');
      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(uniqueApiService.performFileDiff).toHaveBeenCalledTimes(1);
      expect(queueService.addFileProcessingJob).toHaveBeenCalledWith(mockDriveItem);
      expect(metricsService.recordScanCompleted).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should record metrics for discovered files', async () => {
      await service.scanForWork();

      expect(metricsService.recordFilesDiscovered).toHaveBeenCalledWith(1, 'site-1');
      expect(metricsService.recordFilesDiscovered).toHaveBeenCalledWith(1, 'site-2');
    });

    it('should perform file diff with correct data structure', async () => {
      await service.scanForWork();

      const expectedFileDiffItems: FileDiffFileItem[] = [
        {
          id: 'file-1',
          name: 'document.pdf',
          url: 'https://tenant.sharepoint.com/sites/site1/document.pdf',
          updatedAt: '2024-01-15T10:30:00Z',
          key: 'sharepoint_file_file-1',
        },
        {
          id: 'file-1',
          name: 'document.pdf',
          url: 'https://tenant.sharepoint.com/sites/site1/document.pdf',
          updatedAt: '2024-01-15T10:30:00Z',
          key: 'sharepoint_file_file-1',
        },
      ];

      expect(uniqueApiService.performFileDiff).toHaveBeenCalledWith(
        expectedFileDiffItems,
        'unique-token-123'
      );
    });

    it('should record file diff results metrics', async () => {
      await service.scanForWork();

      expect(metricsService.recordFileDiffResults).toHaveBeenCalledWith(1, 0, 0);
      expect(metricsService.recordFilesQueued).toHaveBeenCalledWith(3);
    });

    it('should handle empty sites configuration', async () => {
      configService.get.mockReturnValue([]);

      await service.scanForWork();

      expect(sharepointApiService.findAllSyncableFilesForSite).not.toHaveBeenCalled();
      expect(metricsService.recordScanStarted).toHaveBeenCalledTimes(1);
      expect(metricsService.recordScanCompleted).not.toHaveBeenCalled();
    });

    it('should handle null/undefined sites configuration', async () => {
      configService.get.mockReturnValue(null);

      await service.scanForWork();

      expect(sharepointApiService.findAllSyncableFilesForSite).not.toHaveBeenCalled();
      expect(metricsService.recordScanStarted).toHaveBeenCalledTimes(1);
      expect(metricsService.recordScanCompleted).not.toHaveBeenCalled();
    });

    it('should handle site scanning failures gracefully', async () => {
      const siteError = new Error('SharePoint API error');
      sharepointApiService.findAllSyncableFilesForSite
        .mockResolvedValueOnce([mockDriveItem])
        .mockRejectedValueOnce(siteError);

      await service.scanForWork();

      expect(metricsService.recordScanError).toHaveBeenCalledWith('site-2', 'site_scan_failed');
      expect(sharepointApiService.findAllSyncableFilesForSite).toHaveBeenCalledTimes(2);
      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(authService.getUniqueApiToken).toHaveBeenCalledTimes(1);
      expect(uniqueApiService.performFileDiff).toHaveBeenCalledTimes(1);
    });

    it('should handle no syncable files found', async () => {
      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([]);

      await service.scanForWork();

      expect(authService.getUniqueApiToken).not.toHaveBeenCalled();
      expect(uniqueApiService.performFileDiff).not.toHaveBeenCalled();
      expect(queueService.addFileProcessingJob).not.toHaveBeenCalled();
      expect(metricsService.recordScanCompleted).not.toHaveBeenCalled();
    });

    it('should handle authentication failures', async () => {
      const authError = new Error('Authentication failed');
      authService.getUniqueApiToken.mockRejectedValue(authError);

      await service.scanForWork();

      expect(metricsService.recordScanError).toHaveBeenCalledWith('global', 'scan_failed');
      expect(uniqueApiService.performFileDiff).not.toHaveBeenCalled();
    });

    it('should handle file diff failures', async () => {
      const diffError = new Error('File diff API error');
      uniqueApiService.performFileDiff.mockRejectedValue(diffError);

      await service.scanForWork();

      expect(metricsService.recordScanError).toHaveBeenCalledWith('global', 'scan_failed');
      expect(queueService.addFileProcessingJob).not.toHaveBeenCalled();
    });

    it('should handle queue job failures gracefully', async () => {
      const queueError = new Error('Queue error');
      queueService.addFileProcessingJob.mockRejectedValue(queueError);

      await service.scanForWork();

      expect(metricsService.recordScanCompleted).toHaveBeenCalledWith(expect.any(Number));
      expect(metricsService.recordScanCompleted).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should process files with different diff results', async () => {
      sharepointApiService.findAllSyncableFilesForSite
      sharepointApiService.findAllSyncableFilesForSite
        .mockResolvedValueOnce([mockDriveItem])
        .mockResolvedValueOnce([]);
      
      const complexDiffResponse: FileDiffResponse = {
        newAndUpdatedFiles: ['sharepoint_file_file-1'],
        deletedFiles: ['sharepoint_file_file-deleted'],
        movedFiles: ['sharepoint_file_file-moved'],
      };
      uniqueApiService.performFileDiff.mockResolvedValue(complexDiffResponse);

      await service.scanForWork();

      expect(metricsService.recordFileDiffResults).toHaveBeenCalledWith(1, 1, 1);
      expect(queueService.addFileProcessingJob).toHaveBeenCalledTimes(1);
      expect(queueService.addFileProcessingJob).toHaveBeenCalledWith(mockDriveItem);
    });

    it('should handle multiple files from multiple sites', async () => {
      sharepointApiService.findAllSyncableFilesForSite
        .mockResolvedValueOnce([mockDriveItem])
        .mockResolvedValueOnce([mockDriveItem2]);

      const multiFileDiffResponse: FileDiffResponse = {
        newAndUpdatedFiles: ['sharepoint_file_file-1', 'sharepoint_file_file-2'],
        deletedFiles: [],
        movedFiles: [],
      };
      uniqueApiService.performFileDiff.mockResolvedValue(multiFileDiffResponse);

      await service.scanForWork();

      expect(queueService.addFileProcessingJob).toHaveBeenCalledTimes(2);
      expect(queueService.addFileProcessingJob).toHaveBeenCalledWith(mockDriveItem);
      expect(queueService.addFileProcessingJob).toHaveBeenCalledWith(mockDriveItem2);
      expect(metricsService.recordFilesQueued).toHaveBeenCalledWith(3); // 2 files + 1
    });

    it('should use correct file key format for diff', async () => {
      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([mockDriveItem]);

      await service.scanForWork();

      const expectedFileDiffItem: FileDiffFileItem = {
        id: 'file-1',
        name: 'document.pdf',
        url: 'https://tenant.sharepoint.com/sites/site1/document.pdf',
        updatedAt: '2024-01-15T10:30:00Z',
        key: 'sharepoint_file_file-1',
      };

      expect(uniqueApiService.performFileDiff).toHaveBeenCalledWith(
        [expectedFileDiffItem, expectedFileDiffItem],
        'unique-token-123'
      );
    });

    it('should calculate scan duration correctly', async () => {
      const startTime = Date.now();
      await service.scanForWork();
      const endTime = Date.now();

      expect(metricsService.recordScanCompleted).toHaveBeenCalledWith(
        expect.any(Number)
      );

      const recordedDuration = metricsService.recordScanCompleted.mock.calls[0][0];
      expect(recordedDuration).toBeGreaterThanOrEqual(0);
      expect(recordedDuration).toBeLessThan((endTime - startTime) / 1000 + 1);
    });
  });

  describe('error handling and edge cases', () => {
    beforeEach(() => {
      configService.get.mockReturnValue(['site-1']);
      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([mockDriveItem]);
    });

         it('should handle files without lastModifiedDateTime', async () => {
       const fileWithoutTimestamp = {
         ...mockDriveItem,
         listItem: {
           ...mockDriveItem.listItem,
           lastModifiedDateTime: undefined as any,
         },
       } as DriveItem;
       sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([fileWithoutTimestamp]);
      authService.getUniqueApiToken.mockResolvedValue('token');
      uniqueApiService.performFileDiff.mockResolvedValue(mockFileDiffResponse);

      await service.scanForWork();

      const fileDiffCall = uniqueApiService.performFileDiff.mock.calls[0][0];
      expect(fileDiffCall[0].updatedAt).toBeUndefined();
    });

    it('should handle Promise.allSettled rejections in queue loading', async () => {
      authService.getUniqueApiToken.mockResolvedValue('token');
      uniqueApiService.performFileDiff.mockResolvedValue({
        newAndUpdatedFiles: ['sharepoint_file_file-1'],
        deletedFiles: [],
        movedFiles: [],
      });

      queueService.addFileProcessingJob
      queueService.addFileProcessingJob
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Queue failed'));

      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([mockDriveItem, mockDriveItem2]);
      sharepointApiService.findAllSyncableFilesForSite.mockResolvedValue([mockDriveItem, mockDriveItem2]);
      uniqueApiService.performFileDiff.mockResolvedValue({
        newAndUpdatedFiles: ['sharepoint_file_file-1', 'sharepoint_file_file-2'],
        deletedFiles: [],
        movedFiles: [],
      });

      await service.scanForWork();

      expect(queueService.addFileProcessingJob).toHaveBeenCalledTimes(2);
      expect(metricsService.recordScanCompleted).toHaveBeenCalled();
    });
  });
});
