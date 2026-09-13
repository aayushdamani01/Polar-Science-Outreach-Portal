# Phase 10 — Testing Guide

This is the consolidated test plan for everything built in Phases 1–9 (network
detection, adaptive globe, adaptive photos, progressive route loading, manual
mode, debounced tier switching, and the existing offline system). Nothing in
this file is application code — it doesn't change behavior, it verifies it.

## 0. Before you start: dev server vs. production build

**Run `npm run dev` (the client's `vite` dev server) for everything except
offline-asset testing.** It's faster to iterate on and covers tier detection,
the globe, photo URLs, manual mode, debouncing, and route code-splitting just
fine.

**Run a production build for anything involving the service worker.**
`client/src/offline/registerServiceWorker.js` only registers `sw.js` when
`import.meta.env.PROD` is true — under `npm run dev` the service worker is
never active at all. That means the SW's own caching of external assets
(expedition photos, globe textures) cannot be tested in dev mode; only the
IndexedDB-based caching (`globeCache`, `pendingExpeditions`, etc., via `idb`)
works there, since that doesn't depend on the SW.

To test the full offline path:
```
cd client
npm run build
npm run preview
```
`vite preview` serves the real production build, so the service worker
registers and everything in Section 4 below is testable end to end.

## 1. The one caveat that affects every test below

Chrome DevTools' Network-panel throttling presets (**Fast 4G / Slow 4G /
3G**) only throttle the actual bytes going over the wire — they do **not**
reliably update `navigator.connection.effectiveType/downlink/rtt`, which is
the only thing `classifyNetwork()` (`client/src/hooks/useNetworkQuality.js`)
reads. This is inconsistent across Chrome versions/platforms, not a bug in
this app. Selecting "Slow 4G" may do nothing to which tier the app picks.

**The reliable way to force a tier** is the console override, run in
DevTools → Console:
```js
Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '3g', configurable: true });
Object.defineProperty(navigator.connection, 'downlink', { get: () => 1.2, configurable: true });
Object.defineProperty(navigator.connection, 'rtt', { get: () => 350, configurable: true });
navigator.connection.dispatchEvent(new Event('change'));
```
Adjust the values per the thresholds below, then check the Console log line
`[NCPOR network] { quality: ..., ... }` to confirm which tier it landed on.
**A hard reload clears this override** (or restart Chrome if a stale
network-quality estimate lingers — see the flag `chrome://flags/#force-effective-connection-type`
if a reading seems stuck).

The one thing that **does** work reliably via DevTools is the **Offline**
checkbox in the Network panel — it fires the browser's real `online`/`offline`
events, which `useNetworkQuality.js` listens to directly. Use that (not a
throttling preset) for every offline test below.

### Exact thresholds (`classifyNetwork`, `useNetworkQuality.js`)
| Tier | Condition |
|---|---|
| `offline` | `navigator.onLine === false` |
| `slow` | `saveData` on, OR `effectiveType` is `2g`/`slow-2g`, OR `downlink < 0.75`, OR `rtt >= 700` |
| `medium` | `effectiveType` is `3g`, OR `downlink < 2.5`, OR `rtt >= 300` |
| `fast` | none of the above (includes when the Network Information API isn't supported at all) |

## 2. Fast tier — "current full site"

Force it: `effectiveType: '4g'`, `downlink: 10`, `rtt: 50`, dispatch `change`.
Or just use a normal connection with Manual Mode set to **Auto**.

- [ ] Globe renders with full texture, bump/topology map, atmosphere glow, and idle auto-rotate (`GlobeView.jsx`, `reduced={false}`).
- [ ] Clicking a pin flies the camera to it and opens the detail panel, exactly as pre-Phase-4.
- [ ] Title cartouche, filters/stats/legend plates, and the porthole ring all appear (globe-only decorations).
- [ ] Opening a photo in the Photos tab: Network tab → its request URL has **no** `q_auto`/`w_` segment.
- [ ] Manual Mode toggle in the navbar shows **Auto** highlighted.

## 3. Medium tier — "reduced effects"

Force it: `effectiveType: '3g'`, `downlink: 1.5`, `rtt: 350`.

- [ ] Globe still renders (WebGL, not the list), but with **no** bump texture, **no** atmosphere, and **no** auto-rotate (`GlobeView.jsx`, `reduced={true}`).
- [ ] Pins/rings/click-to-select still work identically.
- [ ] Photo request URL contains `f_auto,q_auto:eco,c_scale,w_240` (check it comes *after* the existing `c_fill,h_400,w_400` component in the path, or the size fix from earlier regresses).
- [ ] Photo `Content-Length` is noticeably smaller than the fast tier's.

## 4. Slow tier — "lightweight version + no unnecessary heavy downloads"

Force it: `effectiveType: '2g'`, `downlink: 0.4`, `rtt: 800` (any one of these alone is enough per the OR logic above).

- [ ] Globe does **not** render at all — the list view (`ExpeditionListFallback.jsx`) shows instead, with its own header (station/region count, title, region key) — no overlapping plates or stray porthole ring (the layout bug fix).
- [ ] DevTools Network → JS filter → confirm `GlobeView`'s chunk is **not** requested (Phase 4's lazy-load boundary holding).
- [ ] Clicking a list row opens the same detail panel as clicking a globe pin would.
- [ ] Photo request URL contains `f_auto,q_auto:low,c_scale,w_120`, smaller than both fast and medium.
- [ ] Status label in the list reads "Low-bandwidth view."

## 5. Offline — "existing offline functionality still works"

**Use a production build (`npm run preview`) for this section**, per Section 0.

1. While online, browse the landing page and open at least one expedition with a photo, so both the expedition list and that photo have a chance to be cached.
2. Check DevTools → Application → Service Workers: confirm one is **activated and running** (only true under `npm run preview`, per Section 0).
3. Check the **Offline** checkbox in the Network panel (not a throttling preset).
4. Reload the page.

Checks:
- [ ] Console logs `quality: 'offline'` immediately (real event, no debounce delay — Phase 8 exempts offline from smoothing).
- [ ] Landing page shows the list view with status label "Offline — showing cached expeditions", populated from `globeCache` (Application → IndexedDB → `ncpor-offline` → `globeCache`).
- [ ] The previously-opened photo still displays (served from the SW's runtime cache — Application → Cache Storage → the runtime cache should list that Cloudinary URL).
- [ ] A photo you never opened while online shows the small "image unavailable" placeholder icon (`PhotoThumb`'s `onError` fallback), not a broken-image glyph.
- [ ] Existing offline queue features still work: go to Upload, fill out an expedition/content entry, submit while offline — it should queue into IndexedDB (`pendingExpeditions`/`pendingContent`) rather than fail, and the navbar's sync badge should reflect a pending count. This confirms Phases 4–9 didn't regress the pre-existing offline queue system.
5. Uncheck **Offline** → confirm the queued item(s) sync automatically and the sync badge clears.

## 6. Manual Mode (Phase 7) — overrides in both directions

- [ ] With a genuinely fast connection, click **Low Bandwidth** in the navbar → globe should disappear immediately in favor of the list, and photos should request the slow-tier transform, despite the real connection being fast.
- [ ] With a forced-slow connection (per Section 3/4's override), click **Full Quality** → globe should reappear at full quality despite the real connection reporting slow.
- [ ] With **Full Quality** selected, check the **Offline** box → confirm it still switches to the offline/list view (real offline always wins over a manual choice — Phase 7's rule).
- [ ] Click **Auto** → behavior should return to matching whatever the real/forced detected quality currently is.
- [ ] Reload the page after selecting a manual mode → the choice should persist (Application → Local Storage → `ncpor_network_mode`).

## 7. Debounced tier switching (Phase 8)

With Manual Mode on **Auto**:
1. Force `rtt: 650` (medium), dispatch `change`, confirm globe is showing.
2. Force `rtt: 750` (crosses into slow), dispatch `change` → globe should disappear **immediately**.
3. Immediately force `rtt: 650` again (back to medium) → globe should **not** reappear right away; wait ~4 seconds without changing it again → it should reappear only after that hold.
4. Repeat step 2–3 rapidly (flip `rtt` between 650 and 750 every second for 5 seconds) → check Network → JS filter that `GlobeView`'s chunk is not re-requested on every flicker, only once an upgrade actually commits.

## 8. Progressive route loading (Phase 6)

1. Hard reload `/`. DevTools → Network → JS filter → confirm no chunk for `UploadPage`, `LoginPage`, `ReviewQueuePage`, `ExpeditionPage`, or `SyncCenter` has loaded yet.
2. Navigate to `/upload` → confirm its chunk (and only its chunk) loads at that point, with a brief "Loading…" fallback visible on a throttled/slow connection.
3. DevTools → Coverage tab → reload `/` → initial JS should show meaningfully less unused-byte percentage than before route splitting.

## Pass criteria summary

| Tier | Globe | Photos | List view | Offline data |
|---|---|---|---|---|
| Fast | Full (texture+atmosphere+rotate) | Original, no transform | — | — |
| Medium | WebGL, no bump/atmosphere/rotate | `q_auto:eco,w_240` | — | — |
| Slow | Not loaded at all | `q_auto:low,w_120` | Own header, no globe plates | — |
| Offline | Not loaded at all | Cached only, else placeholder | "Offline — showing cached expeditions" | From `globeCache` + SW runtime cache |

If every checkbox above passes, Phase 10 is complete and the roadmap
(Phases 1–10) is done.
