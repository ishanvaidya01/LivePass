import { openDB } from 'idb';

const DB_NAME = 'checkedin-scans';
const STORE_NAME = 'scans';
const DB_VERSION = 1;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('eventId', 'eventId');
        store.createIndex('status', 'status');
      }
    },
  });
};

export const addScan = async (scan) => {
  if (scan.registrationId) {
    await removeScansByRegistrationId(scan.registrationId);
  }
  const db = await initDB();
  await db.put(STORE_NAME, scan);
};

export const getScans = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const removeScan = async (id) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const updateScanStatus = async (id, status, errorMsg, incrementAttempt = false) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const scan = await store.get(id);
  
  if (scan) {
    scan.status = status;
    if (errorMsg) scan.error = errorMsg;
    if (incrementAttempt) scan.syncAttempts = (scan.syncAttempts || 0) + 1;
    await store.put(scan);
  }
  await tx.done;
};

export const clearScansForEvent = async (eventId) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('eventId');
  const cursor = await index.openCursor(IDBKeyRange.only(eventId));
  
  while (cursor) {
    if (cursor.value.status === 'REJECTED_CONFLICT' || cursor.value.status === 'SYNC_FAILED') {
      await cursor.delete();
    }
    cursor.continue();
  }
  await tx.done;
};

export const clearAllConflicts = async () => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  let cursor = await store.openCursor();
  
  while (cursor) {
    if (cursor.value.status === 'REJECTED_CONFLICT') {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};

export const removeScansByRegistrationId = async (registrationId) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  let cursor = await store.openCursor();
  
  while (cursor) {
    if (cursor.value.registrationId === registrationId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};
