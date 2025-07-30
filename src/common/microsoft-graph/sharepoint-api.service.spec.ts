import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SharepointApiService } from './sharepoint-api.service';

describe('SharepointApiService', () => {
  let service: SharepointApiService;

  beforeEach(async () => {
    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const mockAuthService = {
      getGraphApiToken: jest.fn().mockResolvedValue('mock-token'),
      getUniqueApiToken: jest.fn().mockResolvedValue('mock-unique-token'),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'sharepoint.siteId': 'test-site-id',
          'sharepoint.clientId': 'test-client-id',
          'sharepoint.tenantId': 'test-tenant-id',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharepointApiService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SharepointApiService>(SharepointApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
