# SpotlightLive — Synchronized Live Audience Voting & Competition Platform

A synchronized live audience voting and competition management platform designed for stand-up comedy events, open-mic showcases, talent shows, and collegiate competitions. The organizer controls which contestant is currently performing and open for voting, locking submissions between performances, streaming live participation, and revealing podium rankings upon conclusion.

> [!IMPORTANT]
> **Confirmed Choices from Phase 1 Clarifications:**
> - **Scoring System**: 1 to 10 rating scale where highest average score determines rank.
> - **Results Reveal**: Final rankings, podium reveal, and detailed comparisons are revealed only after the organizer officially ends the competition.
> - **Visual Theme**: Dark neon comedy club and stage spotlight aesthetic (`#0A0B10` obsidian stage backdrop, warm amber/gold spotlight accents `#F59E0B`, crisp neon highlights, and high-contrast touch targets).
> - **Identity & Integrity**: Audience joins via QR code or event PIN, enters name once, receives a unique cryptographic participant session token stored in client storage, guaranteeing strictly one vote per contestant per registered identity.

---

## 1. Overview & Core Concept

SpotlightLive bridges stage performers, the event organizer, and live audience members through three synchronized real-time views:
1. **Audience Mobile Web Client**: Fast, zero-install mobile web app accessed instantly via QR code scan or event link. Audience members enter their name once and are automatically locked to whichever contestant the organizer has active on stage.
2. **Organizer Control Room**: A command center allowing event hosts to create competitions, manage contestant line-ups and performance orders, start/pause/lock voting, advance to the next contestant, monitor audience participation in real time, and end the event.
3. **Stage Display / Venue Projector View**: A dedicated high-impact display optimized for the venue's projector or TV screen, showing the event QR code, active contestant spotlight, live voting countdowns/status, and the grand post-event podium reveal.
4. **Final Comprehensive Report & Export**: Post-event analytics including average scores, total votes cast, participation rate, score distribution, and one-click CSV export.

---

## 2. User Experience & Visual Design

### Aesthetic Direction & Visual Identity
- **Atmosphere**: Authentic stand-up comedy club & live theater vibe. Deep obsidian background (`#0A0B10` and `#121520`) with warm spotlight radiance, amber glow (`#F59E0B`), warm white typography, and gold podium accolades.
- **Typography**: Clean display typography (`Outfit` / `Plus Jakarta Sans`) paired with tabular figures (`font-mono tabular-nums`) for ratings, timers, and voter counts.
- **Zero-Pill Restraint**: Metadata (performance order, category, duration, timestamps) displayed with unboxed typographic separators (`·` and `/`), avoiding candy pill clutter.
- **Ergonomic Thumb Targets**: Large, tactile rating numbers (1 through 10) in a 2-row or grid touch-optimized keypad (minimum $48 \times 48\text{px}$ touch hitbox) designed for effortless one-thumb voting under dark venue lighting.

### Key User Flows

```
[ Audience Scan Flow ]
Venue Screen QR Code ──> Mobile Web App ──> Enter Name (e.g. "Rahul") ──> Instant Live Sync
                                                                               │
[ Live Performance Flow ]                                                      ▼
Organizer clicks "Open Voting" ──> Audience screen unlocks ──> Rahul taps 8/10 ──> "Vote Recorded"
Organizer clicks "Next Contestant" ──> Screen syncs to Contestant 2 ───────────────┘
                                                                               │
[ Grand Reveal Flow ]                                                          ▼
Organizer clicks "End Competition" ──> Venue Projector & Audience screens reveal 1st/2nd/3rd Podium
```

- **Audience Screen States**:
  - *Lobby / Standby*: "Waiting for the show to begin" with event details and participant welcome.
  - *Active Voting*: Contestant photo/name, bio/topic, performance #, large 1–10 rating selector with instant visual selection and sticky "Submit Rating" button.
  - *Voted / Locked*: Tactile confirmation badge ("Rating 8/10 recorded for Contestant A · Waiting for next performer").
  - *Intermission / Paused*: Friendly stage indicator when the organizer pauses between acts.
  - *Final Podium*: Interactive rankings card showing the winner and podium standings once unveiled.
- **Organizer Control Room**:
  - *Setup*: Add event title, date, venue, contestant roster (with photos/avatars, bios, performance order).
  - *Live Board*: Active contestant card with large "Open Voting", "Lock Voting", and "Next Contestant" primary actions.
  - *Real-Time Telemetry*: Total registered audience, votes received for current contestant, submission progress percentage.
  - *Contestant Queue*: Reorder, preview past contestant averages (hidden from audience until reveal), and jump to specific performers if schedule shifts.
- **Stage Projector View**:
  - Toggleable full-screen mode for the venue stage screen with high-contrast QR code for audience onboarding, active contestant spotlight, and grand celebration animation for top 3 winners.

---

## 3. Key Product Decisions & Trade-Offs

- **Real-Time Synchronization Mechanism**:
  - *Approach*: Server-authoritative WebSocket / Server-Sent Events (SSE) combined with REST submission endpoints over Node.js Express server.
  - *Why*: Provides sub-100ms synchronization across all audience devices when the organizer advances contestants, eliminating manual browser refreshes.
- **Identity & Vote Integrity**:
  - *Approach*: Client generates a persistent UUID session token paired with the user's entered name and stores it in `localStorage`. The server validates that a given `(eventId, contestantId, participantId)` tuple can only submit once.
  - *Why*: Eliminates friction (no passwords or app downloads) while strictly preventing multiple votes from the same device/browser session.
- **Contestant Progression**:
  - *Approach*: Manual organizer progression with optional voting countdown timer. The organizer retains full authority over stage pacing.
- **Score Secrecy**:
  - *Approach*: Live averages and rankings are computed on the server and withheld from audience endpoints until the organizer triggers "End Competition & Reveal Results". The organizer has an optional "Director Peek" toggle in their private dashboard.

---

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SpotlightLive Server                            │
│                  (Node.js / Express + WebSocket/SSE)                   │
├────────────────────────────────────────────────────────────────────────┤
│  • Competition State Store (In-memory + File/Persistent Fallback)      │
│  • Real-Time Event Hub (State broadcast to all connected clients)      │
│  • Vote Validation Engine (One vote per participant per contestant)    │
│  • Reporting & Analytics Engine (Averages, Medians, Rankings, CSV)     │
└───────▲────────────────────────▲──────────────────────────────▲────────┘
        │                        │                              │
        │ WebSocket/SSE          │ REST + WS                    │ WebSocket/SSE
        ▼                        ▼                              ▼
┌──────────────────┐  ┌────────────────────────┐  ┌──────────────────────┐
│  Audience Phone  │  │ Organizer Control Room │  │ Venue Stage Projector│
│  (Mobile Touch)  │  │  (Desktop / Tablet)    │  │  (Big Screen View)   │
└──────────────────┘  └────────────────────────┘  └──────────────────────┘
```

### Data Schema
- **Event**: `id`, `title`, `venue`, `date`, `status` (`draft` | `live` | `completed`), `activeContestantId`, `votingState` (`open` | `locked`), `isResultsRevealed`.
- **Contestant**: `id`, `eventId`, `name`, `order`, `bio`, `tagline`, `avatarUrl`.
- **Participant**: `id` (UUID), `eventId`, `name`, `joinedAt`, `deviceInfo`.
- **Vote**: `id`, `eventId`, `contestantId`, `participantId`, `participantName`, `score` (1–10), `timestamp`.

### API & Socket Events
- `GET /api/events/:id`: Load event metadata and public state.
- `POST /api/events/:id/join`: Register participant name and issue session token.
- `POST /api/events/:id/vote`: Submit validated score for active contestant.
- `POST /api/events/:id/control`: Organizer controls (`set_active_contestant`, `toggle_voting`, `end_event`, `reveal_results`).
- `GET /api/events/:id/report`: Full rankings, analytics, and CSV download.
- Real-time channel: Broadcasts `state_updated`, `contestant_changed`, `voting_status_changed`, and `results_revealed`.
