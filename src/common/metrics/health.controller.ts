import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('health')
export class HealthController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  healthCheck() {
    // Basic health check - in a real implementation we might check:
    // - external service availability
    // - queue health
    // - memory usage

    this.metricsService.setHealthy(true);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('ready')
  readinessCheck() {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  livenessCheck() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
