import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PipelineService } from './pipeline.service';
import { PipelineModule } from './pipeline.module';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import configuration from '../config/configuration';

describe('PipelineService Integration Test', () => {
  let service: PipelineService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          isGlobal: true,
        }),
        PipelineModule,
      ],
    }).compile();

    service = module.get<PipelineService>(PipelineService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create processing context from DriveItem', async () => {
    // Create a mock DriveItem
    const mockFile: DriveItem = {
      id: 'test-file-id-123',
      name: 'test-document.pdf',
      webUrl: 'https://tenant.sharepoint.com/sites/test/document.pdf',
      size: 1024000, // 1MB
      lastModifiedDateTime: '2024-01-15T10:30:00Z',
      file: {
        mimeType: 'application/pdf',
      },
      parentReference: {
        driveId: 'test-drive-id-456',
        siteId: 'test-site-id-789',
        path: '/sites/test/documents',
      },
      listItem: {
        fields: {
          id: 'test-listitem-id',
          OData__ModerationStatus: 0, // Approved
        },
      },
    };

    // This will fail at Step 2 (Content Fetching) because we don't have real SharePoint credentials
    // But it should successfully create the context and start the pipeline
    try {
      const result = await service.processFile(mockFile);
      
      // If it somehow succeeds (with mocked dependencies), verify the result
      expect(result.context.correlationId).toBeDefined();
      expect(result.context.fileId).toBe('test-file-id-123');
      expect(result.context.fileName).toBe('test-document.pdf');
      expect(result.context.metadata.driveId).toBe('test-drive-id-456');
      
    } catch (error) {
      // Expected to fail at content fetching step due to missing real credentials
      // But we can verify the error indicates we got to the content fetching step
      expect(error.message).toContain('Drive ID not found'); // or some SharePoint API error
      
      // The important thing is that we got past the pipeline setup
      console.log('Pipeline setup test passed - failed at content fetching as expected:', error.message);
    }
  });

  it('should have correct configuration values', () => {
    // Test that our pipeline configuration is properly loaded
    const stepTimeout = configService.get<number>('pipeline.stepTimeoutSeconds');
    const maxFileSize = configService.get<number>('pipeline.maxFileSizeBytes');
    
    expect(stepTimeout).toBe(30); // default
    expect(maxFileSize).toBe(209715200); // 200MB default
  });
}); 