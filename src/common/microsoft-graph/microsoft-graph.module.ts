import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SharepointApiService } from './sharepoint-api.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    AuthModule,
  ],
  providers: [SharepointApiService],
  exports: [SharepointApiService],
})
export class MicrosoftGraphModule {}
