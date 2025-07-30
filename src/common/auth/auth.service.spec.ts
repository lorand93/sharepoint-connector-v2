import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'sharepoint.clientId': 'test-client-id',
          'sharepoint.tenantId': 'test-tenant-id',
          'sharepoint.clientSecret': 'test-client-secret',
          'uniqueApi.baseUrl': 'https://api.example.com',
          'uniqueApi.clientId': 'test-unique-client-id',
          'uniqueApi.clientSecret': 'test-unique-client-secret',
        };
        return config[key] || defaultValue;
      }),
    };

    const mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
