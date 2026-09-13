import React, { useState, useEffect } from 'react';
import api from '../../api/client.js';

export default function VisualExplorer({ compact = false, previewCount = 5, onViewMore }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/content', {
          params: { type: 'photo', status: 'published' },
        });
        setPhotos(Array.isArray(data) ? data : []);
      } catch (e) {
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const visible = compact ? photos.slice(0, previewCount) : photos;

  return (
    <div className={compact ? 'visual-explorer-preview' : 'visual-explorer p-6 rounded-2xl bg-gradient-to-br from-[#F5FAFF] to-[#EAF6FF] border border-[#DCEFFF] shadow-sm'}>
      {!compact && <h2 className="text-2xl font-bold text-[#38BDF8] mb-4">Expedition Gallery</h2>}
      {compact && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-[#38BDF8]">Expedition Gallery</h2>
          <button onClick={onViewMore || (() => {})} className="text-sm font-medium text-[#38BDF8] hover:underline cursor-pointer">VIEW MORE →</button>
        </div>
      )}
      {loading && <p className="text-[#587287] text-sm">Loading photographs...</p>}
      {!loading && visible.length === 0 && <p className="text-[#587287] text-sm">No published photographs available.</p>}
      <div className={compact ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"}>
        {visible.map((p) => (
          <button
            key={p.id}
            onClick={() => setLightbox(p)}
            className="text-left rounded-xl overflow-hidden border border-[#DCEFFF] bg-[#030712] shadow-sm hover:shadow-md transition focus:outline-none"
          >
            <img
              src={p.fileUrl || p.file_url}
              alt={p.title || 'Expedition photograph'}
              className="w-full h-32 object-cover bg-[#EAF6FF]"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="p-2">
              <h3 className="font-semibold text-[#F1F5F9] text-xs truncate">{p.title || 'Untitled'}</h3>
              <p className="text-[11px] text-[#587287] truncate">{p.expedition?.name || 'Unknown expedition'}</p>
              <p className="text-[11px] text-[#587287] truncate">{p.uploader?.name || 'Unknown researcher'}</p>
            </div>
          </button>
        ))}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="bg-[#030712] rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.fileUrl || lightbox.file_url} alt={lightbox.title} className="w-full max-h-[70vh] object-contain bg-[#030712]" />
            <div className="p-5 border-t border-[#DCEFFF]">
              <h3 className="text-lg font-bold text-[#38BDF8]">{lightbox.title || 'Untitled'}</h3>
              <p className="text-sm text-[#587287]">Expedition: {lightbox.expedition?.name || 'Unknown'}</p>
              <p className="text-sm text-[#587287]">Publisher: {lightbox.uploader?.name || 'Unknown researcher'}</p>
              <div className="mt-4 flex gap-3">
                {lightbox.expeditionId && (
                  <a href={`/expeditions/${lightbox.expeditionId}`} className="px-4 py-2 rounded-lg bg-[#0B5CAD] text-white text-sm font-medium hover:bg-[#1677C8]">View Expedition</a>
                )}
                <button onClick={() => setLightbox(null)} className="px-4 py-2 rounded-lg border border-[#DCEFFF] text-sm text-[#F1F5F9] hover:bg-[#030712]">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
