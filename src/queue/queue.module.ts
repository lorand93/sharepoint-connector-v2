import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './queue.service';
import { JobProcessorService } from './job-processor/job-processor.service';

@Module({
  imports: [ConfigModule],
  providers: [QueueService, JobProcessorService],
  exports: [QueueService],
})
export class QueueModule {}
