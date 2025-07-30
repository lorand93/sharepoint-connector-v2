import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DistributedLockService } from './distributed-lock.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedis),
  };
});

const mockRedis = {
  set: jest.fn(),
  del: jest.fn(),
  disconnect: jest.fn(),
};

describe('DistributedLockService', () => {
  let service: DistributedLockService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistributedLockService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DistributedLockService>(DistributedLockService);
    configService = module.get(ConfigService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw error when Redis URL not configured', async () => {
      configService.get.mockReturnValue(undefined);

      expect(() => {
        new DistributedLockService(configService);
      }).toThrow('Redis URL not configured');
    });
  });

  describe('acquireLock', () => {
    it('should successfully acquire lock', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.acquireLock('test-key', 60);

      expect(result.acquired).toBe(true);
      expect(result.lockValue).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        expect.any(String),
        'EX',
        60,
        'NX'
      );
    });

    it('should fail to acquire lock when key already exists', async () => {
      mockRedis.set.mockResolvedValue(null);

      const result = await service.acquireLock('test-key', 60);

      expect(result.acquired).toBe(false);
      expect(result.lockValue).toBeUndefined();
    });

    it('should use custom lock value when provided', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const customValue = 'custom-lock-value';

      const result = await service.acquireLock('test-key', 60, customValue);

      expect(result.acquired).toBe(true);
      expect(result.lockValue).toBe(customValue);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        customValue,
        'EX',
        60,
        'NX'
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.acquireLock('test-key', 60);

      expect(result.acquired).toBe(false);
      expect(result.lockValue).toBeUndefined();
    });
  });

  describe('releaseLock', () => {
    it('should successfully release lock', async () => {
      mockRedis.del.mockResolvedValue(1);

      await expect(service.releaseLock('test-key')).resolves.not.toThrow();
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle Redis errors during release', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.releaseLock('test-key')).resolves.not.toThrow();
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Redis cleanly', async () => {
      mockRedis.disconnect.mockResolvedValue(undefined);

      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      mockRedis.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple lock operations', async () => {
      mockRedis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

      const result1 = await service.acquireLock('key-1', 60);
      const result2 = await service.acquireLock('key-1', 60); // Same key

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(false);
    });

    it('should handle concurrent lock attempts on different keys', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const [result1, result2] = await Promise.all([
        service.acquireLock('key-1', 60),
        service.acquireLock('key-2', 60),
      ]);

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });
});