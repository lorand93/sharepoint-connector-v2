import { Test, TestingModule } from '@nestjs/testing';
import { SharepointApiService } from './sharepoint-api.service';

describe('SharepointApiService', () => {
  let service: SharepointApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SharepointApiService],
    }).compile();

    service = module.get<SharepointApiService>(SharepointApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
