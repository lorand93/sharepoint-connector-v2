import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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
  get: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  eval: jest.fn(),
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
      providers: [DistributedLockService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<DistributedLockService>(DistributedLockService);
    configService = module.get(ConfigService);

    // Setup Logger spies
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

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
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', expect.any(String), 'EX', 60, 'NX');
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
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', customValue, 'EX', 60, 'NX');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.acquireLock('test-key', 60);

      expect(result.acquired).toBe(false);
      expect(result.lockValue).toBeUndefined();
    });
  });

  describe('extendLock', () => {
    it('should extend lock successfully without ownership verification', async () => {
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.extendLock('test-key', 120);

      expect(result).toBe(true);
      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 120);
      expect(Logger.prototype.debug).toHaveBeenCalledWith('Lock extended: test-key (TTL: 120s)');
    });

    it('should extend lock successfully with ownership verification', async () => {
      mockRedis.get.mockResolvedValue('test-lock-value');
      mockRedis.expire.mockResolvedValue(1);

      const result = await service.extendLock('test-key', 120, 'test-lock-value');

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 120);
      expect(Logger.prototype.debug).toHaveBeenCalledWith('Lock extended: test-key (TTL: 120s)');
    });

    it('should fail to extend lock when ownership verification fails', async () => {
      mockRedis.get.mockResolvedValue('different-lock-value');

      const result = await service.extendLock('test-key', 120, 'expected-lock-value');

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
      expect(mockRedis.expire).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Cannot extend lock test-key: ownership verification failed');
    });

    it('should fail to extend non-existent lock', async () => {
      mockRedis.expire.mockResolvedValue(0);

      const result = await service.extendLock('test-key', 120);

      expect(result).toBe(false);
      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 120);
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Failed to extend lock: test-key (lock may not exist)');
    });

    it('should handle Redis errors during extension', async () => {
      const redisError = new Error('Redis connection failed');
      mockRedis.expire.mockRejectedValue(redisError);

      const result = await service.extendLock('test-key', 120);

      expect(result).toBe(false);
      expect(Logger.prototype.error).toHaveBeenCalledWith('Error extending lock test-key:', redisError);
    });
  });

  describe('releaseLock', () => {
    it('should successfully release lock without ownership verification', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await service.releaseLock('test-key');
      
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should successfully release lock with ownership verification', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await service.releaseLock('test-key', 'test-lock-value');
      
      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call'),
        1,
        'test-key',
        'test-lock-value'
      );
    });

    it('should fail to release lock when ownership verification fails', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.releaseLock('test-key', 'wrong-lock-value');
      
      expect(result).toBe(false);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call'),
        1,
        'test-key',
        'wrong-lock-value'
      );
    });

    it('should handle Redis errors during release', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.releaseLock('test-key');
      
      expect(result).toBe(false);
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle Redis errors during ownership verification', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.releaseLock('test-key', 'test-lock-value');
      
      expect(result).toBe(false);
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

      const [result1, result2] = await Promise.all([service.acquireLock('key-1', 60), service.acquireLock('key-2', 60)]);

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });
});
