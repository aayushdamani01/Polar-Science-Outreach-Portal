import React, { useRef } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';

// Phase 4 — the actual WebGL globe, split into its own module so it (and
// react-globe.gl / three, which are the heavy part of the bundle) is only
// ever downloaded when LandingPage lazy-loads this file. Fast and medium
// tiers both render this component; slow/offline never import it at all.
//
// `reduced` is the only behavior toggle. FAST passes reduced={false} and
// must look and behave exactly like the pre-Phase-4 globe. MEDIUM passes
// reduced={true}, which drops the bump/topology texture, the atmosphere,
// and the auto-rotate animation — all render/GPU cost, not features — while
// keeping pins, rings, click-to-select, and camera fly-to fully working.
export default function GlobeView({ width, height, expeditions, selectedPin, onSelectPin, reduced }) {
  const globeRef = useRef();

  return (
    <Globe
      ref={globeRef}
      width={width}
      height={height}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
      bumpImageUrl={reduced ? undefined : '//unpkg.com/three-globe/example/img/earth-topology.png'}
      backgroundColor="rgba(0,0,0,0)"
      showAtmosphere={!reduced}
      atmosphereColor="#5ec8ff"
      atmosphereAltitude={0.22}
      pointsData={expeditions}
      pointLat="lat"
      pointLng="lng"
      pointColor="hex"
      pointAltitude={0.1}
      pointRadius={(d) => (d.dangerLevel && d.dangerLevel !== 'low' ? 0.9 : 0.7)}
      pointLabel={(d) => `
        <div style="font-family: sans-serif; padding: 4px 2px; color: #fff;">
          <div style="font-weight:600;">${d.name}</div>
          ${d.dangerLevel && d.dangerLevel !== 'low' ? `<div style="color:#f87171;">⚠ ${d.dangerLevel.toUpperCase()}</div>` : ''}
        </div>
      `}
      pointsMerge={false}
      ringsData={selectedPin ? [selectedPin] : []}
      ringLat="lat"
      ringLng="lng"
      ringColor={() => t => `rgba(232, 198, 136, ${1 - t})`}
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

        // Idle drift, like a globe left turning on a chart table — stops
        // feeling inert without demanding attention. Skipped on medium:
        // a continuously re-rendering scene is exactly the ongoing GPU/
        // battery cost that tier is meant to avoid.
        if (!reduced) {
          const controls = globeRef.current.controls();
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.35;
        }
      }}
      onPointClick={(point) => {
        onSelectPin(point);
        if (globeRef.current) {
          globeRef.current.controls().autoRotate = false;
          globeRef.current.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.5 }, 1000);
        }
      }}
    />
  );
}
