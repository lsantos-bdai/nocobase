export interface DuplicateInfo {
  withinNewCollections?: { name: string; collections: string[] }[];
  withExistingEntries?: { name: string; newCollection: string; existingCollection: string }[];
}

export class DuplicateNamesError extends Error {
  status = 400;
  duplicates: DuplicateInfo;

  constructor(duplicates: DuplicateInfo) {
    super('Duplicate asset names found');
    this.name = 'DuplicateNamesError';
    this.duplicates = duplicates;
  }
}
