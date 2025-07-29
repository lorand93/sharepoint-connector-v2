import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PipelineService } from '../../pipeline/pipeline.service';
import { DriveItem } from '../../common/microsoft-graph/types/sharepoint.types';
import { JobResult } from '../../pipeline/types/processing-context';
import { MetricsService } from '../../common/metrics/metrics.service';

@Processor('sharepoint-tasks')
export class JobProcessorService extends WorkerHost {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly metricsService: MetricsService,
  ) {
    super();
  }

  async process(job: Job<DriveItem, JobResult, string>): Promise<JobResult> {
    const jobStartTime = Date.now();
    this.logger.log(`Processing job: ${job.name} (ID: ${job.id})`);

    if (job.name === 'process-file') {
      const file = job.data;
      this.logger.log(`Starting pipeline for file: ${file.name} (${file.id})`);

      try {
        const result = await this.pipelineService.processFile(file);

        if (result.success) {
          this.logger.log(`Job ${job.id} completed successfully. Pipeline duration: ${result.totalDuration}ms`);

          const jobResult: JobResult = {
            success: true,
            fileId: file.id,
            fileName: file.name,
            correlationId: result.context.correlationId,
            duration: result.totalDuration,
            completedSteps: result.completedSteps,
          };

          const jobDurationSeconds = (Date.now() - jobStartTime) / 1000;
          this.metricsService.recordJobCompleted(true, jobDurationSeconds);

          return jobResult;
        } else {
          this.logger.error(`Job ${job.id} failed. Error: ${result.error?.message}`);

          const jobDurationSeconds = (Date.now() - jobStartTime) / 1000;
          this.metricsService.recordJobCompleted(false, jobDurationSeconds);

          throw result.error || new Error('Pipeline processing failed');
        }
      } catch (error) {
        this.logger.error(`Job ${job.id} failed with error:`, error.stack);

        const jobDurationSeconds = (Date.now() - jobStartTime) / 1000;
        this.metricsService.recordJobCompleted(false, jobDurationSeconds);

        throw error; // BullMQ will handle the retry logic
      }
    } else {
      this.logger.error(`Unknown job type: ${job.name}`);
      throw new Error(`Unknown job type: ${job.name}`);
    }
  }
}
