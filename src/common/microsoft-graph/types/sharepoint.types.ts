export enum ModerationStatus {
  Approved = 0,
  Rejected = 1,
  Pending = 2,
  Draft = 3,
}

export interface Drive {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: {
    childCount: number;
  };
  file?: {
    mimeType: string;
  };
  listItem: ListItem;
  parentReference?: {
    driveId: string;
    siteId: string;
    path?: string;
  };
}

export interface ListItem {
  lastModifiedDateTime: string;
  createdDateTime: string;
  fields?: ListItemFields;
}

export interface ListItemFields {
  id: string;
  OData__ModerationStatus?: ModerationStatus;
  [key: string]: any;
}
