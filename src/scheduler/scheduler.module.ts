import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ScheduleModule } from '@nestjs/schedule';
import { SharepointScannerModule } from '../sharepoint-scanner/sharepoint-scanner.module';
import { DistributedLockModule } from '../common/lock/distributed-lock.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), 
    SharepointScannerModule,
    DistributedLockModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
