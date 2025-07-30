import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      throw new Error('Redis URL not configured');
    }
    this.redis = new Redis(redisUrl);

    this.logger.debug('DistributedLockService initialized with Redis backing');
  }

  async acquireLock(
    lockKey: string,
    ttlSeconds: number,
    lockValue?: string
  ): Promise<{ acquired: boolean; lockValue?: string }> {
    try {
      const value = lockValue || `${process.pid}-${Date.now()}`;
      const result = await this.redis.set(
        lockKey,
        value,
        'EX',
        ttlSeconds,
        'NX' // Only set if key doesn't exist
      );

      const acquired = result === 'OK';
      if (acquired) {
        this.logger.debug(`Distributed lock acquired: ${lockKey} = ${value}`);
        return { acquired: true, lockValue: value };
      } else {
        this.logger.log(`Failed to acquire distributed lock: ${lockKey}`);
        return { acquired: false };
      }
    } catch (error) {
      this.logger.error(`Error acquiring distributed lock ${lockKey}:`, error);
      return { acquired: false };
    }
  }

  async extendLock(
    lockKey: string,
    ttlSeconds: number,
    lockValue?: string
  ): Promise<boolean> {
    try {
      if (lockValue) {
        // Verify we own the lock before extending it
        const currentValue = await this.redis.get(lockKey);
        if (currentValue !== lockValue) {
          this.logger.warn(`Cannot extend lock ${lockKey}: ownership verification failed`);
          return false;
        }
      }

      // Extend the lock TTL
      const result = await this.redis.expire(lockKey, ttlSeconds);
      const extended = result === 1;

      if (extended) {
        this.logger.debug(`Lock extended: ${lockKey} (TTL: ${ttlSeconds}s)`);
      } else {
        this.logger.warn(`Failed to extend lock: ${lockKey} (lock may not exist)`);
      }

      return extended;
    } catch (error) {
      this.logger.error(`Error extending lock ${lockKey}:`, error);
      return false;
    }
  }

  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
      this.logger.debug(`Lock released for key: ${lockKey}`);
    } catch (error) {
      this.logger.error(`Error releasing lock for key ${lockKey}:`, error);
    }
  }


  async onModuleDestroy() {
    try {
      await this.redis.disconnect();
      this.logger.log('DistributedLockService Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
}
