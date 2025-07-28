import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = new URL(this.configService.get<string>('redis.url')!);
    this.queue = new Queue('sharepoint-tasks', {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port, 10),
      },
    });
  }

  async addFileProcessingJob(file: DriveItem): Promise<void> {
    await this.queue.add('process-file', file, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  onModuleDestroy() {
    this.queue.close();
  }
}
