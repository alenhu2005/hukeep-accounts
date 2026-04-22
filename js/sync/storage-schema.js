export function readClientSchemaVersionFromStorage(schemaKey) {
  try {
    const raw = localStorage.getItem(schemaKey);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

export function upgradeClientStorageSchema({
  schemaKey,
  targetVersion,
  clearLedgerLocalStorage,
  resetKeys = [],
  onReset = () => {},
}) {
  try {
    const current = readClientSchemaVersionFromStorage(schemaKey);
    if (current >= targetVersion) return false;
    clearLedgerLocalStorage();
    resetKeys.forEach(key => localStorage.removeItem(key));
    localStorage.setItem(schemaKey, String(targetVersion));
    onReset();
    return true;
  } catch {
    return false;
  }
}
