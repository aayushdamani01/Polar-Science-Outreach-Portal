import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client';
import { parseDatasetFull, inferColumnType } from '../utils/parseDataset';
import { buildOceanSection } from '../utils/oceanSection.js';
import OceanSection3D from '../components/OceanSection3D.jsx';
import TempSalinityDepth3D from '../components/TempSalinityDepth3D.jsx';
import { fetchExpeditionsList, createExpedition } from '../api/expeditions.js';
import { generateSummary, editSummary } from '../api/ai.js';
import { enqueueContent, enqueueExpedition, generateLocalId } from '../offline/queue.js';
import { validateFile } from '../offline/fileRules.js';
import { OfflineStorageError } from '../offline/storage.js';
import toast from 'react-hot-toast';
import DatasetPreviewCard from '../components/DatasetPreviewCard.jsx';
import RichTextEditor from '../components/RichTextEditor.jsx';
import {
  Plus,
  Trash2,
  Sparkles,
  Database,
  FileText,
  BookOpen,
  Image as ImageIcon,
  Video,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FolderPlus,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Check,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'dataset', label: 'Dataset' },
  { value: 'report', label: 'Report' },
  { value: 'publication', label: 'Publication' },
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
];

// Icon + accent used on each item card's header so a stack of items is
// scannable at a glance instead of reading as identical grey boxes.
const TYPE_META = {
  dataset: { icon: Database, accent: 'text-cyan-400' },
  report: { icon: FileText, accent: 'text-amber-400' },
  publication: { icon: BookOpen, accent: 'text-violet-400' },
  photo: { icon: ImageIcon, accent: 'text-emerald-400' },
  video: { icon: Video, accent: 'text-rose-400' },
};

const REGION_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'Arctic', label: 'Arctic' },
  { value: 'Antarctic', label: 'Antarctic' },
  { value: 'Himalaya', label: 'Himalaya' },
  { value: 'Southern_Ocean', label: 'Southern Ocean' },
  { value: 'Other', label: 'Other' },
];

const PREVIEW_ROWS = 8;

// Content types where a full write-up (body) and AI summary make sense.
// Photos/videos/datasets get a short caption only — the article is what
// reports and publications are for.
const ARTICLE_TYPES = ['report', 'publication'];

// --- Shared style tokens ------------------------------------------------
// One place for the recurring input/label/button treatments so every field
// on this page looks consistent instead of drifting className by className.
const FIELD_LABEL = 'block text-sm text-slate-300 mb-1.5';
const FIELD_HELP = 'mt-1.5 text-xs text-slate-500';
const FIELD_ERROR = 'mt-1.5 text-xs text-red-400 flex items-center gap-1';
const INPUT_BASE =
  'w-full px-3.5 py-2.5 rounded-lg bg-slate-900/70 border text-white placeholder:text-slate-600 transition-colors focus:outline-none focus:ring-1';
const inputClass = (hasError) =>
  `${INPUT_BASE} ${
    hasError
      ? 'border-red-500/70 focus:border-red-400 focus:ring-red-400'
      : 'border-slate-700 focus:border-cyan-400 focus:ring-cyan-400'
  }`;
const SECONDARY_BTN =
  'px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800/70 hover:border-cyan-500 hover:text-cyan-300 text-xs text-slate-300 transition-colors disabled:opacity-40 disabled:pointer-events-none';

// Strips HTML tags so the AI summarizer gets plain text, not markup.
function htmlToPlainText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || div.innerText || '').trim();
}

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Pure helpers (no React state involved) ---------------------------

function generateCSVFromTable(table) {
  const { columns = [], rows = [] } = table;
  if (!columns.length) return '';
  const escapeCell = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [];
  lines.push(columns.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return lines.join('\n');
}

function buildFileFromManualTable(table, title) {
  const csv = generateCSVFromTable(table);
  const safeName = (title || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  return new File([blob], safeName + '.csv', { type: 'text/csv' });
}

function parseManualTableMeta(table) {
  const { columns = [], rows = [] } = table;
  if (!columns.length) throw new Error('Table needs at least one column.');
  return {
    row_count: rows.length,
    columns: columns.map((name, idx) => {
      const colName = String(name ?? `column_${idx + 1}`).trim() || `column_${idx + 1}`;
      return {
        name: colName,
        type: inferColumnType(rows.map((r) => r[idx])),
      };
    }),
    preview_rows: rows
      .slice(0, PREVIEW_ROWS)
      .map((r) => r.map((v) => (v === undefined || v === null ? '' : String(v)))),
  };
}

function makeBlankItem(key) {
  return {
    key,
    type: 'dataset',
    title: '',
    description: '',
    body: '',
    summary: '',
    // AI summary state: 'idle' | 'generating' | 'success' | 'error'.
    // aiGeneration holds { id, aiOutput } for the saved AiGeneration row
    // once one exists, so an edited description can be persisted as an
    // audit trail via PATCH /api/ai/:id/edit on submit.
    aiStatus: 'idle',
    aiGeneration: null,
    file: null,
    parseStatus: 'idle', // 'idle' | 'parsing' | 'success' | 'error'
    datasetMeta: null,
    oceanSection: null,
    manualTable: { columns: [], rows: [] },
  };
}

// Labels items by type + running count within that type ("Dataset 1",
// "Photo 2", "Report 3"...) instead of a generic, non-descriptive index —
// makes a stack of mixed-type items scannable at a glance.
function computeItemLabels(items) {
  const counts = {};
  return items.map((it) => {
    counts[it.type] = (counts[it.type] || 0) + 1;
    const typeLabel = TYPE_OPTIONS.find((t) => t.value === it.type)?.label || 'Item';
    return `${typeLabel} ${counts[it.type]}`;
  });
}

// --- Drag-and-drop file picker ------------------------------------------
// Shared by both the dataset file field and the generic (photo/video/report)
// file field. Shows a real drop target instead of a bare <input type=file>,
// plus an inline preview once a file is chosen (thumbnail for images/video,
// name+type+size otherwise).
function FileDropZone({ accept, file, onFileChange, previewKind = 'none', helperText, hasError }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const previewUrl = useMemo(() => {
    if (!file || previewKind === 'none') return null;
    return URL.createObjectURL(file);
  }, [file, previewKind]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-950/20'
            : hasError
              ? 'border-red-500/60 bg-slate-900/40'
              : 'border-slate-700 hover:border-slate-500 bg-slate-900/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) onFileChange(selected);
          }}
        />

        {!file ? (
          <div className="flex flex-col items-center justify-center py-4 text-center gap-1.5">
            <UploadCloud className="w-6 h-6 text-slate-500" />
            <p className="text-sm text-slate-300">
              Drop a file here, or <span className="text-cyan-400 font-medium">browse</span>
            </p>
            {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
          </div>
        ) : previewKind === 'image' && previewUrl ? (
          <div className="flex items-center gap-3">
            <img src={previewUrl} alt="" className="w-16 h-16 object-cover rounded-md border border-slate-700 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)} · click to replace</p>
            </div>
          </div>
        ) : previewKind === 'video' && previewUrl ? (
          <div className="flex items-center gap-3">
            <video src={previewUrl} className="w-24 h-16 object-cover rounded-md border border-slate-700 shrink-0" muted />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.size)} · click to replace</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-slate-500">
                {file.type || 'Unknown type'} · {formatBytes(file.size)} · click to replace
              </p>
            </div>
          </div>
        )}
      </div>
      {hasError && (
        <p className={FIELD_ERROR}>
          <AlertCircle className="w-3.5 h-3.5" /> {hasError}
        </p>
      )}
    </div>
  );
}

function UploadPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // --- Expedition: attach to an existing one, or log a new one ---------
  const [expeditionMode, setExpeditionMode] = useState('new'); // 'existing' | 'new'
  const [expeditionsList, setExpeditionsList] = useState([]);
  const [expeditionsStatus, setExpeditionsStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [selectedExpeditionId, setSelectedExpeditionId] = useState('');
  const [newExpedition, setNewExpedition] = useState({
    name: '',
    region: '',
    description: '',
    start_date: '',
    end_date: '',
    latitude: '',
    longitude: '',
  });

  useEffect(() => {
    fetchExpeditionsList()
      .then((list) => {
        setExpeditionsList(list);
        setExpeditionsStatus('ready');
        // If expeditions already exist, default to attaching to one rather
        // than nudging the researcher toward creating a duplicate.
        if (list.length > 0) {
          setExpeditionMode('existing');
          setSelectedExpeditionId(list[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load expeditions', err);
        setExpeditionsStatus('error');
      });
  }, []);

  // --- Content items: one expedition can carry many uploads at once -----
  const nextKeyRef = useRef(1);
  const [items, setItems] = useState(() => [makeBlankItem(0)]);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  // Validation errors only surface after a submit attempt, so the form
  // doesn't greet a researcher with a wall of red on first load.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const itemLabels = useMemo(() => computeItemLabels(items), [items]);

  const updateItem = useCallback((key, patch) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const addItem = useCallback(() => {
    const key = nextKeyRef.current++;
    setItems((list) => [...list, makeBlankItem(key)]);
  }, []);

  const removeItem = useCallback((key) => {
    setItems((list) => (list.length <= 1 ? list : list.filter((it) => it.key !== key)));
    setCollapsedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((key) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Switching an item's type clears whatever file/dataset state belonged to
  // its previous type, so e.g. a parsed CSV doesn't silently ride along
  // after switching that item from Dataset to Photo.
  const handleItemTypeChange = (key, type) => {
    updateItem(key, {
      type,
      file: null,
      parseStatus: 'idle',
      datasetMeta: null,
      oceanSection: null,
    });
  };

  // Dataset-type file selection — parses CSV/Excel client-side for the
  // preview, and (in the same pass, via parseDatasetFull) checks whether it
  // looks like a depth profile that the in-browser 3D viewer can render.
  const handleDatasetFileChange = async (key, selectedFile) => {
    if (!selectedFile) return;

    // Phase 7: reject what the server would reject, now, while the researcher
    // still has the source file in front of them. Finding out days later on a
    // ship that a dataset was the wrong type is not a recoverable situation.
    const check = validateFile(selectedFile);
    if (!check.ok) {
      toast.error(check.error, { duration: 8000 });
      return;
    }
    if (check.warning) toast(check.warning, { duration: 8000 });

    updateItem(key, { file: selectedFile, parseStatus: 'parsing', datasetMeta: null, oceanSection: null });
    try {
      const { meta, headers, rows } = await parseDatasetFull(selectedFile);
      const oceanSection = buildOceanSection(headers, rows);
      updateItem(key, { datasetMeta: meta, oceanSection, parseStatus: 'success' });
    } catch (err) {
      console.error('Dataset parse error:', err);
      updateItem(key, { parseStatus: 'error' });
    }
  };

  // Any other type — any file, no parsing, straight to Cloudinary on submit.
  const handleGenericFileChange = (key, selectedFile) => {
    if (!selectedFile) return;

    const check = validateFile(selectedFile);
    if (!check.ok) {
      toast.error(check.error, { duration: 8000 });
      return;
    }
    if (check.warning) toast(check.warning, { duration: 8000 });

    updateItem(key, { file: selectedFile });
  };

  // AI summary: takes the plain text of the article body, asks the backend
  // for a ~100-150 word web summary, and puts it in its own Summary field
  // (kept separate from the hand-written Description above it — generating
  // one shouldn't overwrite the other). Still editable afterwards; the edit
  // gets persisted on submit, see handleSubmit.
  const handleGenerateSummary = async (key, item) => {
    const plainText = htmlToPlainText(item.body);
    if (!plainText) {
      toast.error("Write the article body first — there's nothing to summarize yet.");
      return;
    }
    updateItem(key, { aiStatus: 'generating' });
    try {
      const result = await generateSummary(plainText, { type: 'web_summary' });
      updateItem(key, {
        aiStatus: 'success',
        summary: result.aiOutput,
        aiGeneration: { id: result.id, aiOutput: result.aiOutput },
      });
    } catch (err) {
      console.error('AI summary generation failed:', err);
      updateItem(key, { aiStatus: 'error' });
    }
  };

  // --- Manual table builder, scoped to a single item --------------------
  const addManualRow = (key) => {
    setItems((list) =>
      list.map((it) =>
        it.key === key
          ? { ...it, manualTable: { columns: it.manualTable.columns, rows: [...it.manualTable.rows, Array(it.manualTable.columns.length).fill('')] } }
          : it
      )
    );
  };

  const removeManualRow = (key) => {
    setItems((list) =>
      list.map((it) =>
        it.key === key
          ? { ...it, manualTable: { columns: it.manualTable.columns, rows: it.manualTable.rows.slice(0, -1) } }
          : it
      )
    );
  };

  const addManualColumn = (key) => {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        return {
          ...it,
          manualTable: {
            columns: [...it.manualTable.columns, `Column ${it.manualTable.columns.length + 1}`],
            rows: it.manualTable.rows.map((row) => [...row, '']),
          },
        };
      })
    );
  };

  const removeManualColumn = (key) => {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        if (it.manualTable.columns.length <= 1) return it;
        return {
          ...it,
          manualTable: {
            columns: it.manualTable.columns.slice(0, -1),
            rows: it.manualTable.rows.map((row) => row.slice(0, -1)),
          },
        };
      })
    );
  };

  const setManualCell = (key, rowIdx, colIdx, value) => {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const newRows = it.manualTable.rows.map((r) => [...r]);
        newRows[rowIdx][colIdx] = value;
        return { ...it, manualTable: { columns: it.manualTable.columns, rows: newRows } };
      })
    );
  };

  const parseManualForItem = (key, item) => {
    if (!item.manualTable.columns.length) {
      toast.error('Table needs at least one column.');
      return;
    }
    try {
      const result = parseManualTableMeta(item.manualTable);
      const oceanSection = buildOceanSection(item.manualTable.columns, item.manualTable.rows);
      updateItem(key, { datasetMeta: result, oceanSection, parseStatus: 'success' });
    } catch (err) {
      console.error('Manual table parse error:', err);
      updateItem(key, { parseStatus: 'error' });
    }
  };

  // --- Validation ----------------------------------------------------
  // Computed on every render (cheap — a handful of items at most) and only
  // displayed inline once submitAttempted flips true, so errors show up
  // next to the field that caused them instead of an alert() dialog.
  const validate = useCallback(() => {
    const errs = { expedition: null, items: {} };
    if (expeditionMode === 'existing' && !selectedExpeditionId) {
      errs.expedition = 'Choose an expedition to attach this content to.';
    }
    if (expeditionMode === 'new' && !newExpedition.name.trim()) {
      errs.expedition = 'Give the new expedition a name.';
    }
    for (const item of items) {
      const itemErrors = {};
      if (!item.title.trim()) itemErrors.title = 'Title is required.';
      if (item.type === 'dataset' && !item.datasetMeta) {
        itemErrors.file = 'Upload a file or parse a table first.';
      }
      if (item.type !== 'dataset' && !item.file) {
        itemErrors.file = 'Choose a file.';
      }
      if (Object.keys(itemErrors).length) errs.items[item.key] = itemErrors;
    }
    return errs;
  }, [expeditionMode, selectedExpeditionId, newExpedition, items]);

  const errors = validate();
  const hasBlockingErrors = Boolean(errors.expedition) || Object.keys(errors.items).length > 0;

  // Submits one item live: uploads its file (if any) then creates the
  // content record, attached to a real expeditionId. Throws on any
  // network/server failure so the caller can decide to queue it instead.
  // Extracted out of handleSubmit so both the "try now" path and (later,
  // Phase C) a queue-draining sync manager can reuse the exact same logic
  // rather than it living duplicated inline.
  const submitItemNow = async (item, fileToUpload, expeditionId, clientRequestId) => {
    let fileResult = null;
    if (fileToUpload) {
      const uploadForm = new FormData();
      uploadForm.append('file', fileToUpload);
      const uploadRes = await api.post('/upload', uploadForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fileResult = uploadRes.data;
    }

    const payload = {
      expedition_id: expeditionId,
      type: item.type,
      title: item.title,
      description: item.description,
      body: ARTICLE_TYPES.includes(item.type) ? item.body : undefined,
      summary: ARTICLE_TYPES.includes(item.type) ? item.summary : undefined,
      file_url: fileResult?.file_url || null,
      thumbnail_url: fileResult?.thumbnail_url || null,
      mime_type: fileResult?.mime_type || fileToUpload?.type || null,
      file_size_bytes: fileResult?.file_size_bytes || fileToUpload?.size || null,
      client_request_id: clientRequestId,
    };
    if (item.type === 'dataset' && item.datasetMeta) {
      payload.datasetMeta = item.datasetMeta;
    }

    const { data: created } = await api.post('/content', payload);

    // If the AI summary was edited further before submitting, persist that
    // edit against the AiGeneration record as an audit trail (ai_output
    // untouched, edited_output set). Best-effort — a failure here shouldn't
    // block the content item itself.
    if (item.aiGeneration && item.summary !== item.aiGeneration.aiOutput) {
      try {
        await editSummary(item.aiGeneration.id, item.summary);
      } catch (err) {
        console.error('Failed to save AI summary edit:', err);
      }
    }

    return created;
  };

  // --- Submit: create/attach the expedition, then upload every item ------
  //
  // Offline-aware (Phase B): tries the live path first when the browser
  // reports it's online. If that's not the case — or a live attempt fails
  // partway through, e.g. a connection that *looked* up but drops mid
  // request — the item is saved into the local queue (Phase A's IndexedDB
  // store) instead of being lost. Nothing here automatically retries a
  // queued item later or watches for reconnection; draining the queue once
  // connectivity returns is Phase C, deliberately not built yet.
  const handleSubmit = useCallback(async () => {
    setSubmitAttempted(true);
    const validationErrors = validate();
    if (validationErrors.expedition || Object.keys(validationErrors.items).length > 0) {
      toast.error('Please fix the highlighted fields before submitting.');
      // Expand any collapsed item that's missing something, so the
      // researcher isn't hunting for which card has the problem.
      setCollapsedKeys((prev) => {
        const next = new Set(prev);
        for (const key of Object.keys(validationErrors.items)) next.delete(Number(key));
        return next;
      });
      return;
    }

    setSubmitting(true);
    try {
      // Step 1: resolve the expedition this content belongs to. If we're
      // creating a new one and can't reach the server for it, it gets
      // queued too — every content item below then attaches to that queued
      // expedition via localExpeditionId instead of a real expeditionId,
      // since one doesn't exist yet.
      let expeditionId = selectedExpeditionId;
      let localExpeditionId = null;

      if (expeditionMode === 'new') {
        const expeditionFields = {
          name: newExpedition.name.trim(),
          region: newExpedition.region || undefined,
          description: newExpedition.description || undefined,
          start_date: newExpedition.start_date || undefined,
          end_date: newExpedition.end_date || undefined,
          latitude: newExpedition.latitude !== '' ? parseFloat(newExpedition.latitude) : undefined,
          longitude: newExpedition.longitude !== '' ? parseFloat(newExpedition.longitude) : undefined,
          principal_investigator: user?.id,
        };

        const localExpeditionIdForRequest = generateLocalId();
        let createdLive = false;
        if (navigator.onLine) {
          try {
            const created = await createExpedition({
              ...expeditionFields,
              client_request_id: localExpeditionIdForRequest,
            });
            expeditionId = created.id;
            createdLive = true;
          } catch (err) {
            console.warn('Live expedition creation failed, queuing instead:', err);
          }
        }
        if (!createdLive) {
          const queued = await enqueueExpedition({
            ...expeditionFields,
            localId: localExpeditionIdForRequest,
          });
          localExpeditionId = queued.localId;
        }
      }

      // Step 2: every content item — try live if we have a real
      // expeditionId to attach to and the browser looks online; queue it
      // otherwise (including when the live attempt itself throws).
      let queuedCount = 0;
      for (const item of items) {
        let fileToUpload = item.file;
        if (item.type === 'dataset' && !item.file && item.manualTable.columns.length > 0 && item.datasetMeta) {
          fileToUpload = buildFileFromManualTable(item.manualTable, item.title);
        }

        const clientRequestId = generateLocalId();
        const canAttemptLive = navigator.onLine && !localExpeditionId;
        let succeededLive = false;

        if (canAttemptLive) {
          try {
            await submitItemNow(item, fileToUpload, expeditionId, clientRequestId);
            succeededLive = true;
          } catch (err) {
            console.warn(`Live submit failed for "${item.title}", queuing instead:`, err);
          }
        }

        if (!succeededLive) {
          await enqueueContent({
            expeditionId: localExpeditionId ? undefined : expeditionId,
            localExpeditionId: localExpeditionId || undefined,
            type: item.type,
            title: item.title,
            description: item.description,
            body: ARTICLE_TYPES.includes(item.type) ? item.body : undefined,
            summary: ARTICLE_TYPES.includes(item.type) ? item.summary : undefined,
            datasetMeta: item.type === 'dataset' ? item.datasetMeta : undefined,
            file: fileToUpload || null,
            fileName: fileToUpload?.name || null,
            localId: clientRequestId,
          });
          queuedCount += 1;
        }
      }

      if (queuedCount > 0) {
        toast.success(
          `Saved ${queuedCount} item${queuedCount > 1 ? 's' : ''} on this device — they'll be ready to submit once you're back online.`,
          { duration: 6000 }
        );
      }

      navigate(from, { replace: true });
    } catch (err) {
      console.error('Submission error:', err);

      // Phase 7: a full device is the one failure where the researcher has to
      // act immediately, so it gets its own message rather than being folded
      // into a generic "submission failed" that implies everything is lost.
      if (err instanceof OfflineStorageError) {
        toast.error(
          `${err.message}${queuedCount > 0 ? ` ${queuedCount} item${queuedCount > 1 ? 's were' : ' was'} saved before space ran out.` : ''}`,
          { duration: 12000 }
        );
      } else {
        toast.error('Submission failed: ' + (err.response?.data?.error || err.message));
      }
    } finally {
      setSubmitting(false);
    }
  }, [expeditionMode, selectedExpeditionId, newExpedition, items, user, navigate, from, validate]);

  // How far along the researcher is, just for the progress dots in the
  // header — the form itself still scrolls as one page, this is only a
  // lightweight sense of "where am I" (expedition chosen → adding content).
  const headerStep = expeditionMode === 'existing' && !selectedExpeditionId ? 1
    : expeditionMode === 'new' && !newExpedition.name.trim() ? 1
    : 2;

  return (
    <div className="chart-backdrop min-h-screen">
      {/* Page header ------------------------------------------------------
          A proper hero instead of a bare title bar: breadcrumb-style back
          link, an icon badge to anchor the eye, a one-line explainer of what
          this page is for, and a tiny progress cue so the form doesn't feel
          like a single undifferentiated wall of fields. */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--hull-light), var(--hull) 55%, var(--abyss))', borderBottom: '1px solid rgba(195,154,94,0.2)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'rgba(232,198,136,0.10)' }}
          aria-hidden="true"
        />

        <div className="relative max-w-3xl mx-auto px-6 pt-7 pb-8">
          <button
            type="button"
            onClick={() => navigate(from, { replace: true })}
            className="group inline-flex items-center gap-1.5 -ml-1.5 px-1.5 py-1 rounded-md text-sm transition-colors mb-5"
            style={{ color: 'var(--ice-dim)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brass-bright)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ice-dim)')}
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Back
          </button>

          <div className="flex items-start gap-4">
            <div
              className="hidden sm:flex w-12 h-12 shrink-0 items-center justify-center rounded-xl"
              style={{ border: '1px solid rgba(232,198,136,0.25)', background: 'rgba(232,198,136,0.10)' }}
            >
              <UploadCloud className="w-6 h-6" style={{ color: 'var(--brass-bright)' }} />
            </div>
            <div className="min-w-0">
              <h1
                className="text-2xl sm:text-3xl italic tracking-tight"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--ice)' }}
              >
                Upload Expedition Content
              </h1>
              <p className="mt-1.5 text-sm max-w-xl leading-relaxed" style={{ color: 'var(--ice-dim)' }}>
                Attach datasets, reports, photos, or videos to an expedition record — everything
                you add here becomes part of the public Expedition Atlas.
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="mt-7 flex items-center gap-2.5 text-xs font-medium">
              <span className="flex items-center gap-1.5" style={{ color: headerStep >= 1 ? 'var(--brass-bright)' : 'var(--ice-dim)' }}>
                <span
                  className="flex w-5 h-5 items-center justify-center rounded-full text-[10px]"
                  style={
                    headerStep > 1
                      ? { background: 'var(--brass-bright)', color: '#0e2432' }
                      : { border: '1px solid var(--brass-dim)', color: 'var(--brass-bright)' }
                  }
                >
                  {headerStep > 1 ? <Check className="w-3 h-3" strokeWidth={3} /> : '1'}
                </span>
                Expedition
              </span>
              <span className="h-px w-8" style={{ background: headerStep > 1 ? 'var(--brass-dim)' : 'rgba(143,179,184,0.3)' }} />
              <span className="flex items-center gap-1.5" style={{ color: headerStep >= 2 ? 'var(--brass-bright)' : 'var(--ice-dim)' }}>
                <span
                  className="flex w-5 h-5 items-center justify-center rounded-full text-[10px]"
                  style={headerStep >= 2 ? { border: '1px solid var(--brass-dim)', color: 'var(--brass-bright)' } : { border: '1px solid rgba(143,179,184,0.3)', color: 'var(--ice-dim)' }}
                >
                  2
                </span>
                Content
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 pt-8">
        {!isAuthenticated ? (
          <p className="mb-6 max-w-3xl mx-auto" style={{ color: 'var(--ice-dim)' }}>
            Sign in to access the upload form.
          </p>
        ) : (
          <div className="brass-plate rounded-2xl p-6 md:p-8 max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              {/* Expedition section */}
              <div className="mb-8 pb-8 border-b border-slate-700">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold">
                    1
                  </span>
                  <h2 className="text-lg font-semibold text-white">Expedition</h2>
                </div>
                <p className="text-sm text-slate-400 mb-4 ml-[34px]">
                  Everything you upload below gets attached to this expedition.
                </p>

                {expeditionsStatus === 'ready' && expeditionsList.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-3 mb-5">
                    <button
                      type="button"
                      onClick={() => setExpeditionMode('existing')}
                      className={`relative text-left rounded-xl border p-4 transition-all ${
                        expeditionMode === 'existing'
                          ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/30'
                          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                      }`}
                    >
                      {expeditionMode === 'existing' && (
                        <span className="absolute top-3 right-3 flex w-4 h-4 items-center justify-center rounded-full bg-cyan-500 text-[#0e2432]">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <FolderOpen className={`w-4 h-4 ${expeditionMode === 'existing' ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span className="font-medium text-white text-sm">Attach to existing expedition</span>
                      </div>
                      <p className="text-xs text-slate-500 pr-4">Add this content to an expedition that's already logged.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpeditionMode('new')}
                      className={`relative text-left rounded-xl border p-4 transition-all ${
                        expeditionMode === 'new'
                          ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/30'
                          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                      }`}
                    >
                      {expeditionMode === 'new' && (
                        <span className="absolute top-3 right-3 flex w-4 h-4 items-center justify-center rounded-full bg-cyan-500 text-[#0e2432]">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <FolderPlus className={`w-4 h-4 ${expeditionMode === 'new' ? 'text-cyan-400' : 'text-slate-500'}`} />
                        <span className="font-medium text-white text-sm">Log a new expedition</span>
                      </div>
                      <p className="text-xs text-slate-500 pr-4">Start a fresh expedition record and attach this content to it.</p>
                    </button>
                  </div>
                )}

                {expeditionMode === 'existing' && (
                  <div>
                    {expeditionsStatus === 'loading' && (
                      <p className="text-sm text-slate-400">Loading expeditions…</p>
                    )}
                    {expeditionsStatus === 'error' && (
                      <p className="text-sm text-red-400">Couldn't load expeditions. Try logging a new one instead.</p>
                    )}
                    {expeditionsStatus === 'ready' && (
                      <>
                        <select
                          value={selectedExpeditionId}
                          onChange={(e) => setSelectedExpeditionId(e.target.value)}
                          className={inputClass(submitAttempted && errors.expedition)}
                        >
                          {expeditionsList.map((exp) => (
                            <option key={exp.id} value={exp.id}>
                              {exp.name}
                              {exp.region ? ` — ${exp.region.replace('_', ' ')}` : ''}
                              {exp.startDate ? ` (${new Date(exp.startDate).getFullYear()})` : ''}
                            </option>
                          ))}
                        </select>
                        {submitAttempted && errors.expedition && (
                          <p className={FIELD_ERROR}>
                            <AlertCircle className="w-3.5 h-3.5" /> {errors.expedition}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {expeditionMode === 'new' && (
                  <div className="space-y-4">
                    <div>
                      <label className={FIELD_LABEL}>Expedition Name</label>
                      <input
                        value={newExpedition.name}
                        onChange={(e) => setNewExpedition((f) => ({ ...f, name: e.target.value }))}
                        className={inputClass(submitAttempted && errors.expedition)}
                        placeholder="e.g., Ny-Ålesund Monitoring 2026"
                      />
                      {submitAttempted && errors.expedition ? (
                        <p className={FIELD_ERROR}>
                          <AlertCircle className="w-3.5 h-3.5" /> {errors.expedition}
                        </p>
                      ) : (
                        <p className={FIELD_HELP}>This becomes the expedition's public name on the atlas.</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={FIELD_LABEL}>Region</label>
                        <select
                          value={newExpedition.region}
                          onChange={(e) => setNewExpedition((f) => ({ ...f, region: e.target.value }))}
                          className={inputClass(false)}
                        >
                          {REGION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={FIELD_LABEL}>Start Date</label>
                        <input
                          type="date"
                          value={newExpedition.start_date}
                          onChange={(e) => setNewExpedition((f) => ({ ...f, start_date: e.target.value }))}
                          className={inputClass(false)}
                        />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>End Date</label>
                        <input
                          type="date"
                          value={newExpedition.end_date}
                          onChange={(e) => setNewExpedition((f) => ({ ...f, end_date: e.target.value }))}
                          className={inputClass(false)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={FIELD_LABEL}>Latitude (optional)</label>
                        <input
                          type="number"
                          step="any"
                          value={newExpedition.latitude}
                          onChange={(e) => setNewExpedition((f) => ({ ...f, latitude: e.target.value }))}
                          className={inputClass(false)}
                          placeholder="e.g., 78.9243"
                        />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>Longitude (optional)</label>
                        <input
                          type="number"
                          step="any"
                          value={newExpedition.longitude}
                          onChange={(e) => setNewExpedition((f) => ({ ...f, longitude: e.target.value }))}
                          className={inputClass(false)}
                          placeholder="e.g., 11.9312"
                        />
                      </div>
                    </div>
                    <p className={FIELD_HELP}>
                      Coordinates place the expedition as a pin on the globe — leave blank if you're not sure yet.
                    </p>

                    <div>
                      <label className={FIELD_LABEL}>Expedition Description</label>
                      <textarea
                        value={newExpedition.description}
                        onChange={(e) => setNewExpedition((f) => ({ ...f, description: e.target.value }))}
                        rows={2}
                        className={`${inputClass(false)} resize-none`}
                        placeholder="Brief summary of the expedition itself..."
                      ></textarea>
                    </div>
                  </div>
                )}
              </div>

              {/* Content items */}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-bold">
                    2
                  </span>
                  <h2 className="text-lg font-semibold text-white">Content</h2>
                  <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 text-[11px] font-medium">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  Add every report, photo, video, or dataset from this expedition below.
                </span>
              </div>

              {items.map((item, idx) => {
                const meta = TYPE_META[item.type] || TYPE_META.dataset;
                const TypeIcon = meta.icon;
                const isCollapsed = collapsedKeys.has(item.key);
                const itemErrors = submitAttempted ? errors.items[item.key] : undefined;
                const isComplete =
                  item.title.trim() &&
                  (item.type === 'dataset' ? Boolean(item.datasetMeta) : Boolean(item.file));

                return (
                  <div key={item.key} className="mb-5 rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden">
                    {/* Card header — always visible, doubles as collapse toggle */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800/90">
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(item.key)}
                        className="flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <TypeIcon className={`w-4 h-4 shrink-0 ${meta.accent}`} />
                        <span className="text-sm font-semibold text-white shrink-0">{itemLabels[idx]}</span>
                        {item.title.trim() && (
                          <span className="text-sm text-slate-400 truncate">— {item.title}</span>
                        )}
                        {itemErrors ? (
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        ) : isComplete ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : null}
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleCollapsed(item.key)}
                          className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                          aria-label={isCollapsed ? 'Expand item' : 'Collapse item'}
                        >
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-5 pt-4">
                        {/* Type selector */}
                        <div className="mb-4">
                          <label className={FIELD_LABEL}>Content Type</label>
                          <select
                            value={item.type}
                            onChange={(e) => handleItemTypeChange(item.key, e.target.value)}
                            className={inputClass(false)}
                          >
                            {TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Title */}
                        <div className="mb-4">
                          <label className={FIELD_LABEL}>Title</label>
                          <input
                            value={item.title}
                            onChange={(e) => updateItem(item.key, { title: e.target.value })}
                            className={inputClass(itemErrors?.title)}
                            placeholder="e.g., Arctic Ice Core Data"
                          />
                          {itemErrors?.title ? (
                            <p className={FIELD_ERROR}>
                              <AlertCircle className="w-3.5 h-3.5" /> {itemErrors.title}
                            </p>
                          ) : (
                            <p className={FIELD_HELP}>Use a short, searchable title.</p>
                          )}
                        </div>

                        {/* Description */}
                        <div className="mb-4">
                          <label className={FIELD_LABEL}>Description</label>
                          <textarea
                            value={item.description}
                            onChange={(e) => updateItem(item.key, { description: e.target.value })}
                            rows={2}
                            className={`${inputClass(false)} resize-none`}
                            placeholder="Brief description of this item..."
                          ></textarea>
                        </div>

                        {/* Full article body — reports & publications only. AI can
                            summarize this into its own Summary field below. */}
                        {ARTICLE_TYPES.includes(item.type) && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-sm text-slate-300">Full Article</label>
                              <button
                                type="button"
                                onClick={() => handleGenerateSummary(item.key, item)}
                                disabled={item.aiStatus === 'generating'}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-cyan-900/40 border border-cyan-700 hover:border-cyan-400 disabled:opacity-50 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {item.aiStatus === 'generating' ? 'Summarizing…' : 'Generate AI Summary'}
                              </button>
                            </div>
                            <RichTextEditor
                              value={item.body}
                              onChange={(html) => updateItem(item.key, { body: html })}
                              placeholder="Write the full research article here…"
                            />
                            {item.aiStatus === 'error' && (
                              <p className="mt-2 text-xs text-red-400">Couldn't generate a summary. Try again, or write one by hand.</p>
                            )}

                            {(item.summary || item.aiStatus === 'generating') && (
                              <div className="mt-3">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                  <label className="block text-sm text-slate-300">AI Summary</label>
                                </div>
                                <textarea
                                  value={item.summary}
                                  onChange={(e) => updateItem(item.key, { summary: e.target.value })}
                                  rows={3}
                                  placeholder={item.aiStatus === 'generating' ? 'Generating…' : ''}
                                  disabled={item.aiStatus === 'generating'}
                                  className={`${inputClass(false)} border-cyan-800/70 resize-none disabled:opacity-50`}
                                ></textarea>
                                <p className={FIELD_HELP}>
                                  AI-generated from the article above — edit freely before submitting.
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Generic file picker - non-dataset types */}
                        {item.type !== 'dataset' && (
                          <div className="mb-2">
                            <label className={FIELD_LABEL}>File</label>
                            <FileDropZone
                              key={`${item.key}-${item.type}`}
                              accept={item.type === 'photo' ? 'image/*' : item.type === 'video' ? 'video/*' : undefined}
                              file={item.file}
                              onFileChange={(f) => handleGenericFileChange(item.key, f)}
                              previewKind={item.type === 'photo' ? 'image' : item.type === 'video' ? 'video' : 'none'}
                              helperText={
                                item.type === 'photo'
                                  ? 'PNG, JPG, or similar image files'
                                  : item.type === 'video'
                                    ? 'MP4 or similar video files'
                                    : 'PDF, DOCX, or similar document files'
                              }
                              hasError={itemErrors?.file}
                            />
                          </div>
                        )}

                        {/* Dataset-specific: CSV/Excel picker */}
                        {item.type === 'dataset' && (
                          <div className="mb-4">
                            <label className={FIELD_LABEL}>Dataset File</label>
                            <FileDropZone
                              key={`${item.key}-${item.type}`}
                              accept=".csv, .tsv, .xlsx, .xls"
                              file={item.file}
                              onFileChange={(f) => handleDatasetFileChange(item.key, f)}
                              previewKind="none"
                              helperText="CSV, TSV, or Excel files"
                              hasError={item.parseStatus !== 'error' ? itemErrors?.file : undefined}
                            />
                            {item.parseStatus === 'parsing' && (
                              <p className="mt-2 text-sm text-slate-400">Parsing file…</p>
                            )}
                            {item.parseStatus === 'success' && (
                              <p className="mt-2 text-sm text-cyan-400 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                Parsed {item.datasetMeta?.row_count} rows, {item.datasetMeta?.columns.length} columns
                              </p>
                            )}
                            {item.parseStatus === 'error' && (
                              <p className={FIELD_ERROR}>
                                <AlertCircle className="w-3.5 h-3.5" /> Failed to parse file.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Dataset-specific: Manual Table Builder */}
                        {item.type === 'dataset' && (
                          <div className="mb-4 pt-4 border-t border-slate-700/70">
                            <label className={FIELD_LABEL}>Manual Table Builder</label>
                            <p className={`${FIELD_HELP} mt-0 mb-3`}>
                              Build a table manually if you don't have a file. Each column gets
                              an inferred type (number/date/text) based on the values entered.
                            </p>

                            <div className="flex gap-2 mb-3">
                              <button type="button" onClick={() => addManualColumn(item.key)} className={SECONDARY_BTN}>
                                + Column
                              </button>
                              <button
                                type="button"
                                onClick={() => removeManualColumn(item.key)}
                                disabled={item.manualTable.columns.length <= 1}
                                className={SECONDARY_BTN}
                              >
                                - Column
                              </button>
                              <button type="button" onClick={() => addManualRow(item.key)} className={SECONDARY_BTN}>
                                + Row
                              </button>
                              <button
                                type="button"
                                onClick={() => removeManualRow(item.key)}
                                disabled={item.manualTable.rows.length === 0}
                                className={SECONDARY_BTN}
                              >
                                - Row
                              </button>
                            </div>

                            {item.manualTable.columns.length > 0 && item.manualTable.rows.length > 0 && (
                              <div className="rounded-lg border border-slate-700/70 overflow-hidden mb-3">
                                <div className="max-h-[280px] overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead className="bg-slate-900/70 sticky top-0">
                                      <tr>
                                        {item.manualTable.columns.map((name, i) => (
                                          <th
                                            key={i}
                                            className="p-2.5 text-left font-semibold tracking-wider uppercase text-[10px] text-slate-400 border-b border-slate-700"
                                          >
                                            {name}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                      {item.manualTable.rows.map((row, rIdx) => (
                                        <tr key={rIdx} className="even:bg-slate-800/40">
                                          {row.map((cell, cIdx) => (
                                            <td key={cIdx} className="p-1.5">
                                              <input
                                                type="text"
                                                value={cell}
                                                onChange={(e) => setManualCell(item.key, rIdx, cIdx, e.target.value)}
                                                className="w-full bg-transparent text-slate-200 text-xs px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                              />
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => parseManualForItem(item.key, item)}
                                disabled={item.manualTable.columns.length === 0}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-medium transition-colors"
                              >
                                Parse Table &amp; Preview
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Dataset preview */}
                        {item.type === 'dataset' && item.datasetMeta && (
                          <DatasetPreviewCard
                            columns={item.datasetMeta.columns}
                            previewRows={item.datasetMeta.preview_rows}
                            rowCount={item.datasetMeta.row_count}
                          />
                        )}

                        {/* 3D depth section — only rendered when a depth
                            column plus temperature and/or salinity were
                            detected in the uploaded/typed data. */}
                        {item.type === 'dataset' && item.oceanSection && (
                          <>
                            <OceanSection3D section={item.oceanSection} />
                            <TempSalinityDepth3D section={item.oceanSection} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addItem}
                className="w-full mb-8 py-2.5 rounded-lg border border-dashed border-slate-600 text-slate-400 hover:border-cyan-400 hover:text-cyan-400 transition-colors inline-flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add Another Item
              </button>

              {/* Submit button — the one action on this page that should read
                  as clearly primary; everything else uses a lighter weight. */}
              <button
                type="submit"
                disabled={!isAuthenticated || submitting}
                className="w-full py-3.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold shadow-lg shadow-cyan-950/40 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Expedition Content'}
              </button>

              {hasBlockingErrors && submitAttempted && !submitting && (
                <p className={`${FIELD_ERROR} justify-center mt-3`}>
                  <AlertCircle className="w-3.5 h-3.5" /> Some fields still need your attention above.
                </p>
              )}
              {submitting && (
                <p className="mt-3 text-sm text-slate-400 text-center">Processing your upload…</p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default UploadPage;
