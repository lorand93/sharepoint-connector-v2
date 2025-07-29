import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [MetricsController, HealthController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
