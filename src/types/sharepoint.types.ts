export interface SharePointSiteConfig {
  url: string;
  syncColumn: string;
  description?: string;
}

export interface SharePointConfig {
  sites: SharePointSiteConfig[];
}

export interface SharePointFile {
  id: string;
  name: string;
  webUrl: string;
  driveId: string;
  itemId: string;
  lastModifiedDateTime: string;
  moderationStatus?: number;
  syncColumnValue?: boolean;
  siteUrl: string;
  libraryName: string;
}

export interface ScanResult {
  totalSites: number;
  totalFiles: number;
  filesToSync: SharePointFile[];
  errors: string[];
}
