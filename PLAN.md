# Vehicle Surveillance System - Execution Plan

## Architecture

Three components. Nothing else.

```
┌──────────────────────────────────────────────────────────┐
│                    CENTRAL SERVER                        │
│                     (apps/api)                           │
│                                                          │
│  - stores ALL scans from ALL workstations                │
│  - manages all workstations and tablets                  │
│  - creates and assigns hit lists                         │
│  - analytics and reporting across all workstations       │
│  - user auth (admin, operator)                           │
│  - PostgreSQL                                            │
└──────────┬──────────────────────────────┬────────────────┘
           │ HTTPS (sync, ingest,        │ HTTPS (API)
           │ hitlist download)            │
           │                              │
┌──────────▼──────────┐     ┌─────────────▼──────────────┐
│     WORKSTATION     │     │     ADMIN PORTAL            │
│ (apps/workstation-  │     │     (apps/web)              │
│       agent)        │     │                             │
│                     │     │  - central dashboard        │
│ - runs in police car│     │  - workstation management   │
│ - camera + OCR      │     │  - hit list CRUD            │
│ - scans ALL vehicles│     │  - hit list assignment      │
│ - local hit list    │     │  - analytics                │
│   matching          │     │  - alert feed               │
│ - sends everything  │     └─────────────────────────────┘
│   to central server │
│ - SQLite (offline)  │
│ - TTS alerts        │
└──────────┬──────────┘
           │ WebSocket (local LAN)
           │
┌──────────▼──────────┐
│       TABLET        │
│    (apps/tablet)    │
│                     │
│ - paired to ONE     │
│   workstation       │
│ - operator login    │
│ - startup checks    │
│ - live scan feed    │
│ - alert dashboard   │
│ - hit list assign   │
│   for this WS only  │
│ - analytics for     │
│   this WS only      │
│ - PWA               │
└─────────────────────┘
```

### Data Flow

1. Workstation boots, connects to central server, downloads assigned hit lists.
2. Tablet connects to workstation over local network (WebSocket).
3. Operator logs in on tablet, sees startup health checks (camera, OCR, connectivity).
4. Workstation scans every passing vehicle via camera + OCR.
5. Every plate is stored locally (SQLite) and queued for upload to central server.
6. If a plate matches the local hit list, an alert fires: TTS announcement + tablet notification.
7. Workstation drains its outbox to central server (all detections, all matches, all snapshots).
8. Central server stores everything. Dashboard shows all workstations, all scans, all hits.
9. From the central portal OR from a tablet, operators can assign hit lists to specific workstations.

### Key Constraint

Every vehicle scanned is stored in the central server, not just hit list matches. The workstation sends everything.

---

## Current State

### What Already Works

**Central Server** (`apps/api` - Hono + PostgreSQL + Prisma)
- User auth with Better Auth (admin, operator, scanner roles)
- Workstation and tablet device registry with token-based auth
- Device pairing (workstation ↔ tablet)
- Hit list CRUD with versioning
- Detection ingest from workstations
- Match event ingest and alert lifecycle (PENDING → ACKNOWLEDGED → ESCALATED/FALSE_POSITIVE/RESOLVED)
- Sync endpoints for hitlists and cursors
- Outbox processor for event fan-out
- Telemetry/heartbeat collection
- Rate limiting, audit logging, field-level encryption
- Evidence snapshot storage

**Admin Portal** (`apps/web` - Next.js)
- Login with role-based routing
- Dashboard with workstation status
- Alert feed with match events
- Watchlist (hit list) management UI
- Detection search and history
- Device management (registration, pairing)
- Analytics page
- Settings page
- Standalone scanner UI for field operators (`/scanner/`)

**Workstation Agent** (`apps/workstation-agent` - Node.js)
- Camera capture via FFmpeg (file or RTSP source)
- OCR via Tesseract.js with preprocessing (grayscale, normalize, threshold)
- Local SQLite database for offline operation
- Hit list sync from central server
- Plate matching (exact + fuzzy with OCR confusion map)
- TTS alerts on match via system speaker
- Outbox pattern for reliable sync to central server
- Health checks and heartbeat reporting
- Tablet WebSocket bridge for alert delivery
- Snapshot capture with compression and retention

### What Does Not Exist

1. **Tablet app** - no `apps/tablet` directory exists. The WebSocket bridge on the workstation is built, but there is no client consuming it.

2. **Store all scans** - the workstation currently skips non-matching plates entirely (`main.ts` line 411: `if (!match.matched) { continue; }`). Only plates that match the hit list are stored and synced. The user requires every scanned plate to be logged.

3. **Hit list assignment per workstation** - hit lists are global. Any workstation can sync any active hit list. There is no assignment model (which hit list goes to which workstation).

4. **Workstation startup flow on tablet** - the workstation boots headless. There is no UI showing startup checks (camera OK, OCR OK, connectivity OK) to the operator. Health data exists internally but is not surfaced to a tablet.

5. **Tablet-specific analytics** - the analytics page exists in the admin portal but is not filtered per workstation. A tablet should only see data for its paired workstation.

6. **Hit list management from tablet** - hit list assignment and creation is admin-portal-only. The tablet needs to assign hit lists to its paired workstation.

7. **Connected devices view** - the workstation's TabletBridge tracks WebSocket connections but does not expose a list of connected tablets.

---

## Execution Plan

### Phase 1: Store All Scans

**Goal**: Every plate the workstation OCRs gets stored locally and synced to central server, regardless of hit list match.

**Why first**: This is the data foundation. Everything else (tablet dashboard, analytics, central reporting) depends on having complete scan data.

**Changes**:

`apps/workstation-agent/src/main.ts`:
- Remove the `if (!match.matched) { continue; }` gate that skips non-matching detections.
- Store every detected plate as a `PendingDetection` in SQLite.
- Only create `PendingMatchEvent` records for actual matches (keep current logic for matches).
- Non-matching detections still go through the outbox flusher and get synced to central.
- Skip snapshot capture for non-matches (storage cost too high). Only capture snapshots for matches.

`apps/workstation-agent/src/sync/outbox.ts`:
- Verify the outbox flusher handles the increased detection volume. May need batch size tuning.
- Add a config option `DETECTION_BATCH_SIZE` for controlling how many detections are sent per flush cycle.

`apps/api/src/routes/ingest.ts`:
- Verify the ingest endpoint handles detections that have no match event (currently it should, but confirm).
- No schema changes needed. The `Detection` model already supports `hitlistId: null`.

**Exit criteria**:
- Run workstation with a test video. OCR reads 50 plates. 3 match the hit list.
- SQLite `pending_detections` table contains all 50 entries.
- Central PostgreSQL `detections` table contains all 50 entries after outbox flush.
- Only 3 `match_events` are created (one per matching plate).
- Snapshots are captured only for the 3 matches.

---

### Phase 2: Hit List Assignment Per Workstation

**Goal**: Assign specific hit lists to specific workstations. A workstation only downloads and matches against its assigned hit lists.

**Schema change** (`apps/api/prisma/schema.prisma`):
```prisma
model HitlistAssignment {
  id            String      @id @default(cuid())
  hitlistId     String
  workstationId String
  assignedAt    DateTime    @default(now())
  assignedBy    String?     // userId who made the assignment
  hitlist       Hitlist     @relation(fields: [hitlistId], references: [id], onDelete: Cascade)
  workstation   Workstation @relation(fields: [workstationId], references: [id], onDelete: Cascade)

  @@unique([hitlistId, workstationId])
  @@map("hitlist_assignments")
}
```

Add relation fields to `Hitlist` and `Workstation` models:
```prisma
// in Hitlist:
assignments HitlistAssignment[]

// in Workstation:
hitlistAssignments HitlistAssignment[]
```

**API changes** (`apps/api/src/routes/hitlists.ts`):
- `POST /api/hitlists/:hitlistId/assign` - assign hit list to one or more workstations. Body: `{ workstationIds: string[] }`. Role: admin, operator.
- `DELETE /api/hitlists/:hitlistId/assign/:workstationId` - remove assignment. Role: admin, operator.
- `GET /api/hitlists/:hitlistId/assignments` - list assigned workstations. Role: admin, operator.
- `POST /api/hitlists/:hitlistId/assign-all` - assign to ALL active workstations. Role: admin.

**Sync changes** (`apps/api/src/routes/sync.ts`):
- `GET /api/sync/hitlists` (device-authenticated) - return only hit lists assigned to the requesting workstation's device ID.
- Change from the current model where the workstation must know the hitlist ID in advance.

**Workstation changes** (`apps/workstation-agent/src/hitlist/downloader.ts`):
- Remove `HITLIST_ID` env var dependency.
- On sync, call `GET /api/sync/hitlists` to get the list of assigned hit lists, then download each.

**Portal changes** (`apps/web`):
- Add assignment UI to the watchlist/hit list management page.
- Show which workstations have each hit list.
- Allow assigning to individual workstations or all.

**Exit criteria**:
- Create hit list H1 in portal. Assign to workstation W1 only.
- W1 syncs and gets H1. W2 syncs and gets nothing.
- Assign H1 to W2. W2 syncs and gets H1.
- Assign-all endpoint assigns to all active workstations.
- Removing assignment stops the workstation from syncing that hit list on next cycle.

---

### Phase 3: Tablet PWA

**Goal**: Build `apps/tablet` as a Progressive Web App that connects to a specific workstation and gives the operator a dashboard, alert feed, hit list controls, and analytics for that workstation.

**Tech stack**: Next.js (consistent with apps/web), Tailwind, Radix UI, PWA manifest + service worker.

**Directory**: `apps/tablet/`

**Authentication flow**:
1. Tablet opens to a pairing screen.
2. Operator enters workstation address (or scans QR code from workstation).
3. Tablet connects to workstation's WebSocket bridge (existing `TabletBridge` on port 8089).
4. Tablet also authenticates with central server using device token (for API calls like hit list assignment).
5. On successful connection, tablet is paired to that workstation.

**Screens**:

1. **Pairing/Login** (`/`)
   - Workstation address input (IP:port or hostname).
   - Optional: operator credentials (username/password against central API).
   - Connection status indicator.

2. **Startup Checks** (`/startup`)
   - Shows workstation health: camera status, OCR status, database status, central server connectivity.
   - Data source: workstation broadcasts `{ type: "health", data: healthReport }` over WebSocket (already implemented in `main.ts` line 356).
   - Green/red indicators per component.
   - Proceeds to dashboard when all checks pass.

3. **Dashboard** (`/dashboard`)
   - Live scan count (total plates today / this session).
   - Hit count (matches today / this session).
   - Last scanned plate (live feed from workstation WebSocket).
   - Workstation status (online/offline, uptime).
   - Connected tablets count.
   - Data source: WebSocket events from workstation + periodic central API calls for aggregated stats.

4. **Alerts** (`/alerts`)
   - Live feed of hit list matches from this workstation.
   - Each alert shows: plate, matched hit list entry, priority, reason, timestamp, snapshot.
   - Acknowledge/escalate/dismiss actions (calls central API `PATCH /api/match-events/:id`).
   - Data source: WebSocket `{ type: "alert", data: AlertPayload }` from workstation (already implemented in `main.ts` line 253).

5. **Hit List Management** (`/hitlists`)
   - Show hit lists assigned to this workstation.
   - Assign/unassign hit lists (calls central API assignment endpoints from Phase 2).
   - View entries in each hit list.
   - Upload new hit list (calls central API hit list creation endpoint).

6. **Analytics** (`/analytics`)
   - Scan volume over time (hourly/daily) for THIS workstation only.
   - Hit rate (matches / total scans).
   - Top matched plates.
   - Data source: central API with workstation ID filter.

7. **Settings** (`/settings`)
   - Connected devices (other tablets paired to this workstation).
   - Workstation info (device ID, name, registration date).
   - Disconnect/unpair action.

**Central API additions for tablet**:
- `GET /api/detections?workstationId=X` - filtered detections (for analytics). Role: admin, operator, or device-authenticated tablet paired to X.
- `GET /api/match-events?workstationId=X` - filtered matches (for alert feed). Already exists, may need workstation filter.
- `GET /api/workstations/:id/stats` - aggregated stats (total scans today, hits today, uptime). New endpoint.
- `GET /api/workstations/:id/connected-devices` - list of tablets currently connected. Requires workstation to report this.

**Workstation changes for tablet support**:
- Broadcast all detections (not just matches) over WebSocket to tablet: `{ type: "detection", data: { plate, confidence, timestamp } }`.
- Broadcast connected tablet count when tablets connect/disconnect.
- Report connected tablet device IDs in heartbeat payload to central server.

**Exit criteria**:
- Tablet connects to workstation via WebSocket and shows green health checks.
- Tablet shows live scan feed as workstation processes video.
- Tablet shows alert when a hit list match occurs.
- Tablet can acknowledge/escalate an alert (status changes in central DB).
- Tablet can view and assign hit lists to its paired workstation.
- Tablet analytics show scan volume and hit rate for this workstation only.
- Tablet works as installable PWA on Android tablet.

---

### Phase 4: Central Portal Enhancements

**Goal**: Upgrade the admin portal to properly manage multiple workstations, assign hit lists, and show cross-workstation analytics.

**Dashboard improvements** (`apps/web/src/app/portal/(app)/dashboard/page.tsx`):
- Show all workstations with live status (online/offline, last seen, scan count, hit count).
- Click a workstation to see its detail view (same data the tablet shows).
- Map view if GPS is added later (out of scope for now, but leave a slot).

**Hit list assignment UI** (`apps/web/src/app/portal/(app)/watchlist/page.tsx`):
- When viewing a hit list, show assigned workstations.
- Add "Assign to workstation" action with workstation selector.
- Add "Assign to all" bulk action.
- Show assignment status (synced/pending) per workstation.

**Analytics** (`apps/web/src/app/portal/(app)/analytics/page.tsx`):
- Cross-workstation view: total scans, total hits, per-workstation breakdown.
- Filter by workstation, date range.
- Backend: `GET /api/analytics/summary?from=DATE&to=DATE&workstationId=OPTIONAL` endpoint.

**Devices page** (`apps/web/src/app/portal/(app)/devices/page.tsx`):
- Show which tablets are connected to each workstation.
- Show last heartbeat timestamp.
- Show tablet connection history.

**Exit criteria**:
- Portal dashboard shows 3 workstations with live status.
- Admin assigns hit list H1 to workstation W1 from portal.
- W1 syncs H1 on next cycle.
- Analytics page shows scan volume breakdown across all 3 workstations.
- Devices page shows which tablets are connected to which workstation.

---

### Phase 5: Offline Sync and Reliability

**Goal**: Workstation operates reliably during internet outages. All data is preserved and synced when connectivity returns.

**Workstation offline behavior**:
- Continue scanning, matching, and alerting without central server connectivity.
- Queue all detections and match events in SQLite outbox.
- Queue snapshots for later upload.
- Tablet stays connected over local WebSocket (independent of internet).
- When internet returns, drain outbox in order: match events first (priority), then detections, then snapshots.

**Outbox improvements** (`apps/workstation-agent/src/sync/outbox.ts`):
- Priority ordering: match events before detections.
- Configurable max retry count (currently fixed, make it env-configurable).
- Dead letter handling: after N retries, move to a dead letter table instead of silently dropping.
- Idempotent uploads: use `externalEventId` as deduplication key (already exists in schema).

**Central server resilience** (`apps/api/src/routes/ingest.ts`):
- Verify idempotent behavior on duplicate `externalEventId` submissions.
- Return 200 (not 409) for duplicate submissions so the workstation marks them as synced.

**Hitlist offline cache** (`apps/workstation-agent/src/hitlist/downloader.ts`):
- On successful hitlist download, persist a local snapshot.
- On startup with no internet, use the cached snapshot.
- Never clear the local hitlist until a new version is confirmed downloaded.

**Exit criteria**:
- Disconnect workstation from internet. Scan 100 plates. 5 match.
- All 100 detections and 5 match events are in SQLite.
- Tablet still receives alerts over local WebSocket.
- Reconnect internet. All 100 detections and 5 match events appear in central DB within 2 minutes.
- No duplicates after reconnection (idempotent upload verified).
- Kill workstation process, restart. Cached hitlist is loaded. Scanning resumes without internet.

---

### Phase 6: Security and Hardening

**Goal**: Production-ready security posture.

**Scope**:
- TLS for all central server endpoints.
- Encrypted WebSocket (WSS) for tablet-workstation communication when on untrusted networks.
- Field-level encryption for sensitive hit list entry fields (already implemented, verify coverage).
- Device token rotation policy.
- Session timeout for tablet operator login.
- Audit log coverage for all hit list assignments and alert status changes.
- Rate limiting on tablet-facing endpoints.
- Input validation on all API endpoints (plate format, hit list entry fields).

**Exit criteria**:
- All API endpoints require authentication.
- Sensitive data in hit list entries is encrypted at rest.
- Audit log records every hit list assignment and alert action.
- Device tokens can be rotated without workstation downtime.

---

## Repo Structure After All Phases

```
apps/
  api/                    # central server (Hono + PostgreSQL)
  web/                    # admin portal (Next.js)
  tablet/                 # tablet PWA (Next.js)         ← NEW
  workstation-agent/      # field runtime (Node.js)
  ws-server/              # legacy WebSocket relay (optional, preserved)
```

## Build Order

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6.

No phase can be skipped. Each depends on the previous:
- Phase 3 (tablet) needs Phase 1 (all scans stored) and Phase 2 (hitlist assignment) to show real data.
- Phase 4 (portal enhancements) needs Phase 2 (assignment model) to show assignment UI.
- Phase 5 (offline) needs Phase 1 (all scans) to guarantee nothing is lost.
- Phase 6 (security) comes last because it hardens what is already working.

## What Not To Touch

- The existing ANPR scanner at `/anpr` and `/scanner/` - leave it working as-is.
- The existing Azure deployment path - do not break it.
- The existing outbox pattern - extend it, do not replace it.
- The existing Better Auth setup - reuse it for tablet auth if needed.
- The `fe/survilience` directory - deprecated, already migrated to `apps/web`.
