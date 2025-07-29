import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { ScheduleModule } from '@nestjs/schedule';
import { SharepointScannerModule } from '../sharepoint-scanner/sharepoint-scanner.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), 
    SharepointScannerModule,
    ConfigModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
