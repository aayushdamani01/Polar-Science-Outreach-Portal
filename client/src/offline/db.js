import { openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  STORE_PENDING_EXPEDITIONS,
  STORE_PENDING_CONTENT,
  STORE_EXPEDITION_CACHE,
  STORE_GLOBE_CACHE,
  STORE_SAVED_EXPEDITIONS,
} from './constants.js';

// Opens (and, on first run, creates) the offline IndexedDB database.
// Deliberately a single shared promise — idb dedupes concurrent opens, but
// keeping one module-level handle means every caller in the app talks to
// the same connection instead of re-opening it per call.
let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // pendingExpeditions — keyed by the client-generated localId (a
        // real expedition doesn't exist yet, so there's no server id to
        // key on). Indexed by status so the sync manager (Phase C) can
        // cheaply ask "what's still queued?" without scanning everything.
        if (!db.objectStoreNames.contains(STORE_PENDING_EXPEDITIONS)) {
          const store = db.createObjectStore(STORE_PENDING_EXPEDITIONS, { keyPath: 'localId' });
          store.createIndex('status', 'status');
          store.createIndex('createdAt', 'createdAt');
        }

        // expeditionCache — server expeditions the researcher has opened.
        // These records let the expedition editor reopen offline; they are a
        // cache, not the source of truth for unsynced queue work.
        if (!db.objectStoreNames.contains(STORE_EXPEDITION_CACHE)) {
          const store = db.createObjectStore(STORE_EXPEDITION_CACHE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }

        // pendingContent — same shape of indexing. Each entry may carry a
        // localExpeditionId (points at a pendingExpeditions row) instead of
        // a real expeditionId, until that expedition itself has synced —
        // that dependency resolution is Phase B/C, not stored here.
        if (!db.objectStoreNames.contains(STORE_PENDING_CONTENT)) {
          const store = db.createObjectStore(STORE_PENDING_CONTENT, { keyPath: 'localId' });
          store.createIndex('status', 'status');
          store.createIndex('createdAt', 'createdAt');
        }

        // globeCache — Phase 4. A single row holding the last successful
        // fetchExpeditionsForGlobe() result, so the landing page's
        // lightweight/offline view has real data to show without a network
        // call. Not the source of truth for anything — purely a read cache.
        if (!db.objectStoreNames.contains(STORE_GLOBE_CACHE)) {
          db.createObjectStore(STORE_GLOBE_CACHE, { keyPath: 'id' });
        }

        // savedExpeditions — DB_VERSION 4. Researcher-selected expedition
        // records (with their content blobs) explicitly saved for offline
        // reading via the Archive/"Save for offline" flow. Separate from
        // expeditionCache: that store is an incidental cache of whatever was
        // last opened, this one is a deliberate, durable "keep this" choice
        // that survives until the researcher removes it.
        if (!db.objectStoreNames.contains(STORE_SAVED_EXPEDITIONS)) {
          const store = db.createObjectStore(STORE_SAVED_EXPEDITIONS, { keyPath: 'storageKey' });
          store.createIndex('ownerId', 'ownerId');
          store.createIndex('savedAt', 'savedAt');
        }
      },
    });
  }
  return dbPromise;
}
