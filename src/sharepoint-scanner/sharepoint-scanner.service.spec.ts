import { Test, TestingModule } from '@nestjs/testing';
import { SharepointScannerService } from './sharepoint-scanner.service';

describe('SharepointScannerService', () => {
  let service: SharepointScannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharepointScannerService],
    }).compile();

    service = module.get(SharepointScannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
