import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { fetchExpeditionsForGlobe } from '../../api/expeditions.js';
import { fetchResearchStations } from '../../api/stations.js';

const REGION_HEX = {
  Antarctic: '#5b8fd9',
  Arctic: '#6fd4c9',
  Himalaya: '#d99456',
  Southern_Ocean: '#7fbf8f',
};

export default function ExplorerGlobe({ onExpeditionSelect, focusTarget }) {
  const [expeditions, setExpeditions] = useState([]);
  const [selectedPin, setSelectedPin] = useState(null);
  const [loadStatus, setLoadStatus] = useState('loading');
  const [globeSize, setGlobeSize] = useState({ width: 0, height: 0 });
  const globeBoxRef = useRef(null);
  const [stations, setStations] = useState([]);
  const globeRef = useRef();

  useEffect(() => {
    fetchResearchStations().then(s => setStations(s || []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchExpeditionsForGlobe()
      .then((data) => {
        if (cancelled) return;
        setExpeditions(data);
        setLoadStatus('ready');
      })
      .catch(() => { if (!cancelled) setLoadStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!globeBoxRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setGlobeSize({ width, height });
    });
    ro.observe(globeBoxRef.current);
    return () => ro.disconnect();
  }, []);

  const pointsData = useMemo(() => {
    return expeditions.map((exp) => ({
      ...exp,
      hex: REGION_HEX[exp.region] || '#8fb3b8',
    }));
  }, [expeditions]);

  const stationPoints = useMemo(() => stations.map(s => ({...s, lat: s.lat, lng: s.lng, hex: '#000000', isStation: true})), [stations]);
  const combinedPoints = useMemo(() => [...pointsData, ...stationPoints], [pointsData, stationPoints]);

  // Lets an external picker (the search bar) fly the camera to and ring-
  // highlight an expedition, the same way clicking its pin does. Guarded
  // against re-firing when focusTarget is just an echo of a click we
  // already handled locally (selectedPin already matches it).
  useEffect(() => {
    if (!focusTarget || !globeRef.current) return;
    if (selectedPin?.id === focusTarget.id) return;
    setSelectedPin(focusTarget);
    globeRef.current.controls().autoRotate = false;
    globeRef.current.pointOfView({ lat: focusTarget.lat, lng: focusTarget.lng, altitude: 1.5 }, 1000);
  }, [focusTarget, selectedPin]);

  const handlePointClick = useCallback((point) => {
    setSelectedPin(point);
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = false;
      globeRef.current.pointOfView({ lat: point.lat || point.latitude, lng: point.lng || point.longitude, altitude: 1.5 }, 1000);
    }
    if (onExpeditionSelect) onExpeditionSelect(point);
  }, [onExpeditionSelect]);

  return (
    <div ref={globeBoxRef} className="explorer-globe-stage relative rounded-2xl overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 38%, #0B5CAD60, #08284899 55%, #030F20 100%)', border: '1px solid rgba(220,231,255,0.18)', boxShadow: 'inset 0 0 60px rgba(8,60,120,0.35)', minHeight: 420 }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-24 pointer-events-none z-10" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(245,250,255,0.55), transparent 70%)' }} />
      {(loadStatus !== 'ready' || pointsData.length === 0) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded-md px-6 py-4 text-center max-w-xs pointer-events-auto" style={{ background: 'rgba(11,92,173,0.85)', border: '1px solid rgba(220,231,255,0.25)' }}>
            {loadStatus === 'loading' && <p style={{ color: '#F5FAFF' }}>Charting expeditions…</p>}
            {loadStatus === 'error' && <p style={{ color: '#F5FAFF' }}>Can't reach the archive</p>}
            {loadStatus === 'ready' && pointsData.length === 0 && <p style={{ color: '#F5FAFF' }}>No charted expeditions yet.</p>}
          </div>
        </div>
      )}
      {globeSize.width > 0 && (
        <Globe
          ref={globeRef}
          width={globeSize.width}
          height={globeSize.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere={true}
          atmosphereColor="#5ec8ff"
          atmosphereAltitude={0.22}
          pointsData={combinedPoints}
          pointLat="lat"
          pointLng="lng"
          pointColor="hex"
          pointAltitude={0.1}
          pointRadius={p => p.isStation ? 1.2 : 0.7}
          pointsMerge={false}
          ringsData={selectedPin ? [selectedPin] : []}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => (t) => `rgba(232, 198, 136, ${1 - t})`}
          ringMaxRadius={4}
          ringPropagationSpeed={2.4}
          ringRepeatPeriod={900}
          onGlobeReady={() => {
            if (!globeRef.current) return;
            const scene = globeRef.current.scene();
            scene.add(new THREE.AmbientLight(0xffffff, 1.2));
            const sun = new THREE.DirectionalLight(0xffffff, 1.4);
            sun.position.set(1, 1, 1);
            scene.add(sun);
            const controls = globeRef.current.controls();
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.35;

            // Black pillar station markers (existing marker, solid black)
            stations.forEach((s) => {
              const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.8 });
              const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 6), mat);
              const lat = s.lat || s.latitude || 0;
              const lng = s.lng || s.longitude || 0;
              const phi = (90 - lat) * Math.PI / 180;
              const theta = (lng + 180) * Math.PI / 180;
              const R = 1.011;
              pillar.position.set(-R * Math.sin(phi) * Math.cos(theta), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(theta));
              pillar.lookAt(0, 0, 0);
              pillar.rotation.x += Math.PI / 2;
              scene.add(pillar);
            });
          }}
          onPointClick={handlePointClick}
        />
      )}
      <div className="absolute top-5 left-5 md:top-7 md:left-7 z-10 pointer-events-none max-w-[280px]" aria-hidden="true">
        <div className="flex items-center gap-2 text-sm" style={{ color: '#e8c688' }}>
          <span className="font-bold tracking-widest text-xs">NCPOR</span>
          <span style={{ color: 'rgba(245,250,255,0.5)' }}>· Explorer</span>
        </div>
        <h2 className="mt-1 text-2xl md:text-3xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display), ui-serif, Georgia, serif', color: '#F5FAFF' }}>Expedition Atlas</h2>
        <p className="mt-1 text-xs" style={{ color: 'rgba(245,250,255,0.65)' }}>{pointsData.length} stations charted · Click to explore</p>
      </div>
      <div className="absolute top-5 right-5 md:top-7 md:right-7 z-10 pointer-events-auto flex gap-2">
        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide bg-[#0B5CAD] text-white shadow-md">EXPEDITIONS</span>
      </div>
    </div>
  );
}
