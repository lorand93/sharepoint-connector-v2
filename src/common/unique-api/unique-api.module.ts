import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UniqueApiService } from './unique-api.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [UniqueApiService],
  exports: [UniqueApiService],
})
export class UniqueApiModule {}
