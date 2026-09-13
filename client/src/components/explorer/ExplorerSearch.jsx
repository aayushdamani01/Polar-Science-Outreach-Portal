import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchGlobal } from '../../api/search.js';

export default function ExplorerSearch({ onExpeditionSelect }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setError(false); return; }
    setLoading(true); setError(false);
    try {
      const r = await searchGlobal(q, 300);
      if (r && r.success && r.data) {
        // backend returns {success:true, results:{researchers:[...],...}} or flat array
        const d = r.data;
        if (d.expeditions || d.datasets || d.regions || d.researchers) { const entries = [["expedition","expeditions"],["dataset","datasets"],["region","regions"],["researcher","researchers"]]; setResults(entries.flatMap(([label,key]) => (d[key] ? d[key].map(x => ({...x, type: label})) : []))); } else if (d.results) setResults(Object.entries(d.results).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => ({...x, type: k.slice(0,-1)})) : [])));
        else if (Array.isArray(d)) setResults(d);
        else setResults([]);
      } else {
        setError(true);
      }
    } catch (e) { setError(true); }
    setLoading(false);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    doSearch(v);
  };

  const handleClear = () => { setQuery(''); setResults([]); setError(false); };

  const handleSelect = (item) => {
    // Only expedition results carry coordinates. Reshape to the same field
    // names ExplorerGlobe/ExplorerPage expect from the globe's own data
    // source (desc/year instead of description/startDate), so the side
    // panel and camera behave identically whether the expedition was
    // picked from the globe or from this search box.
    if (item.type === 'expedition' && item.lat != null && item.lng != null && onExpeditionSelect) {
      onExpeditionSelect({
        id: item.id,
        name: item.name,
        region: item.region,
        lat: item.lat,
        lng: item.lng,
        year: item.year,
        pi: item.pi,
        desc: item.description || 'No description available yet.',
      });
    }
    setQuery(''); setResults([]);
  };

  const byType = (t) => results.filter(r => (r.type === t || r.type === (t === 'researcher' ? 'researchers' : t === 'expedition' ? 'expeditions' : t === 'dataset' ? 'datasets' : t === 'region' ? 'regions' : t)) && (t !== 'researcher' || (r.name && !r.region && !r.title && !r.lat)));

  return (
    <div className="explorer-search px-6 pb-8" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#38BDF8]">🔍</span>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search researchers, datasets, regions, expeditions..."
          className="explorer-search-input w-full pl-10 pr-10 py-3 rounded-xl border-2 border-[#DCEFFF] bg-[#030712]/90 text-[#F1F5F9] placeholder-[#587287] focus:outline-none focus:border-[#1677C8] focus:ring-2 focus:ring-[#1677C8]/20"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-[#0B5CAD] text-white px-2 py-0.5 rounded-md" aria-label="Clear">✕</button>
        )}
      </div>

      {loading && <p className="text-xs text-[#587287] mt-2">Searching…</p>}
      {error && <p className="text-xs text-red-600 mt-2">Search failed. Try again.</p>}
      {!loading && !error && query.trim() && results.length === 0 && <p className="text-xs text-[#587287] mt-2">No results.</p>}

      {results.length > 0 && (
        <div className="mt-3 bg-[#030712] rounded-xl border border-[#DCEFFF] shadow-sm overflow-hidden">
          {['researcher','expedition','dataset','region'].map(type => {
            const group = byType(type);
            if (!group.length) return null;
            return (
              <div key={type} className="border-b last:border-0 border-[#DCEFFF]/60">
                <div className="px-4 py-1.5 text-[10px] uppercase font-bold tracking-wider text-[#38BDF8] bg-[#030712]">{type}</div>
                <ul>
                  {group.map((r, i) => (
                    <li key={i}>
                      <button onClick={() => handleSelect(r)} className="w-full text-left px-4 py-2 text-sm hover:bg-[#030712] transition-colors">
                        <span className="font-medium text-[#F1F5F9]">{r.name || r.title || r.region || '-'}</span>
                        <span className="text-xs text-[#587287] ml-2">{r.region || (r.lat ? r.lat.toFixed(2) + ',' + r.lng.toFixed(2) : '')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
