import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, register, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  // Scanner Metrics
  public readonly scanTotal: Counter<string>;
  public readonly scanDuration: Histogram<string>;
  public readonly filesDiscovered: Counter<string>;
  public readonly fileDiffResults: Counter<string>;
  public readonly filesQueued: Counter<string>;
  public readonly scanErrors: Counter<string>;

  // Pipeline Metrics
  public readonly pipelineExecutions: Counter<string>;
  public readonly pipelineDuration: Histogram<string>;
  public readonly pipelineStepDuration: Histogram<string>;
  public readonly filesProcessed: Counter<string>;
  public readonly fileSizeBytes: Histogram<string>;

  // Queue Metrics
  public readonly queueSize: Gauge<string>;
  public readonly jobsProcessed: Counter<string>;
  public readonly jobsDuration: Histogram<string>;

  // Health Metrics
  public readonly connectorUp: Gauge<string>;

  constructor() {
    // Initialize default Node.js metrics
    collectDefaultMetrics({ prefix: 'sharepoint_connector_' });

    // Scanner Metrics
    this.scanTotal = new Counter({
      name: 'sharepoint_scan_total',
      help: 'Total number of SharePoint scans initiated',
    });

    this.scanDuration = new Histogram({
      name: 'sharepoint_scan_duration_seconds',
      help: 'Duration of SharePoint scans in seconds',
      buckets: [1, 5, 10, 30, 60, 120, 300],
    });

    this.filesDiscovered = new Counter({
      name: 'sharepoint_files_discovered_total',
      help: 'Total number of files discovered during scan',
      labelNames: ['site'],
    });

    this.fileDiffResults = new Counter({
      name: 'sharepoint_file_diff_results_total',
      help: 'File diff results breakdown',
      labelNames: ['result_type'],
    });

    this.filesQueued = new Counter({
      name: 'sharepoint_files_queued_total',
      help: 'Total number of files successfully queued for processing',
    });

    this.scanErrors = new Counter({
      name: 'sharepoint_scan_errors_total',
      help: 'Total number of scan errors',
      labelNames: ['site', 'error_type'],
    });

    // Pipeline Metrics
    this.pipelineExecutions = new Counter({
      name: 'sharepoint_pipeline_executions_total',
      help: 'Total number of pipeline executions',
      labelNames: ['status'],
    });

    this.pipelineDuration = new Histogram({
      name: 'sharepoint_pipeline_duration_seconds',
      help: 'Duration of complete pipeline execution in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    });

    this.pipelineStepDuration = new Histogram({
      name: 'sharepoint_pipeline_step_duration_seconds',
      help: 'Duration of individual pipeline steps in seconds',
      labelNames: ['step'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    this.filesProcessed = new Counter({
      name: 'sharepoint_files_processed_total',
      help: 'Total number of files processed through pipeline',
      labelNames: ['status'],
    });

    this.fileSizeBytes = new Histogram({
      name: 'sharepoint_file_size_bytes',
      help: 'Size of files being processed in bytes',
      buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600], // 1KB to 100MB
    });

    // Queue Metrics
    this.queueSize = new Gauge({
      name: 'sharepoint_queue_size',
      help: 'Current number of jobs in the SharePoint processing queue',
    });

    this.jobsProcessed = new Counter({
      name: 'sharepoint_jobs_processed_total',
      help: 'Total number of jobs processed',
      labelNames: ['status'],
    });

    this.jobsDuration = new Histogram({
      name: 'sharepoint_jobs_duration_seconds',
      help: 'Duration of job processing in seconds',
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
    });

    // Health Metrics
    this.connectorUp = new Gauge({
      name: 'sharepoint_connector_up',
      help: 'SharePoint connector health status (1 = healthy, 0 = unhealthy)',
    });
  }

  onModuleInit() {
    // Set initial health status to healthy
    this.connectorUp.set(1);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    register.clear();
  }

  /**
   * Record scan metrics
   */
  recordScanStarted(): void {
    this.scanTotal.inc();
  }

  recordScanCompleted(durationSeconds: number): void {
    this.scanDuration.observe(durationSeconds);
  }

  recordFilesDiscovered(count: number, siteId?: string): void {
    this.filesDiscovered.inc({ site: siteId || 'unknown' }, count);
  }

  recordFileDiffResults(newAndUpdated: number, unchanged: number, deleted: number, moved: number): void {
    this.fileDiffResults.inc({ result_type: 'new_and_updated' }, newAndUpdated);
    this.fileDiffResults.inc({ result_type: 'unchanged' }, unchanged);
    this.fileDiffResults.inc({ result_type: 'deleted' }, deleted);
    this.fileDiffResults.inc({ result_type: 'moved' }, moved);
  }

  recordFilesQueued(count: number): void {
    this.filesQueued.inc(count);
  }

  recordScanError(siteId: string, errorType: string): void {
    this.scanErrors.inc({ site: siteId, error_type: errorType });
  }

  recordPipelineCompleted(success: boolean, durationSeconds: number): void {
    this.pipelineExecutions.inc({ status: success ? 'success' : 'failure' });
    this.pipelineDuration.observe(durationSeconds);
    this.filesProcessed.inc({ status: success ? 'success' : 'failure' });
  }

  recordPipelineStepDuration(stepName: string, durationSeconds: number): void {
    this.pipelineStepDuration.observe({ step: stepName }, durationSeconds);
  }

  recordFileSize(sizeBytes: number): void {
    this.fileSizeBytes.observe(sizeBytes);
  }

  /**
   * Record queue metrics
   */
  setQueueSize(size: number): void {
    this.queueSize.set(size);
  }

  recordJobCompleted(success: boolean, durationSeconds: number): void {
    this.jobsProcessed.inc({ status: success ? 'success' : 'failure' });
    this.jobsDuration.observe(durationSeconds);
  }

  /**
   * Set health status
   */
  setHealthy(healthy: boolean): void {
    this.connectorUp.set(healthy ? 1 : 0);
  }
}
