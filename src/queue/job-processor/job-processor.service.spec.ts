import { Test, TestingModule } from '@nestjs/testing';
import { PipelineService } from '../../pipeline/pipeline.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { JobProcessorService } from './job-processor.service';

describe('JobProcessorService', () => {
  let service: JobProcessorService;

  beforeEach(async () => {
    const mockPipelineService = {
      processFile: jest.fn().mockResolvedValue({
        success: true,
        fileId: 'test-file-id',
        message: 'File processed successfully',
        metrics: {
          processingTimeMs: 1000,
          pipelineSteps: 5,
        },
      }),
    };

    const mockMetricsService = {
      recordJobStarted: jest.fn(),
      recordJobCompleted: jest.fn(),
      recordJobFailed: jest.fn(),
      recordProcessingTime: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobProcessorService,
        { provide: PipelineService, useValue: mockPipelineService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<JobProcessorService>(JobProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
