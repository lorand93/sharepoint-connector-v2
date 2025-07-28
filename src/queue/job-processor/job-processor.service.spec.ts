import { Test, TestingModule } from '@nestjs/testing';
import { JobProcessorService } from './job-processor.service';

describe('JobProcessorService', () => {
  let service: JobProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobProcessorService],
    }).compile();

    service = module.get<JobProcessorService>(JobProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
