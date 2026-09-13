/**
 * ExplorerStats — Phase 1 placeholder.
 *
 * Five stat cards: Expeditions, Researchers, Datasets, Photographs, Regions.
 * Values are "—" until real data is wired in later phases.
 */
const STATS = [
  { key: 'expeditions', label: 'Total Expeditions', value: '—' },
  { key: 'researchers', label: 'Researchers', value: '—' },
  { key: 'datasets', label: 'Datasets', value: '—' },
  { key: 'photographs', label: 'Total Photographs', value: '—' },
  { key: 'regions', label: 'Regions', value: '—' },
];

export default function ExplorerStats() {
  return (
    <div className="relative explorer-stats-grid-container group">
      {/* Lock overlay for entire statistics area */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#030712]/40 backdrop-blur-[1px] pointer-events-none transition-opacity duration-300 group-hover:opacity-100">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 text-cyan-400/80">
            {/* Lock icon SVG */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div className="px-3 py-1 bg-cyan-900/60 backdrop-blur-md rounded-full border border-cyan-700/40">
            <span className="text-xs font-medium text-cyan-300">COMING SOON</span>
          </div>
        </div>
      </div>

      <div className="explorer-stats-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {STATS.map((stat) => (
          <div
            key={stat.key}
            className="explorer-stat-card relative p-5 rounded-xl overflow-hidden cursor-default"
            style={{
              background: 'linear-gradient(165deg, rgba(22,119,200,0.08), rgba(18,48,71,0.35))',
              border: '1px solid rgba(220,231,255,0.06)',
              boxShadow: '0 2px 12px rgba(3,18,34,0.3)',
              opacity: '0.65',
              filter: 'blur(0.3px)',
            }}
          >
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div
                className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 100% 0%, rgba(220,231,255,0.08), transparent 70%)',
                }}
              />
            </div>

            <div className="relative">
              <p className="explorer-stat-label text-xs tracking-wide mb-1" style={{ color: '#587287' }}>
                {stat.label}
              </p>
              <p className="explorer-stat-value text-3xl md:text-4xl font-bold tabular-nums" style={{ color: 'rgba(245, 250, 251, 0.45)' }}>
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}