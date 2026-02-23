export interface Platform {
  id: number;
  name: string;
  slug: string;
  collectionName: string;
  description?: string;
  registeredCollections: string[];
}

export interface CollectionInfo {
  name: string;
  title: string;
  hasNameField: boolean;
  isSynced: boolean;
}

export interface DuplicateError {
  withinNewCollections?: { name: string; collections: string[] }[];
  withExistingEntries?: { name: string; newCollection: string; existingCollection: string }[];
}

export interface LookupEntry {
  id: number;
  name: string;
  collection: string;
  collectionTitle: string;
  assetId: string;
}

export interface SyncResult {
  synced: number;
  collections: number;
  errors?: string[];
}
