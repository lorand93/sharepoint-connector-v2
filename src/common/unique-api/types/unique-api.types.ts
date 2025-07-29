export interface ContentRegistrationRequest {
  title: string;
  key: string;
  mimeType: string;
  ownerType: string;
  scopeId: string;
  sourceOwnerType: string;
  sourceKind: string;
  sourceName: string;
}

export interface ContentRegistrationResponse {
  id: string;
  key: string;
  byteSize: number;
  mimeType: string;
  ownerType: string;
  ownerId: string;
  writeUrl: string;
  readUrl: string;
  createdAt: string;
  internallyStoredAt?: string;
  source: {
    kind: string;
  };
}

export interface IngestionFinalizationRequest {
  key: string;
  mimeType: string;
  ownerType: string;
  url: string;
  scopeId: string;
  fileUrl: string;
}

export interface FileDiffFileItem {
  id: string;
  name: string;
  url: string;
  updatedAt: string;
  key: string;
}

export interface FileDiffRequest {
  basePath: string;
  partialKey: string;
  sourceKind: string;
  sourceName: string;
  fileList: FileDiffFileItem[];
  scope: string;
}

export interface FileDiffResponse {
  newAndUpdatedFiles: string[];
  deletedFiles: string[];
  unchangedFiles: string[];
  movedFiles: string[];
}
