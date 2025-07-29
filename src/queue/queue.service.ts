import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DriveItem } from '../common/microsoft-graph/types/sharepoint.types';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    @InjectQueue('sharepoint-tasks') private readonly taskQueue: Queue,
  ) {}

  async addFileProcessingJob(file: DriveItem): Promise<void> {
    await this.taskQueue.add('process-file', file, {
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
