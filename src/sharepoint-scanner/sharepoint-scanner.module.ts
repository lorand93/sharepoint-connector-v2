import { Module } from '@nestjs/common';
import { SharepointScannerService } from './sharepoint-scanner.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../common/auth/auth.module';
import { MicrosoftGraphModule } from '../common/microsoft-graph/microsoft-graph.module';
import { HttpModule } from '@nestjs/axios';
import { QueueModule } from '../queue/queue.module';
import { UniqueApiModule } from '../common/unique-api/unique-api.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MicrosoftGraphModule,
    HttpModule,
    QueueModule,
    UniqueApiModule,
  ],
  providers: [SharepointScannerService],
  exports: [SharepointScannerService],
})
export class SharepointScannerModule {}
