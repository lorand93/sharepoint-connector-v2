import { Module } from '@nestjs/common';
import { SharepointScannerService } from './sharepoint-scanner.service';

@Module({
  providers: [SharepointScannerService],
  exports: [SharepointScannerService],
})
export class SharepointScannerModule {
}
