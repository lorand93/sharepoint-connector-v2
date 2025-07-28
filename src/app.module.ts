import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation-schema';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SharepointScannerModule } from './sharepoint-scanner/sharepoint-scanner.module';
import { AuthModule } from './common/auth/auth.module';
import { MicrosoftGraphModule } from './common/microsoft-graph/microsoft-graph.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    SchedulerModule,
    SharepointScannerModule,
    AuthModule,
    MicrosoftGraphModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
