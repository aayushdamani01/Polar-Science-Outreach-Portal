import { getDb } from './db.js';
import { STORE_SAVED_EXPEDITIONS } from './constants.js';
import { ensureSpaceFor, withStorageErrors } from './storage.js';

function storageKey(ownerId, expeditionId) {
  return `${ownerId}:${expeditionId}`;
}

function filenameFromUrl(url, fallback) {
  if (!url) return fallback;
  try {
    const last = new URL(url, window.location.origin).pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last || fallback);
  } catch {
    return fallback;
  }
}

async function downloadBlob(url, fallbackName) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return {
      blob,
      name: filenameFromUrl(url, fallbackName),
      type: blob.type || 'application/octet-stream',
    };
  } catch (error) {
    console.warn('Could not cache offline file:', url, error);
    return null;
  }
}

async function cacheContentItem(item) {
  const offlineFile = await downloadBlob(item.fileUrl, `${item.title || item.id}-file`);
  let offlineThumbnail = null;
  if (item.thumbnailUrl && item.thumbnailUrl !== item.fileUrl) {
    offlineThumbnail = await downloadBlob(item.thumbnailUrl, `${item.title || item.id}-thumbnail`);
  }

  return {
    ...item,
    offlineFile,
    offlineThumbnail,
  };
}

export async function saveExpeditionOffline({ ownerId, expedition, content }) {
  if (!ownerId || !expedition?.id) throw new Error('A signed-in researcher and expedition are required.');

  const groups = ['reports', 'photos', 'data'];
  const savedContent = {};
  let totalFiles = 0;
  let savedFiles = 0;

  for (const group of groups) {
    const items = Array.isArray(content?.[group]) ? content[group] : [];
    savedContent[group] = [];
    for (const item of items) {
      if (item.fileUrl) totalFiles += 1;
      const saved = await cacheContentItem(item);
      if (saved.offlineFile) savedFiles += 1;
      savedContent[group].push(saved);
    }
  }

  // Same Phase 7 safety net the sync queue uses: a researcher saving a
  // handful of expeditions' worth of photos/videos for offline reading can
  // fill a device just as easily as the upload queue can, and a silent
  // QuotaExceededError here would look like "Save offline" simply did
  // nothing.
  const totalBytes = [
    ...Object.values(savedContent).flat(),
  ].reduce((sum, item) => sum + (item.offlineFile?.blob?.size || 0) + (item.offlineThumbnail?.blob?.size || 0), 0);
  if (totalBytes) await ensureSpaceFor(totalBytes);

  const db = await getDb();
  const record = {
    storageKey: storageKey(ownerId, expedition.id),
    ownerId,
    expeditionId: expedition.id,
    expedition,
    content: savedContent,
    savedAt: new Date().toISOString(),
    totalFiles,
    savedFiles,
  };
  await withStorageErrors(() => db.put(STORE_SAVED_EXPEDITIONS, record), expedition.name || 'this expedition');
  return record;
}

export async function getSavedExpeditions(ownerId) {
  if (!ownerId) return [];
  const db = await getDb();
  const all = await db.getAll(STORE_SAVED_EXPEDITIONS);
  return all
    .filter((item) => item.ownerId === ownerId)
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export async function getSavedExpedition(ownerId, expeditionId) {
  if (!ownerId || !expeditionId) return null;
  const db = await getDb();
  return (await db.get(STORE_SAVED_EXPEDITIONS, storageKey(ownerId, expeditionId))) || null;
}

export async function isExpeditionSaved(ownerId, expeditionId) {
  return Boolean(await getSavedExpedition(ownerId, expeditionId));
}

export async function removeSavedExpedition(ownerId, expeditionId) {
  const db = await getDb();
  await db.delete(STORE_SAVED_EXPEDITIONS, storageKey(ownerId, expeditionId));
}
