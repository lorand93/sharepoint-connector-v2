
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';

@Processor('sharepoint-tasks')
export class JobProcessorService extends WorkerHost {
  private readonly logger = new Logger(JobProcessorService.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job: ${job.name} (ID: ${job.id})`);

    if (job.name === 'process-file') {
      const file = job.data;
      this.logger.log(`File to process: ${file.name}`);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    this.logger.log(`Job ${job.id} has completed.`);
  }
}
