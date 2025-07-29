import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  ContentRegistrationRequest,
  ContentRegistrationResponse,
  IngestionFinalizationRequest,
  FileDiffFileItem,
  FileDiffRequest,
  FileDiffResponse,
} from './types/unique-api.types';

@Injectable()
export class UniqueApiService {
  private readonly logger = new Logger(UniqueApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Registers content with Unique API and returns upload URL
   */
  async registerContent(request: ContentRegistrationRequest, uniqueToken: string): Promise<ContentRegistrationResponse> {
    const graphqlUrl = this.configService.get<string>('uniqueApi.ingestionGraphQLUrl')!;

    const gqlQuery = {
      query: `
        mutation ContentUpsert(
          $input: ContentCreateInput!
          $scopeId: String
          $sourceOwnerType: String
          $sourceName: String
          $sourceKind: String
        ) {
          contentUpsert(
            input: $input
            scopeId: $scopeId
            sourceOwnerType: $sourceOwnerType
            sourceName: $sourceName
            sourceKind: $sourceKind
          ) {
            id
            key
            byteSize
            mimeType
            ownerType
            ownerId
            writeUrl
            readUrl
            createdAt
            internallyStoredAt
            source {
              kind
            }
          }
        }`,
      variables: {
        input: {
          title: request.title,
          key: request.key,
          mimeType: request.mimeType,
          ownerType: request.ownerType,
        },
        scopeId: request.scopeId,
        sourceOwnerType: request.sourceOwnerType,
        sourceKind: request.sourceKind,
        sourceName: request.sourceName,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(graphqlUrl, gqlQuery, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${uniqueToken}`,
          },
        }),
      );

      if (!response.data?.data?.contentUpsert) {
        throw new Error('Invalid response from Unique API content registration');
      }

      return response.data.data.contentUpsert;
    } catch (error) {
      this.logger.error('Content registration failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Performs file diff to determine which files need processing
   */
  async performFileDiff(fileList: FileDiffFileItem[], uniqueToken: string): Promise<FileDiffResponse> {
    const ingestionUrl = this.configService.get<string>('uniqueApi.ingestionUrl')!;
    const fileDiffUrl = `${ingestionUrl}/file-diff`;
    const scopeId = this.configService.get<string>('uniqueApi.scopeId')!;

    const diffRequest: FileDiffRequest = {
      basePath: 'https://next.qa.unique.app/',
      partialKey: 'sharepoint/a4b8e781-4fac-47d7-8cac-2b9151f9a878',
      sourceKind: 'MICROSOFT_365_SHAREPOINT',
      sourceName: 'SharePoint Online Connector',
      fileList: fileList,
      scope: scopeId,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(fileDiffUrl, diffRequest, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${uniqueToken}`,
          },
        }),
      );

      if (!response.data) {
        throw new Error('Invalid response from Unique API file diff');
      }

      return response.data as FileDiffResponse;
    } catch (error) {
      this.logger.error('File diff failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Finalizes ingestion after content upload
   */
  async finalizeIngestion(request: IngestionFinalizationRequest, uniqueToken: string): Promise<{ id: string }> {
    const graphqlUrl = this.configService.get<string>('uniqueApi.ingestionGraphQLUrl')!;

    const gqlQuery = {
      query: `
        mutation ContentUpsert(
          $input: ContentCreateInput!
          $scopeId: String
          $fileUrl: String
        ) {
          contentUpsert(
            input: $input
            scopeId: $scopeId
            fileUrl: $fileUrl
          ) {
            id
          }
        }`,
      variables: {
        input: {
          key: request.key,
          mimeType: request.mimeType,
          ownerType: request.ownerType,
          url: request.url,
        },
        scopeId: request.scopeId,
        fileUrl: request.fileUrl,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(graphqlUrl, gqlQuery, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${uniqueToken}`,
          },
        }),
      );

      if (!response.data?.data?.contentUpsert?.id) {
        throw new Error('Invalid response from Unique API ingestion finalization');
      }

      return { id: response.data.data.contentUpsert.id };
    } catch (error) {
      this.logger.error('Ingestion finalization failed:', error.response?.data || error.message);
      throw error;
    }
  }
}
