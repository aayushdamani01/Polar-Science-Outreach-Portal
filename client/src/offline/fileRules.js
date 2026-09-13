// Phase 7 — large files / videos.
//
// The server already enforces a 100MB cap and a MIME allow-list
// (server/src/middleware/upload.middleware.js). Offline, that enforcement
// arrives far too late to be useful: a researcher picks a 400MB dive video
// in the field, the app cheerfully queues it, and the rejection only lands
// days later when the ship regains a signal — by which time re-shooting or
// re-exporting is impossible.
//
// These rules mirror the server's so the same file is rejected at the moment
// it is chosen, while the researcher can still do something about it. Keep
// this list in step with the server's ALLOWED_MIME_TYPES.

import { formatBytes } from './storage.js';

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // must match multer's limit

// Not a hard limit — just the point where a satellite uplink makes the
// upload a multi-hour affair worth warning about before it is queued.
export const LARGE_FILE_WARN_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

// Some browsers hand back an empty or generic type for CSV/Excel picked from
// certain file managers; fall back to the extension before rejecting, since
// the server sees the same MIME we forward and a false rejection here would
// block a legitimate dataset.
const EXTENSION_FALLBACK = {
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export function resolveMimeType(file) {
  if (file?.type && ALLOWED_MIME_TYPES.includes(file.type)) return file.type;
  const ext = file?.name?.split('.').pop()?.toLowerCase();
  return EXTENSION_FALLBACK[ext] || file?.type || '';
}

// Returns { ok, error, warning }. `error` blocks the file outright;
// `warning` is advisory and still allows queuing.
export function validateFile(file) {
  if (!file) return { ok: false, error: 'No file selected.' };

  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" is empty (0 bytes) and cannot be uploaded.` };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error:
        `"${file.name}" is ${formatBytes(file.size)}. The maximum accepted size is ` +
        `${formatBytes(MAX_FILE_SIZE_BYTES)} — compress or trim it before uploading.`,
    };
  }

  const mime = resolveMimeType(file);
  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    return {
      ok: false,
      error: `"${file.name}" is a file type the portal does not accept${mime ? ` (${mime})` : ''}.`,
    };
  }

  if (file.size > LARGE_FILE_WARN_BYTES) {
    return {
      ok: true,
      warning: `"${file.name}" is ${formatBytes(file.size)} — it will upload slowly on a weak link, but it stays saved on this device until it succeeds.`,
    };
  }

  return { ok: true };
}
