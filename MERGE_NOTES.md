# Merge notes — base (yours) + friend #1 (expanded-edit-fixed-buttons)

## Confirmed safe: your sensitive features are untouched
Friend #1's project forked from an earlier snapshot — before your Phase 6/7
work (lazy-loaded routes, adaptive/low-bandwidth rendering, retry+backoff,
storage-quota guards, conflict-aware offline edits, alerts). None of their
files touched that code; they simply didn't have it yet. So everywhere it
mattered, your version was kept as the base and theirs was layered on top:

- offline/queue.js, syncManager.js, syncChannel.js, errors.js, storage.js,
  fileRules.js, networkPreference.js, globeCache.js — untouched (yours)
- context/NetworkContext.jsx, hooks/useNetworkQuality*.js,
  components/NetworkModeToggle.jsx, AdaptiveStyleShell — untouched (yours)
- Alerts/danger-level feature (Alert model, alert.controller/routes,
  AlertsList, AlertReportModal, DangerBadge, useAlertNotifications) —
  untouched (yours)
- App.jsx keeps your lazy-loading, NetworkProvider, alert notifications,
  and Phase-7-aware sync badge in the navbar

## Newly integrated from friend #1 (purely additive)
- Archive module: ResearchDomain enum + region/researchDomain/authors/
  source/year/priority fields on ContentItem, archive.controller/routes,
  ArchivePage, ArchiveItemPage, ArchiveUI, api/archive.js
- Profile module: avatarUrl on User, users.controller/routes, ProfilePage,
  api/users.js, avatarUpload middleware
- "Save for offline" (savedExpeditions IndexedDB store + SavedOfflinePage) —
  I additionally wired this into your existing storage-quota guard
  (ensureSpaceFor/withStorageErrors) since the original version would have
  silently ignored it
- Two new Prisma migrations added *after* your existing chain, so your
  migration history stays linear

## Decisions you made
- Expedition PATCH stays open to researcher/comms_officer/admin (needed for
  the offline edit queue) — friend's narrower comms_officer/admin-only
  version was NOT used
- Expedition DELETE now does a full cascade delete (content, tags, AI
  generations, social posts) instead of blocking when content exists —
  restricted to **admin only** (friend's version allowed comms_officer too;
  I kept the tighter admin-only scope given the larger blast radius —
  flag if you wanted comms_officer included)
- ExpeditionPage.jsx was fully rebuilt: friend's rich "Knowledge Hub" layout
  (stats bar, sticky section nav, team/timeline/data/reports/media sections,
  staff bulk-edit modal) now sits alongside your offline-safe "Quick edit"
  (still goes through enqueueExpeditionEdit + conflict resolution), your
  DangerBadge/alert reporting/AlertsList, and offline/online awareness —
  when viewing a cached copy offline, only the fields you can actually get
  offline are shown; the rest says so honestly instead of showing stale/
  empty sections

## Deliberately NOT merged (cosmetic-only, would add regression risk for no functional gain)
- UploadPage.jsx: friend's version is ~300 lines of UI rework but is
  **missing your file-size/quota validation** (fileRules.js, storage.js) —
  kept yours as-is
- LoginPage, RegisterPage, LandingPage, DatasetPreviewCard, index.css: friend
  reskinned some pages with a "brass/nautical" theme (CSS vars like
  --brass-bright, --ice) — left your existing plain theme in place
  app-wide rather than partially reskinning; say the word if you want the
  reskin adopted everywhere
- ReviewQueuePage.jsx: same theme diff, but I did pull in one real bug fix
  (toast.error instead of a blocking alert())

## One thing to sanity-check yourself
- sw.js: adopted friend's explicit precaching of the two globe textures on
  install (cache v2→v3) since it's a genuine offline-reliability win for a
  feature you have and they didn't — worth a quick offline-reload test on
  the globe view

## Update — UI pass (second request)
Per your follow-up, replaced most remaining plain-themed pages with friend
#1's UI, since it turned out to be the *correct* established theme all
along — your own index.css already fully defines the brass/nautical design
system (--brass-bright, .brass-plate, .chart-backdrop, etc.) AND your Phase
3 low-bandwidth CSS specifically degrades those exact classes at
medium/slow network quality. The plain pages were the ones lagging behind
your own design system, not the other way around. So:

- **UploadPage.jsx** — replaced wholesale with friend's UI (the richer
  drag-and-drop FileDropZone, per-type icons/accents, progress dots). I
  then surgically re-added the two things missing from it: `validateFile()`
  (offline/fileRules.js) on both file-select handlers, and the
  `OfflineStorageError` branch in the submit catch block. The actual
  offline-queue submission logic (enqueueContent/enqueueExpedition,
  live-then-queue fallback) was already byte-identical between the two
  versions, so nothing there needed touching.
- **LoginPage.jsx, RegisterPage.jsx, DatasetPreviewCard.jsx,
  ReviewQueuePage.jsx** — swapped wholesale for friend's versions. All four
  are pure presentation with no offline/sync logic, so this was a safe
  direct replace.
- **ExpeditionPage.jsx** — restored the actual brass/ice theme tokens
  (`var(--brass-bright)`, `.gauge-text`, `.chart-backdrop`) in the
  decorative spots I'd temporarily substituted with plain cyan while
  building the merge, so it now matches the rest of the reskinned app.
- **LandingPage.jsx** — left exactly as-is, per your instruction.
- **Not touched** (no friend #1 equivalent exists, so nothing to swap in):
  GlobeView, ExpeditionListFallback, AlertsList, AlertReportModal,
  DangerBadge, NetworkModeToggle, SyncCenter. These already reference the
  same theme classes (`.globe-stage`, `.porthole-*`, `.expedition-pin-badge`
  etc. — visible in your own index.css), so they should already look
  consistent, but worth a visual check.

## Update — "View full expedition record" bug fix + full feature audit
Root cause of the broken button: your own `LandingPage.jsx` had a leftover
placeholder link (`to="/"`) on the "View full expedition record" button in
the globe's detail panel — friend #1 had already fixed this to
`navigate(\`/expeditions/${selectedPin.id}\`)` in their copy. Since you'd
asked me to leave the landing page untouched, this one pre-existing bug
carried through. Fixed it as a single-line patch (now
`to={\`/expeditions/${selectedPin.id}\`}`) — nothing else on the landing
page was touched.

Also did a full re-audit against your "I want all additional features of
file 2" request: every file unique to friend #1 (archive, profile,
saved-offline, their controllers/routes) is in; every shared file where
friend #1 had genuinely new additions has those merged in. The remaining
shared files that still differ (SyncCenter.jsx, syncManager.js, queue.js,
syncChannel.js, useSyncStatus.js) are all confirmed to be friend #1's
*older* pre-Phase-7 versions with nothing new to add — bringing those over
would remove functionality (conflict handling, retry backoff, storage
warnings), not add it, so they were correctly left as your originals.

## Update — comms_officer delete permission
Per your confirmation, comms_officer and admin now have identical
permissions for deleting expeditions (matches friend #1's original design):
- server/src/routes/expedition.routes.js: DELETE now
  authorize('comms_officer', 'admin') instead of admin-only
- client ExpeditionPage.jsx: the "Delete expedition" button in the detail
  panel now shows for isStaff (comms_officer + admin) instead of admin-only,
  matching the ArchivePage's "Remove expedition" button, which was already
  gated this way — that's what caused the mismatch you hit.

## Update — expedition delete failing with a foreign-key error
Root cause: `alerts` has a RESTRICT foreign key to `expeditions`, and
friend #1's cascade-delete transaction (which I adopted for the delete
*behavior*) never accounted for it — their project never had the Alerts
feature, so their version of this function has no idea that table exists.
Fixed by deleting an expedition's Alert rows first, inside the same
transaction, before content items / tags / AI generations / the
expedition itself. No schema or migration change needed — this was
missing application code, not a missing constraint.

## Update — 3D dataset visualization (temperature/depth/salinity) from friend #2
New zip (ncpor-portal-fixed__2_.zip) — extracted its one genuinely new
feature and left the rest alone, since the rest of that project was a
similar earlier-fork situation to friend #1's (missing your Phase 7 sync
work, alerts, etc.) with nothing further to add.

**What's new:**
- `client/src/utils/oceanSection.js` — dependency-free column-detection
  logic. Scans a parsed dataset's headers for depth/temperature/salinity/
  position columns (by alias matching, e.g. "Depth (m)", "Water Temp") and
  reshapes matches into a point cloud. Returns `null` when the dataset
  doesn't look like a depth profile — every caller falls back to the plain
  table preview in that case, so this can never break an unrelated upload.
- `client/src/components/OceanSection3D.jsx` — Three.js-rendered
  triangulated depth/temperature-or-salinity slab, orbit-controllable.
- `client/src/components/TempSalinityDepth3D.jsx` — companion 3D
  temperature × salinity × depth scatter plot.
- `client/src/utils/parseDataset.js` — refactored (behavior-preserving) so
  the existing `parseDataset()` and a new `parseDatasetFull()` share the
  same underlying CSV/Excel/manual-table parsing. `parseDatasetFull()`
  additionally resolves the full row set (not just the 8-row preview) so
  the 3D viewer has real data to work with — that full table is never sent
  to the server, only the usual summarized `datasetMeta` is.
- New dependency: `d3-delaunay` (added to client/package.json;
  `three`/OrbitControls were already present for the globe view).

**Where it shows up:**
- **UploadPage** — when a researcher uploads or manually builds a dataset
  that looks like a depth profile, the 3D viewers render live, right under
  the existing table preview, before submission.
- **ExpeditionPage** (detail view) — the same viewers render under a
  dataset's preview once it's part of an expedition record, built from the
  smaller server-stored `preview_rows` (sparser than the live upload
  version, since only a preview subset ever reaches the server).

Both hook points are purely additive — nothing else in either file's
existing logic (offline queue, quota checks, file validation, conflict
resolution) was touched.

**You'll need to run `npm install` in `client/`** before the next build —
this pulls in `d3-delaunay`.

## Update — Explore tab + global search (from ncpor-portal-phase7-current.zip)
This zip was a flat, unstructured dump (no client/server folders, included
a built dist bundle and a raw .env — both ignored). Also confirmed this
fork predates alerts/archive/profile, same situation as friend #1/#2's
initial forks, so only the two genuinely new features were pulled in.

**Added:**
- `pages/ExplorerPage.jsx` + `components/explorer/` (ExplorerGlobe,
  ExplorerSearch, ExplorerStats, ExplorerTimeline, VisualExplorer,
  Explorer.css) — a new "/explore" page: its own globe view (stations +
  expeditions), a global search bar, a photo gallery, and two honestly-
  labeled "coming soon" placeholders (stats, timeline). Deliberately kept
  visually separate (its own scoped CSS/color scheme) rather than
  reskinned into the brass theme, since you asked for the *feature*, not
  a restyle.
- `api/search.js`, `api/stations.js` (client) — thin wrappers for the new
  endpoints.
- `server/src/routes/search.routes.js` — new `GET /api/search?q=` endpoint,
  searching researchers/expeditions/datasets/regions in one call.
- `server/src/routes/stations.routes.js` + `stations.controller.js` +
  `server/data/researchStations.data.js` — serves the 3 fixed Indian
  Antarctic research stations shown on the Explorer globe.
- Fixed the long-standing dead "Explore" nav link (`to="/"`) to actually
  point at `/explore`.
- Fixed a route-path bug in VisualExplorer's "View Expedition" link
  (`/expedition/:id` → `/expeditions/:id`, matching this app's actual
  route).

**Security fix — did not carry this over as-is:** the search endpoint's
dataset search had no status filter and no auth guard, meaning it would
have let anonymous visitors search and see titles of draft/in-review
content pending approval — every other content query in this app enforces
published-only visibility for unauthenticated requests
(content.controller.js's getContentById, listContent's default). Added
`status: 'published'` to the search query to match. Worth knowing: the
researcher search does return email addresses to anyone, unauthenticated —
that matches an existing pattern already present in this codebase
(listContent's uploader `select` also exposes email publicly), so I left
it as-is rather than unilaterally changing established behavior, but it's
worth a decision on your end if this app is ever public-facing.

**Deliberately left out — dead code in the source project itself:**
`explorer.controller.js`/`explorer.routes.js` (temperature/sea-ice
synthetic grid data) and `ResearcherExplorer.jsx` were never mounted or
imported anywhere in that project either — not wired to any route, any
button, any nav link. Including them would just be unused code with
nothing pointing at it. Happy to add them if you want the scaffolding in
place for a future phase.

No schema changes, no new npm dependencies — this feature only reads
existing User/Expedition/ContentItem fields and uses `react-globe.gl`/
`three`, both already in the project.
