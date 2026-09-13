import React, { useCallback, useEffect, useState } from 'react';
import { fetchReviewQueue, setContentStatus } from '../api/content.js';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const TYPE_LABEL = {
  report: 'Report',
  publication: 'Publication',
  photo: 'Photo',
  video: 'Video',
  dataset: 'Dataset',
};

function ReviewCard({ item, onDecide, busy }) {
  return (
    <div className="brass-plate rounded-lg p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="inline-block px-2 py-0.5 mb-2 rounded text-xs font-medium bg-cyan-900/50 text-cyan-300 border border-cyan-800">
            {TYPE_LABEL[item.type] || item.type}
          </span>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--ice)' }}>{item.title}</h3>
          {item.description && (
            <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--ice-dim)' }}>{item.description}</p>
          )}
          <div className="text-xs mt-2 flex gap-4" style={{ color: 'var(--ice-dim)', opacity: 0.8 }}>
            <span>Expedition: {item.expedition?.name || 'Unattached'}</span>
            <span>Uploaded by: {item.uploader?.name || 'Unknown'}</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(item.id, 'published')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            <CheckCircle className="w-4 h-4" /> Publish
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(item.id, 'archived')}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#f87171';
              e.currentTarget.style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--brass-dim)';
              e.currentTarget.style.color = 'var(--ice-dim)';
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border disabled:opacity-50 text-sm font-medium transition-colors"
            style={{ background: 'rgba(7,22,32,0.5)', borderColor: 'var(--brass-dim)', color: 'var(--ice-dim)' }}
          >
            <XCircle className="w-4 h-4" /> Reject
          </button>
        </div>
      </div>

      {item.fileUrl && (
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-xs hover:underline"
          style={{ color: 'var(--brass-bright)' }}
        >
          View file
        </a>
      )}
    </div>
  );
}

function ReviewQueuePage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setStatus('loading');
    fetchReviewQueue()
      .then((data) => {
        setItems(data);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('Failed to load review queue', err);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDecide = async (id, nextStatus) => {
    setBusyId(id);
    try {
      await setContentStatus(id, nextStatus);
      // Item is no longer in_review either way — drop it from the queue
      // instead of refetching the whole list.
      setItems((list) => list.filter((it) => it.id !== id));
    } catch (err) {
      console.error('Failed to update content status', err);
      toast.error('Could not update that item. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="chart-backdrop min-h-screen px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--brass-bright)' }}>
          <Clock className="w-4 h-4" strokeWidth={1.5} />
          <span className="gauge-text text-[11px] tracking-wide">STAFF REVIEW</span>
        </div>
        <h1 className="text-2xl italic mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--ice)' }}>
          Review Queue
        </h1>
        <p className="mb-8" style={{ color: 'var(--ice-dim)' }}>
          Content submitted by researchers waits here until it's published or rejected.
        </p>

        {status === 'loading' && <p style={{ color: 'var(--ice-dim)' }}>Loading…</p>}
        {status === 'error' && (
          <p className="text-red-400">Couldn't load the review queue. Try refreshing.</p>
        )}
        {status === 'ready' && items.length === 0 && (
          <p style={{ color: 'var(--ice-dim)' }}>Nothing waiting on review right now.</p>
        )}
        {status === 'ready' &&
          items.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onDecide={handleDecide}
            />
          ))}
      </div>
    </div>
  );
}

export default ReviewQueuePage;
