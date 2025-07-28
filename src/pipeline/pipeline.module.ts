import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PipelineService } from './pipeline.service';
import { TokenValidationStep } from './steps/token-validation.step';
import { ContentFetchingStep } from './steps/content-fetching.step';
import { ContentRegistrationStep } from './steps/content-registration.step';
import { StorageUploadStep } from './steps/storage-upload.step';
import { IngestionFinalizationStep } from './steps/ingestion-finalization.step';

@Module({
  imports: [ConfigModule],
  providers: [
    PipelineService,
    TokenValidationStep,
    ContentFetchingStep,
    ContentRegistrationStep,
    StorageUploadStep,
    IngestionFinalizationStep,
  ],
  exports: [PipelineService],
})
export class PipelineModule {} 