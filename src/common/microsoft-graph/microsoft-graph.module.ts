import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SharepointApiService } from './sharepoint-api.service';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, AuthModule, ConfigModule],
  providers: [SharepointApiService],
  exports: [SharepointApiService],
})
export class MicrosoftGraphModule {}
