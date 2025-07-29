import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PipelineService } from './pipeline.service';
import { TokenValidationStep } from './steps/token-validation.step';
import { ContentFetchingStep } from './steps/content-fetching.step';
import { ContentRegistrationStep } from './steps/content-registration.step';
import { StorageUploadStep } from './steps/storage-upload.step';
import { IngestionFinalizationStep } from './steps/ingestion-finalization.step';
import { MicrosoftGraphModule } from '../common/microsoft-graph/microsoft-graph.module';
import { AuthModule } from '../common/auth/auth.module';
import { UniqueApiModule } from '../common/unique-api/unique-api.module';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    MicrosoftGraphModule,
    AuthModule,
    UniqueApiModule
  ],
  providers: [
    PipelineService,
    TokenValidationStep,
    ContentFetchingStep,
    ContentRegistrationStep,
    StorageUploadStep,
    IngestionFinalizationStep
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
