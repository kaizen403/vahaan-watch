# Vehicle Surveillance System Plan

## Purpose

This plan translates the uploaded `Vehicle Surveillance System.docx` into an implementation roadmap that fits the current repository and protects the working Azure ANPR deployment.

The current system already proves two important things:

- Carmen ANPR integration works in this repo.
- A web UI plus realtime scan flow can run successfully in Azure.

The document describes a much larger product than the current codebase. The right approach is to keep the current scanner working as the baseline, then build the missing platform pieces around it in phases.

## Locked Planning Assumptions

Unless you explicitly change them later, this plan assumes the following defaults.

### OCR Mode

Use local OCR on the field workstation for the real system.

Reason:

- the document requires meaningful offline behavior
- local hitlist matching is faster and more reliable at the edge
- field runtime should not depend on round-tripping every frame to the cloud

The current Azure cloud-based scanner remains valuable, but as:

- a working baseline
- a diagnostic tool
- a fallback or demo path

### Central Database

Use PostgreSQL as the central system of record.

Reason:

- strong fit for users, devices, hitlists, detections, alerts, audit logs, and sync state
- good indexing and relational integrity
- good support for operational metadata and structured payloads
- easy to host on Azure first

### Local Workstation Database

Use SQLite on each workstation.

Reason:

- simple local deployment
- good fit for buffered detections, match events, hitlist snapshots, and sync cursors
- no external dependency on the field device

### Frontend Direction

Merge `fe/survilience` into `apps/web` instead of keeping it as a permanent separate app.

Reason:

- it already matches the central command UI better than the current scanner pages
- one web app is simpler to maintain than two unrelated frontend deployments
- the current `/anpr` scanner can stay alive as an operator tool inside the same app

### Tablet Direction

Build the tablet experience as a PWA first.

Reason:

- fastest path to field validation
- aligns with the document's browser-oriented wording
- can be upgraded to native Android later if hardware or kiosk requirements force it

### Backend Direction

Add a dedicated `apps/api` service for central business logic.

Reason:

- auth, hitlist sync, telemetry ingest, alert workflows, and audit logs should not live in ad hoc route handlers
- this keeps the system extensible without destabilizing the working scanner

### Authentication Direction

Use Better Auth for central human users.

Reason:

- it fits the TypeScript stack well
- it gives a clean path for sessions, roles, and future provider expansion
- it replaces the current hardcoded login model cleanly

Recommended split:

- Better Auth for admins and central operators
- device credentials or API keys for workstations and tablets

Do not model field devices as normal human-session users.

Recommended default:

- username/password for central users in v1

### Evidence Direction

Use snapshots, not clips, in the first implementation.

Reason:

- enough for operator review and audit
- far cheaper and simpler than video retention
- easier to store, sync, and display in alerts

Recommended default:

- capture and retain snapshots for all plate detection events, including:
  - hitlist matches
  - non-match detections
- do not retain clips in v1

Operational note:

- this will still create meaningful storage volume
- the implementation should therefore include compression, retention policies, and tiered cleanup from day one

### GPS Scope Direction

Do not include GPS in the first implementation scope.

Reason:

- you clarified that this system is focused on detection surveillance only
- GPS would add integration cost without helping the current product goal

Recommended treatment:

- remove GPS from the core v1 scope
- keep the architecture open for a future location adapter only if the requirement appears later

### Alert Workflow Direction

Use a staged alert lifecycle instead of a single fire-and-forget notification.

Recommended v1 lifecycle:

1. detection created locally
2. hitlist match confirmed locally
3. alert delivered to tablet and central backend
4. operator acknowledges alert
5. operator marks one of:
   - escalate
   - false positive
   - resolved
6. optional note is attached for audit trail

Reason:

- enough workflow control without overbuilding dispatch software
- supports auditability
- supports later expansion to unit assignment and escalation policies

### Messaging And Reliability

Start with PostgreSQL plus an outbox pattern, not an external message broker.

Reason:

- enough for ordered sync, retries, event buffering, and idempotent uploads
- lower operational burden during the first implementation phases

### Deployment Direction

Stay Azure-first for the central system, but keep the architecture hybrid-ready.

Reason:

- Azure is already the working production baseline
- the field workstation can still be designed to sync with a future private-network or on-prem backend

## What The DOCX Is Asking For

The document and embedded figures describe four major system domains.

1. Admin and central operations
   - A web portal for login and hitlist upload
   - A central server that stores hitlists and distributes them
   - A central workstation dashboard for monitoring field systems

2. Field workstation
   - A PC/workstation connected to cameras, GPS, Carmen OCR, a local DB, and a tablet
   - Real-time plate detection and local hitlist matching
   - Voice alerts on hit

3. Tablet
   - A field-facing tablet or PWA
   - Health-check connection with the workstation
   - Alert delivery to operators

4. Reliability and sync
   - Continuous synchronization between field workstations and the central backend
   - Local persistence during outages
   - Priority upload of hit events when connectivity returns

## Image And Architecture Review

### Fig 1.1: Client/Admin -> Web Portal -> Main Server

This figure defines the admin flow:

- client/admin opens the web portal
- logs in
- uploads a hitlist
- portal sends the hitlist to the main server
- server confirms success

This is the clearest and most complete part of the document. It maps directly to a future admin portal and backend API.

### Overall Architecture Figure

The overall architecture image shows:

- on-site tablet
- workstation/PC
- local DB on the workstation
- OCR running close to the workstation
- GPS input
- camera input
- a private network link to a backend/on-prem server

This figure makes one architecture point very clear: the field workstation is not just a thin browser client. It is a real edge node with local responsibilities.

### Field Sequence Figure

The large sequence diagram describes:

- system initialization
- health check
- live detection
- hitlist matching
- alert delivery to server and tablet
- offline storage and later sync

This is the intended behavior of the field runtime. Most of it does not exist in the repo yet.

### Document Inconsistencies

The document is directionally useful, but it is not implementation-ready yet.

- The "Vehicle Tablet" text repeats the admin portal upload flow. That conflicts with the diagrams, where the tablet acts more like an alert consumer than a hitlist uploader.
- "Encryption of all DB attributes" is too broad to implement literally. Searchable fields, sync cursors, foreign keys, and operational metadata need a more precise rule.
- "Message queues" are mentioned, but the document does not define which data must be queued, what ordering guarantees are required, or what latency is acceptable.
- The field architecture implies local capability, but the document does not say whether OCR must continue when the internet is down.

Those gaps need to be resolved before implementation starts.

## Current Repo Baseline

As of now, the repo provides a working ANPR prototype, not the full surveillance platform.

### What Exists

- `apps/web`
  - Next.js UI
  - upload-video scan flow
  - live camera scan flow
- `apps/web/src/app/api/scan/route.ts`
  - accepts uploaded video
  - transcodes with `ffmpeg`
  - calls the Carmen sample binary
- `apps/ws-server/server.js`
  - receives JPEG frames from the browser over WebSocket
  - sends frames to the Carmen Vehicle API
  - returns detections to the client
- `fe/survilience`
  - standalone Vite frontend
  - central command-center style UI
  - dashboard, alerts, watchlist, search, analytics, settings, and login screens
  - currently powered by hardcoded data and local state only
- Azure deployment path
  - currently working
  - should remain the non-breaking baseline

### What Does Not Exist Yet

- authentication and roles
- persistent central database
- hitlist CRUD and import workflows
- central monitoring dashboard
- device and workstation registry
- tablet app or tablet pairing flow
- workstation runtime service
- local field database
- offline queue and sync engine
- telemetry pipeline
- encryption design
- alert acknowledgement flow
- audit logs

## Frontend Reuse Assessment: `fe/survilience`

This frontend is worth reusing, but only for the right role.

### What It Is Good For

The screen set lines up well with the central-side product from the document:

- `Login.tsx` can become the portal login screen
- `Dashboard.tsx` can become the central workstation overview
- `HitAlerts.tsx` can become the live alert queue
- `Watchlist.tsx` can become the watchlist or hitlist management screen
- `DetectionSearch.tsx` can become history and search
- `Analytics.tsx` can become reporting
- `Settings.tsx` can become system administration
- `CameraMonitor.tsx` can become a central camera or device monitor

This matches the document far better than the current `apps/web` scanner UI does.

### What It Is Not Ready For

It is still a frontend mock, not a production application shell.

- auth is hardcoded in `Login.tsx`
- routing is tab-state inside `App.tsx`, not real app routing
- data is local mock data inside page files
- alert actions are demo-only
- images are placeholder Unsplash assets
- there is no API client layer
- there is no persistence
- there is no role enforcement

### Recommended Reuse Strategy

Use `fe/survilience` as the base for the central portal and central workstation UI, then migrate it into the main repo instead of running it forever as a separate frontend island.

Recommended approach:

1. keep `fe/survilience` as the design and interaction reference
2. port its pages and reusable components into `apps/web`
3. replace tab-state navigation with real routes
4. wire the screens to the new backend APIs
5. keep the current ANPR scanner routes alive as operator tools

### Recommended Route Mapping

Suggested route targets inside `apps/web`:

- `/portal/login`
- `/portal/dashboard`
- `/portal/alerts`
- `/portal/watchlist`
- `/portal/search`
- `/portal/analytics`
- `/portal/settings`
- `/portal/cameras`

The current scanner can remain under the existing `/anpr` base path as a separate operational toolset.

### Reuse Boundaries

What to reuse directly:

- layout shell
- navigation structure
- card and chart composition
- watchlist table layout
- alert queue layout
- search screen layout

What to rewrite while preserving the visual direction:

- auth logic
- data fetching
- global state
- route handling
- image and media handling
- action handlers
- settings persistence

## Critical Architecture Observation

The current realtime flow is cloud-based.

- browser captures frames
- `apps/ws-server` forwards them to Carmen's Vehicle API

That is good enough for the current Azure scanner, but it is not sufficient as the final field architecture described in the document.

This plan therefore assumes:

- field workstation = local OCR and local hitlist matching
- current Azure realtime scanner = retained reference path, not the final field runtime

This is the most important architecture decision in the whole plan, because it shapes the workstation agent, the local DB, and the offline sync model.

## Recommended Target Architecture

The safest path is to keep the existing scanner intact and build the full system beside it.

### 1. Central Backend

Add a dedicated backend service instead of forcing all durable business logic into Next route handlers.

Recommended responsibility:

- authentication and RBAC
- hitlist ingestion and distribution
- device registry
- telemetry ingestion
- alert/event storage
- sync APIs
- audit trail

Recommended repo addition:

- `apps/api`

Recommended default:

- central relational DB: PostgreSQL

### 2. Admin Portal And Central Workstation UI

Keep `apps/web` as the user-facing web application, but expand it beyond the current scanner.

Recommended responsibility:

- admin login
- hitlist upload and review
- central dashboard
- workstation/tablet status pages
- live alert feed
- search and history

The current upload and realtime scanner pages should stay in place as diagnostics and operator tools while the larger product is built.

This plan assumes the central UI will be built by absorbing `fe/survilience` into `apps/web` instead of redesigning the central UI from scratch.

### 3. Field Workstation Service

Add a dedicated workstation runtime instead of treating the browser as the field runtime.

Recommended repo addition:

- `apps/workstation-agent`

Recommended responsibility:

- camera input handling
- Carmen OCR integration
- local hitlist snapshot
- local hitlist matching
- local DB writes
- offline queue
- health checks
- TTS alerting
- tablet communication

Recommended default:

- local workstation DB: SQLite
- OCR should run locally in this service
- GPS is out of scope for v1

### 4. Tablet Application

Add a tablet-facing client as a separate surface.

Recommended repo addition:

- `apps/tablet`

Recommended responsibility:

- operator login or pairing
- alert feed
- alert acknowledgement
- workstation health status
- minimal offline cache

This plan assumes a PWA-first implementation unless a later hardware requirement forces a native Android app.

### 5. Communication Pattern

Use the simplest durable transport first.

- HTTPS APIs for sync and mutations
- WebSocket or SSE for live alert/status updates
- DB-backed outbox/inbox for guaranteed delivery

Do not introduce RabbitMQ, NATS, or Kafka on day one unless the scale or latency target proves that a simple outbox model is not enough.

### 6. Operational Principle

Keep the current Azure `/anpr` toolset working while the platform grows beside it.

That means:

- the current scanner is not the product architecture
- the current scanner is still part of the delivery strategy
- new portal, backend, workstation, and tablet work should be added without breaking the existing deployed flow

## Proposed Data Model

### Recommended Hitlist Entry Shape

Recommended core fields:

- `id`
- `plate_original`
- `plate_normalized`
- `country_or_region`
- `priority`
- `status`
- `reason_code`
- `reason_summary`
- `case_reference`
- `source_agency`
- `valid_from`
- `valid_until`
- `tags`
- `created_by`
- `created_at`
- `updated_at`
- `version`

Recommended optional fields:

- `vehicle_make`
- `vehicle_model`
- `vehicle_color`
- `vehicle_category`

Recommended encrypted fields:

- `owner_name`
- `owner_contact`
- `extended_case_notes`
- any identity-linked or case-sensitive narrative data

Recommended rule:

- matching and sync should depend only on normalized plate and operational metadata
- sensitive investigative details should stay out of the hot matching path

At minimum, the central backend will need these entities:

- `users`
- `roles`
- `workstations`
- `tablets`
- `device_pairings`
- `hitlists`
- `hitlist_entries`
- `hitlist_versions`
- `detections`
- `match_events`
- `evidence_snapshots`
- `telemetry_points`
- `sync_cursors`
- `outbox_jobs`
- `audit_logs`

The workstation local DB will need a smaller local mirror:

- `local_hitlist_entries`
- `pending_detections`
- `pending_match_events`
- `pending_snapshots`
- `telemetry_buffer`
- `device_health_snapshots`
- `sync_state`

## Security And Encryption Plan

The document calls for encryption of database attributes. That needs a practical rule set.

Recommended default:

- TLS for all network traffic
- disk encryption for workstation devices where possible
- field-level encryption for sensitive identity or case-linked attributes
- hashed or tokenized lookup strategy where exact search is needed
- strict secret separation for OCR keys, device tokens, and DB credentials

Do not encrypt every operational column blindly. That would make search, sync, and indexing harder without improving the right threat model.

## Delivery Plan

### Phase 0: Lock The Architecture ✅ COMPLETED

Goals:

- formalize the chosen defaults in this plan
- define exact offline requirements
- define evidence retention requirements
- define device lifecycle and pairing rules
- define the API contracts between central backend, workstation agent, and tablet

Deliverables:

- final architecture decision record based on the locked assumptions above
- API boundary map
- event taxonomy
- security requirements
- frontend migration decision for `fe/survilience`

### Phase 1: Backend Foundation ✅ COMPLETED

Build `apps/api` and central persistence.

Scope:

- auth and RBAC
- DB schema and migrations
- workstation/tablet registry
- hitlist versioning
- audit logging
- health and telemetry ingest endpoints
- sync contract definitions
- event ingestion for detections and match alerts
- Better Auth integration for central users

Exit criteria:

- admins can log in
- hitlists can be created and versioned
- devices can be registered
- APIs are stable enough for workstation integration

### Phase 2: Admin Portal And Central Dashboard ✅ COMPLETED

Extend `apps/web`.

Scope:

- migrate the reusable parts of `fe/survilience`
- login screens
- hitlist upload UI
- hitlist review and search
- workstation status dashboard
- central alert list
- device management UI

Concrete migration tasks:

- move `fe/survilience` page structure into route-based pages
- extract shared components from the Vite app
- remove hardcoded login and mock datasets
- replace placeholder images with real media states
- connect watchlist, alerts, analytics, and search to backend APIs
- keep the existing `/anpr` scanner routes intact during the migration
- add `/portal/*` route structure for the central application

Exit criteria:

- portal replaces the document's manual admin flow
- central operators can view device status and alerts
- the current scanner still works without regression

### Phase 3: Workstation Runtime ✅ COMPLETED

Build `apps/workstation-agent`.

Scope:

- camera adapter
- OCR adapter
- local DB
- hitlist downloader
- local matcher
- TTS
- health-check pipeline
- local event outbox
- workstation-to-tablet alert channel
- snapshot capture for all detection events

Exit criteria:

- workstation can initialize itself
- workstation can validate dependencies
- workstation can match detections against the local hitlist
- workstation can raise local alerts
- workstation can continue operating through internet loss
- workstation can persist snapshots for detection events according to retention policy

### Phase 4: Tablet App

Build `apps/tablet`.

Scope:

- workstation pairing
- alert feed
- acknowledgement actions
- health view
- reconnect handling

Exit criteria:

- tablet receives alerts from its paired workstation
- tablet can display status during a reconnect cycle

### Phase 5: Offline Sync And Reliability

Build durable sync behavior.

Scope:

- outbox pattern
- retry and backoff
- idempotent event uploads
- priority ordering
- hitlist snapshot recovery
- reconnect and cursor-based replay

Exit criteria:

- match events survive disconnects
- workstation uploads buffered data after recovery
- duplicate uploads do not corrupt central state
- workstation can restore state from the local DB after restart

### Phase 5.5: Central Queue And Live Tablet Delivery

Build the server-side fan-out so the central backend can push events to many connected tablets without a polling bottleneck.

Context:

The outbox pattern is already implemented on the workstation side. Workstations write locally first, then drain to apps/api via OutboxFlusher. What does not exist yet is the delivery path in the other direction: central backend reading from outbox_jobs and pushing to connected tablet sessions in real time. Without this, tablets would need to poll the API for alerts, which becomes a bottleneck when many tablets are connected simultaneously.

Scope:

- implement an outbox processor in apps/api that reads pending outbox_jobs from PostgreSQL
- use PostgreSQL LISTEN/NOTIFY to trigger the processor immediately when new jobs are inserted, with a polling fallback for reliability
- add a WebSocket or SSE endpoint in apps/api for tablet clients to maintain a persistent connection
- processor fans out relevant jobs to all connected tablet sessions matching the target device or broadcast scope
- failed deliveries are retried with backoff; undeliverable jobs are marked as dead-lettered after a configurable threshold
- tablet client reconnect handling: on reconnect, tablet replays any missed events since its last acknowledged cursor

Exit criteria:

- central backend can push alerts to all connected tablets without tablets polling
- a spike of many tablets connecting simultaneously does not degrade API response times for workstation ingest
- alerts survive a tablet disconnect and are delivered on reconnect
- no external message broker required at this scale

Upgrade path:

If event volume or connection count grows beyond what PostgreSQL LISTEN/NOTIFY can handle comfortably, this layer can be replaced with NATS or Redis Pub/Sub without changing the tablet client contract or the workstation outbox behavior. The interface boundary is the SSE/WebSocket endpoint, not the internal delivery mechanism.

### Phase 6: Security, Observability, And Hardening

Scope:

- encryption implementation
- secrets handling
- audit coverage
- structured logs
- metrics
- alerting
- backup and restore

Exit criteria:

- platform is supportable in production
- security posture is documented and testable

### Phase 7: Pilot Rollout

Scope:

- shadow mode deployment
- device acceptance checklist
- field validation
- rollback path
- operator training

Exit criteria:

- pilot can run without replacing the current working ANPR baseline
- failures can be isolated without taking down the current scanner

## No-Break Strategy For Current Production

This is the rule set I recommend for implementation:

- do not replace the current `/anpr` scanner flows first
- do not remove the current Azure deployment path
- treat the existing upload and live scan features as a working reference system
- build new backend and workstation flows as new services or new routes
- gate new behavior behind explicit environment flags
- keep migrations backward-safe until the platform is stable

## Recommended Repo Evolution

Suggested future structure:

- `apps/web` for admin portal, central dashboard, and existing scanner tools
- `apps/api` for central backend APIs
- `apps/ws-server` for live push channels if still needed
- `apps/workstation-agent` for field runtime
- `apps/tablet` for tablet UI
- `packages/shared-types` for event contracts
- `packages/db` for schema and migration helpers

Short-term note:

- `fe/survilience` should be treated as a source frontend to merge, not as a permanent parallel app unless you explicitly want a separate deployment.

## Suggested Build Order

If I were executing this plan from the current repo, I would build in this order:

1. create `apps/api` with PostgreSQL, Better Auth, hitlists, and device registry
2. migrate `fe/survilience` into `apps/web` under `/portal/*`
3. wire watchlist, alerts, dashboard, and search to real APIs
4. build `apps/workstation-agent` with SQLite, local OCR, and local matching
5. build `apps/tablet` as a PWA for alert delivery and acknowledgements
6. add durable sync and offline recovery
7. harden security, observability, and rollout controls

## Open Questions For You

The major stack choices are now locked in the plan. The remaining questions are narrow product details:

1. Are the recommended hitlist fields enough, or do you need any government-specific identifiers added?
2. Is the proposed v1 alert lifecycle enough, or do you need formal assignment and dispatch tracking in the first release?
3. Azure is the current default target; if that changes later, should the first design still optimize for easy migration to on-prem?

## Immediate Next Step

Treat this plan as the default execution path unless you want to override one of the locked assumptions.

Once the remaining product details above are answered, the next concrete artifact should be an architecture decision record plus the initial schema and service boundaries for:

- central backend
- workstation agent
- tablet app
- hitlist sync
- alert event model
