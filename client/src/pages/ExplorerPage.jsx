import React, { useState, useCallback } from 'react';
import ExplorerGlobe from '../components/explorer/ExplorerGlobe.jsx';
import ExplorerStats from '../components/explorer/ExplorerStats.jsx';
import ExplorerTimeline from '../components/explorer/ExplorerTimeline.jsx';
import VisualExplorer from '../components/explorer/VisualExplorer.jsx';
import ExplorerSearch from '../components/explorer/ExplorerSearch.jsx';
import '../components/explorer/Explorer.css';

export default function ExplorerPage() {
  const [selectedExpedition, setSelectedExpedition] = useState(null);
  const [view, setView] = useState('expeditions');

  const handleExpeditionSelect = useCallback((expedition) => {
    setSelectedExpedition(expedition);
  }, []);

  const handleViewMore = useCallback(() => {
    setView('gallery');
    requestAnimationFrame(() => {
      document.getElementById('explorer-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  return (
    <div id="explorer-top" className="explorer-page min-h-screen text-[#F1F5F9]">
      {/* Header */}
      <header className="explorer-header px-6 py-12 bg-[#030712]">
        <div className="max-w-7xl mx-auto">
          <h1 className="explorer-title text-4xl font-bold text-[#38BDF8] mb-2">
            Discover Polar Research
          </h1>
          <p className="explorer-subtitle text-lg text-[#587287]">
            Explore NCPOR expeditions, researchers, datasets, and polar observations
            through an interactive scientific lens.
          </p>
        </div>
      </header>

      {/* Global Search */}
      <ExplorerSearch onExpeditionSelect={handleExpeditionSelect} />

      {/* Main Content */}
      <main className="explorer-main max-w-7xl mx-auto px-6 pb-12">
        {/* View Switcher and Globe Controls */}
        <div className="explorer-controls flex flex-wrap items-center gap-4 mb-8">
          {/* View Switcher */}
          <div className="flex items-center gap-2 text-sm font-medium text-[#587287]">
            <button onClick={() => setView('expeditions')} className={"explorer-view-tab " + (view === 'expeditions' ? 'active' : '')}>EXPEDITIONS</button>
            <button onClick={() => setView('gallery')} className={"explorer-view-tab " + (view === 'gallery' ? 'active' : '')}>GALLERY</button>
          </div>

          {/* Globe Mode Controls */}
          <div className="flex-1 flex flex-wrap items-center gap-3">
          </div>
        </div>

        {/* Two-column layout: Globe and Side Panel */}
        <div className="explorer-content-grid grid gap-8">
          {view === 'gallery' ? (
            <VisualExplorer />
          ) : (
            <>
              {/* Left: Globe Visualization */}
              <div className="explorer-globe-panel">
                <ExplorerGlobe onExpeditionSelect={handleExpeditionSelect} focusTarget={selectedExpedition} />
              </div>
            </>
          )}

          {/* Right: Side Panel */}
          <div className="explorer-side-panel">
            {/* Selected Expedition Area (placeholder) */}
            <section className="explorer-expedition-panel mb-8 p-6 rounded-xl border border-[#DCEFFF] bg-[#030712]/50">
              <h3 className="text-xl font-semibold text-[#38BDF8] mb-4">Selected Expedition</h3>
              {selectedExpedition ? (
                <div className="text-sm text-[#587287] space-y-2">
                  {selectedExpedition.isStation ? (
                    <>
                      <h4 className="font-bold text-[#38BDF8]">INDIAN RESEARCH STATION</h4>
                      <p><span className="font-medium">Station:</span> {selectedExpedition.name}</p>
                      <p><span className="font-medium">Location:</span> {selectedExpedition.lat?.toFixed(2)}, {selectedExpedition.lng?.toFixed(2)}</p>
                      <p><span className="font-medium">Overview:</span> {selectedExpedition.description || 'Not available'}</p>
                    </>
                  ) : (
                    <>
                      <h4 className="font-bold text-[#38BDF8]">EXPEDITION</h4>
                      <p><span className="font-medium">Expedition name:</span> {selectedExpedition.name}</p>
                      <p><span className="font-medium">Year:</span> {selectedExpedition.year || 'Not available'}</p>
                      <p><span className="font-medium">Researcher/PI:</span> {selectedExpedition.pi || 'Not available'}</p>
                      <p><span className="font-medium">Region:</span> {selectedExpedition.region ? selectedExpedition.region.replace('_', ' ') : 'Not available'}</p>
                      <p><span className="font-medium">Overview:</span> {selectedExpedition.desc || 'Not available'}</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-sm text-[#587287] space-y-2">
                  <p>Select an expedition marker on the globe to view its details.</p>
                  <p><span className="font-medium">Expedition name:</span> — </p>
                  <p><span className="font-medium">Year:</span> — </p>
                  <p><span className="font-medium">Researcher/PI:</span> — </p>
                  <p><span className="font-medium">Region:</span> — </p>
                  <p><span className="font-medium">Overview:</span> — </p>
                </div>
              )}
            </section>

            {/* Statistics */}
            <ExplorerStats />

            {/* Timeline */}
            <section className="explorer-timeline-panel mt-8">
              <h3 className="text-xl font-semibold text-[#38BDF8] mb-4 flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-cyan-300">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Expedition Timeline
              </h3>
              <ExplorerTimeline />
            </section>
          </div>
        </div>
      </main>

      {/* Visual Explorer and Researcher Explorer Sections */}
      <section className="explorer-sections px-6 pb-16">
        <div className="max-w-7xl mx-auto grid gap-12">
          <VisualExplorer compact onViewMore={handleViewMore} />
        </div>
      </section>
    </div>
  );
}