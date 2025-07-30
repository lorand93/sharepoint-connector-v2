import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    // Initialize Redis connection for distributed locking
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      throw new Error('Redis URL not configured');
    }
    this.redis = new Redis(redisUrl);

    this.logger.debug('DistributedLockService initialized with Redis backing');
  }

  /**
   * Attempts to acquire a distributed lock
   * @param lockKey The unique key for the lock
   * @param ttlSeconds Time-to-live for the lock in seconds
   * @param lockValue Optional custom lock value, defaults to process.pid-timestamp
   * @returns Object with success flag and lock value if acquired
   */
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
        'EX', // Set expiration
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

  /**
   * Releases a distributed lock
   * @param lockKey The unique key for the lock
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
      this.logger.debug(`Lock released for key: ${lockKey}`);
    } catch (error) {
      this.logger.error(`Error releasing lock for key ${lockKey}:`, error);
    }
  }





  /**
   * Cleanup method called when the service is destroyed
   */
  async onModuleDestroy() {
    try {
      await this.redis.disconnect();
      this.logger.log('DistributedLockService Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
}
