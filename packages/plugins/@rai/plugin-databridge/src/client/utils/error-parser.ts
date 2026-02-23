export interface GroupedErrors {
  duplicates: { name: string; collection: string }[];
  missingCollections: string[];
  other: string[];
}

export function groupSyncErrors(errors: string[]): GroupedErrors {
  const grouped: GroupedErrors = {
    duplicates: [],
    missingCollections: [],
    other: [],
  };

  for (const error of errors) {
    // Parse "Duplicate name 'SG-005' from collection 'robots'"
    const dupMatch = error.match(/Duplicate name '([^']+)' from collection '([^']+)'/);
    if (dupMatch) {
      grouped.duplicates.push({ name: dupMatch[1], collection: dupMatch[2] });
      continue;
    }
    // Parse "Collection 'foo' no longer exists"
    const missingMatch = error.match(/Collection '([^']+)' no longer exists/);
    if (missingMatch) {
      grouped.missingCollections.push(missingMatch[1]);
      continue;
    }
    grouped.other.push(error);
  }

  return grouped;
}
