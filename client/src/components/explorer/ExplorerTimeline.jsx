/**
 * ExplorerTimeline — Phase 1 locked placeholder.
 */
export default function ExplorerTimeline() {
  return (
    <div className="explorer-timeline p-6 rounded-xl border border-cyan-900/30 bg-[#0f1b2e]/60 backdrop-blur-sm relative overflow-hidden">
      {/* Glass overlay */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ background: 'linear-gradient(135deg, rgba(11,92,173,0.08) 0%, rgba(18,48,71,0.2) 100%)' }} />

      {/* Lock / Coming Soon header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-900/50 border border-cyan-700/40 flex items-center justify-center text-cyan-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-cyan-200 tracking-tight">Expedition Timeline</h3>
            <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-cyan-900/50 border border-cyan-800/40">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-[11px] font-semibold text-cyan-300">COMING SOON</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center py-10 text-center">
        <p className="text-cyan-200 text-lg font-medium mb-2">Historical expedition statistics will be available here soon.</p>
        <p className="text-sm text-cyan-800/80 max-w-md">Track expedition counts by region, season, and research focus. This timeline is being prepared as part of the NCPOR Explorer data layer build-out.</p>
      </div>
    </div>
  );
}