
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';

@Injectable()
export class JobProcessorService implements OnModuleInit {
  private readonly logger = new Logger(JobProcessorService.name);
  private worker: Worker;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = new URL(this.configService.get<string>('redis.url'));
    const concurrency = this.configService.get<number>('redis.concurrency') || 1;

    this.worker = new Worker('sharepoint-tasks', async (job: Job) => {
      this.logger.debug(`Processing job: ${job.name} (ID: ${job.id})`);

      if (job.name === 'process-file') {
        // In the next iteration, we will call the PipelineService here.
        const file = job.data;
        this.logger.log(`------------------ File to process: ${file.name}`);
      }

      // A small delay to simulate work
      await new Promise(resolve => setTimeout(resolve, 500));

    }, {
      connection: {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port, 10),
      },
      concurrency,
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} has completed.`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job.id} has failed with error: ${err.message}`);
    });

    this.logger.log(`Worker started. Concurrency: ${concurrency}`);
  }
}
