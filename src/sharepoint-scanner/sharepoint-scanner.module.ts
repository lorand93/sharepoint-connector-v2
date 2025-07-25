import { Module } from '@nestjs/common';
import { SharepointScannerService } from './sharepoint-scanner.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../common/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    // QueueModule, // Will be imported in a later iteration
  ],
  providers: [SharepointScannerService],
  exports: [SharepointScannerService],
})
export class SharepointScannerModule {
}
