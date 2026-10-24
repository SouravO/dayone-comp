import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  VotingEvent,
  Contestant,
  Vote,
  Participant,
  ContestantSummary,
  AdminReport,
  VoterEventState,
} from '../types/index.ts';

const app = express();
app.use(express.json());

// Normalize URL middleware for Vercel serverless rewrites and local Express
app.use((req: Request, _res: Response, next: NextFunction) => {
  // If Vercel rewrote the path and placed the original in req.originalUrl
  const original = req.originalUrl || req.url;
  if ((req.url === '/api' || req.url === '/' || req.url === '') && original && original !== '/' && original !== '/api') {
    req.url = original;
  }
  next();
});

// Storage path: in Vercel /tmp is the only writable directory; locally use /tmp or .data
const STORAGE_DIR = process.env.VERCEL || process.env.NODE_ENV === 'production'
  ? '/tmp'
  : (fs.existsSync('/tmp') ? '/tmp' : path.join(process.cwd(), '.data'));
const STORAGE_FILE = path.join(STORAGE_DIR, 'dayone_events_store.json');

// Plain in-memory events store with disk persistence
export const eventsStore = new Map<string, VotingEvent>();

function loadPersistedEvents() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const ev of data) {
          if (ev && ev.id) {
            eventsStore.set(ev.id, ev);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not load persisted events from storage:', err);
  }
}

// Load persisted events on startup
loadPersistedEvents();

function persistEvents() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    const data = Array.from(eventsStore.values());
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist events to disk:', err);
  }
}

// WebSocket broadcaster hook
type Broadcaster = (eventId: string) => void;
let wsBroadcaster: Broadcaster | null = null;

export function setWebSocketBroadcaster(broadcaster: Broadcaster | null) {
  wsBroadcaster = broadcaster;
}

export function broadcastUpdate(eventId: string) {
  persistEvents();
  if (wsBroadcaster) {
    try {
      wsBroadcaster(eventId);
    } catch (e) {
      console.warn('WebSocket broadcast error:', e);
    }
  }
}

// Helper to determine the public app URL
export function getPublicAppUrl(req?: Request): string {
  let base = process.env.APP_URL || '';
  if (req) {
    const host = req.get('host') || '';
    const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    base = `${proto}://${host}`;
  }
  if (base.includes('ais-dev-')) {
    return base.replace('ais-dev-', 'ais-pre-');
  }
  return base;
}

// Build voter event state
export function buildVoterState(event: VotingEvent): VoterEventState {
  const activeContestant = event.contestants.find((c) => c.id === event.activeContestantId) || null;
  const activeContestantIndex = activeContestant
    ? event.contestants.findIndex((c) => c.id === activeContestant.id) + 1
    : 0;

  const currentVotesCount = activeContestant
    ? event.votes.filter((v) => v.contestantId === activeContestant.id).length
    : 0;

  return {
    id: event.id,
    title: event.title,
    criteria: event.criteria,
    organization: event.organization,
    status: event.status,
    activeContestantId: event.activeContestantId,
    activeContestant,
    activeContestantIndex,
    totalContestants: event.contestants.length,
    votingStatus: event.votingStatus,
    totalParticipants: event.participants.length,
    currentContestantVotesCount: currentVotesCount,
    contestantsList: event.contestants.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      voteCount: event.votes.filter((v) => v.contestantId === c.id).length,
    })),
    participantsList: event.participants.map((p) => ({
      id: p.id,
      name: p.name,
      joinedAt: p.joinedAt,
      votesCount: event.votes.filter((v) => v.participantId === p.id).length,
    })),
  };
}

// Helper to build admin report
export function buildAdminReport(event: VotingEvent): AdminReport {
  const summaries: ContestantSummary[] = event.contestants.map((c) => {
    const cVotes = event.votes.filter((v) => v.contestantId === c.id);
    const totalVotes = cVotes.length;
    const sum = cVotes.reduce((acc, v) => acc + v.stars, 0);
    const averageStars = totalVotes > 0 ? parseFloat((sum / totalVotes).toFixed(2)) : 0;

    const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    cVotes.forEach((v) => {
      starCounts[v.stars] = (starCounts[v.stars] || 0) + 1;
    });

    return {
      contestantId: c.id,
      name: c.name,
      order: c.order,
      totalVotes,
      averageStars,
      starCounts,
      rank: 0,
    };
  });

  summaries.sort((a, b) => {
    if (b.averageStars !== a.averageStars) return b.averageStars - a.averageStars;
    return b.totalVotes - a.totalVotes;
  });

  summaries.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  const voterMatrix = event.participants.map((p) => {
    const ratings: Record<string, number> = {};
    event.votes
      .filter((v) => v.participantId === p.id)
      .forEach((v) => {
        ratings[v.contestantId] = v.stars;
      });
    return {
      participantName: p.name,
      ratings,
    };
  });

  return {
    eventId: event.id,
    title: event.title,
    criteria: event.criteria,
    totalParticipants: event.participants.length,
    totalVotes: event.votes.length,
    summaries,
    voterMatrix,
  };
}

// Router containing all API endpoints
const router = express.Router();

// Config route to return public base URL
router.get('/config', (req: Request, res: Response) => {
  res.json({
    publicBaseUrl: getPublicAppUrl(req),
  });
});

// Admin Login: accepts 'dayone', 'admin', or 'admin123'
router.post('/admin/login', (req: Request, res: Response) => {
  const { password } = req.body || {};
  if (password === 'dayone' || password === 'admin' || password === 'admin123') {
    res.json({ success: true, token: 'admin_' + Date.now() });
  } else {
    res.status(401).json({ error: 'Incorrect password. (Default: dayone or admin)' });
  }
});

// List all events
router.get('/events', (_req: Request, res: Response) => {
  const list = Array.from(eventsStore.values()).map((e) => ({
    id: e.id,
    title: e.title,
    criteria: e.criteria,
    status: e.status,
    contestantsCount: e.contestants.length,
    participantsCount: e.participants.length,
    votesCount: e.votes.length,
  }));
  res.json(list);
});

// Admin creates a new voting event (plain, no mock data)
router.post('/events', (req: Request, res: Response) => {
  const { title, criteria, contestants } = req.body || {};

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Competition title is required' });
    return;
  }

  const validNames = Array.isArray(contestants)
    ? contestants
        .map((c: any) => (typeof c === 'string' ? c.trim() : c?.name?.trim() || ''))
        .filter((n: string) => n.length > 0)
    : [];

  if (validNames.length === 0) {
    res.status(400).json({ error: 'Please specify at least one contestant name' });
    return;
  }

  const id = 'dayone_' + crypto.randomUUID().slice(0, 8);
  const formattedContestants: Contestant[] = validNames.map((name: string, index: number) => ({
    id: 'c_' + (index + 1),
    name,
    order: index + 1,
  }));

  const newEvent: VotingEvent = {
    id,
    title: title.trim(),
    criteria: criteria?.trim() || 'Performance',
    organization: 'Day One Standup Comedy',
    status: 'draft',
    activeContestantId: formattedContestants[0]?.id || null,
    votingStatus: 'idle',
    contestants: formattedContestants,
    participants: [],
    votes: [],
    createdAt: Date.now(),
  };

  eventsStore.set(id, newEvent);
  broadcastUpdate(id);
  res.status(201).json(newEvent);
});

// Admin publishes the event
router.post('/events/:id/publish', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  event.status = 'published';
  broadcastUpdate(event.id);

  const publicLink = `${getPublicAppUrl(req)}/?event=${event.id}&view=vote`;
  res.json({ success: true, event, publicLink });
});

// Admin deletes an event completely
router.delete('/events/:id', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  eventsStore.delete(req.params.id);
  broadcastUpdate(req.params.id);

  res.json({ success: true, message: 'Event successfully deleted' });
});

// Admin controls: select contestant, start/stop vote, add/delete contestant, delete voter
router.post('/events/:id/control', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { action, contestantId, participantId } = req.body || {};

  switch (action) {
    case 'delete_participant':
      if (participantId) {
        event.participants = event.participants.filter((p) => p.id !== participantId);
        event.votes = event.votes.filter((v) => v.participantId !== participantId);
      }
      break;

    case 'start_contestant_voting':
      if (contestantId && event.contestants.some((c) => c.id === contestantId)) {
        event.activeContestantId = contestantId;
        event.votingStatus = 'voting_active';
      }
      break;

    case 'stop_contestant_voting':
      if (!contestantId || event.activeContestantId === contestantId) {
        event.votingStatus = 'voting_ended';
      }
      break;

    case 'add_contestant': {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (name) {
        const newContestant: Contestant = {
          id: 'c_' + crypto.randomUUID().slice(0, 6),
          name,
          order: event.contestants.length + 1,
        };
        event.contestants.push(newContestant);
        if (!event.activeContestantId) {
          event.activeContestantId = newContestant.id;
        }
      }
      break;
    }

    case 'delete_contestant':
      if (contestantId) {
        event.contestants = event.contestants.filter((c) => c.id !== contestantId);
        event.votes = event.votes.filter((v) => v.contestantId !== contestantId);
        if (event.activeContestantId === contestantId) {
          event.activeContestantId = event.contestants[0]?.id || null;
          event.votingStatus = 'idle';
        }
        event.contestants.forEach((c, idx) => {
          c.order = idx + 1;
        });
      }
      break;

    case 'select_contestant':
      if (contestantId && event.contestants.some((c) => c.id === contestantId)) {
        event.activeContestantId = contestantId;
        event.votingStatus = 'idle';
      }
      break;

    case 'start_voting':
      if (event.activeContestantId) {
        event.votingStatus = 'voting_active';
      }
      break;

    case 'end_voting':
      event.votingStatus = 'voting_ended';
      break;

    case 'next_contestant': {
      const currIdx = event.contestants.findIndex((c) => c.id === event.activeContestantId);
      if (currIdx < event.contestants.length - 1) {
        event.activeContestantId = event.contestants[currIdx + 1].id;
        event.votingStatus = 'idle';
      }
      break;
    }

    case 'complete_event':
      event.status = 'completed';
      event.votingStatus = 'voting_ended';
      break;

    default:
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
  }

  broadcastUpdate(event.id);
  res.json({ success: true, event: buildVoterState(event) });
});

// Admin gets full report
router.get('/events/:id/report', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.json(buildAdminReport(event));
});

// Voter: get public live state
router.get('/events/:id/public', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.json(buildVoterState(event));
});

// Voter enters name (unique name check per event)
router.post('/events/:id/join', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { name, existingParticipantId } = req.body || {};

  // If returning with existing participant ID
  if (existingParticipantId) {
    const existing = event.participants.find((p) => p.id === existingParticipantId);
    if (existing) {
      const userVotes = event.votes
        .filter((v) => v.participantId === existing.id)
        .map((v) => ({ contestantId: v.contestantId, stars: v.stars }));
      res.json({ participant: existing, userVotes });
      return;
    }
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Please enter your name to vote.' });
    return;
  }

  const cleanName = name.trim().slice(0, 40);

  // Enforce unique name: check if someone else is already registered with this exact name
  const nameCollision = event.participants.find(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (nameCollision) {
    res.status(409).json({
      error: `The name "${cleanName}" is already taken by another voter. Please enter a unique name or add an initial (e.g. ${cleanName} S.).`,
    });
    return;
  }

  const participantId = 'usr_' + crypto.randomUUID().slice(0, 8);
  const participant: Participant = {
    id: participantId,
    name: cleanName,
    joinedAt: Date.now(),
  };

  event.participants.push(participant);
  broadcastUpdate(event.id);

  res.status(201).json({ participant, userVotes: [] });
});

// Voter submits 1 to 5 stars for active contestant
router.post('/events/:id/vote', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { contestantId, participantId, participantName, stars } = req.body || {};

  // 1. Verify voting is active
  if (event.votingStatus !== 'voting_active') {
    res.status(403).json({ error: 'Voting is currently closed for this contestant.' });
    return;
  }

  // 2. Verify active contestant
  if (event.activeContestantId !== contestantId) {
    res.status(400).json({ error: 'Votes are only accepted for the contestant currently on stage.' });
    return;
  }

  // 3. Validate 1 to 5 stars
  const numStars = parseInt(stars, 10);
  if (isNaN(numStars) || numStars < 1 || numStars > 5) {
    res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    return;
  }

  // 4. Validate participant
  if (!participantId) {
    res.status(400).json({ error: 'Voter identification required.' });
    return;
  }

  // 5. Check duplicate vote
  const alreadyVoted = event.votes.find(
    (v) => v.contestantId === contestantId && v.participantId === participantId
  );
  if (alreadyVoted) {
    res.status(409).json({ error: 'You have already voted for this contestant.' });
    return;
  }

  // 6. Record vote
  const newVote: Vote = {
    id: 'v_' + crypto.randomUUID().slice(0, 8),
    contestantId,
    participantId,
    participantName: participantName || 'Anonymous Voter',
    stars: numStars,
    timestamp: Date.now(),
  };

  event.votes.push(newVote);
  broadcastUpdate(event.id);

  res.status(201).json({ success: true, vote: newVote });
});

// Mount router on both '/api' and '/' to ensure zero 404s under any rewrite or path-stripping behavior
app.use('/api', router);
app.use('/', router);

export { app };
export default app;
