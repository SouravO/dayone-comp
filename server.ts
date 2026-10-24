import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  VotingEvent,
  Contestant,
  Vote,
  Participant,
  ContestantSummary,
  AdminReport,
  VoterEventState,
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Plain in-memory events store (zero mock data)
const eventsStore = new Map<string, VotingEvent>();

// Active WebSocket connections mapped by eventId
const eventSockets = new Map<string, Set<WebSocket>>();

// WebSocket Server attached on path '/ws' to avoid collision with Vite
const wss = new WebSocketServer({ server, path: '/ws' });

// Helper to determine the true unauthenticated public URL for sharing
function getPublicAppUrl(req?: Request): string {
  let base = process.env.APP_URL || '';
  if (req) {
    const host = req.get('host') || '';
    const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    base = `${proto}://${host}`;
  }
  // Convert Google Cloud Run dev IAP domain to public preview domain if present
  if (base.includes('ais-dev-')) {
    return base.replace('ais-dev-', 'ais-pre-');
  }
  return base;
}

// Build voter state
function buildVoterState(event: VotingEvent): VoterEventState {
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

// Broadcast real-time state update to all WebSocket clients in an event
function broadcastWebSocket(eventId: string) {
  const event = eventsStore.get(eventId);
  if (!event) return;

  const sockets = eventSockets.get(eventId);
  if (!sockets || sockets.size === 0) return;

  const voterState = buildVoterState(event);
  const message = JSON.stringify({
    type: 'STATE_UPDATE',
    eventId,
    data: voterState,
  });

  for (const client of sockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        sockets.delete(client);
      }
    }
  }
}

// WebSocket Connection Handling
wss.on('connection', (ws: WebSocket, req) => {
  let subscribedEventId: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'SUBSCRIBE') {
        const { eventId } = msg;
        if (eventId) {
          subscribedEventId = eventId;
          if (!eventSockets.has(eventId)) {
            eventSockets.set(eventId, new Set());
          }
          eventSockets.get(eventId)!.add(ws);

          // Send immediate current state
          const event = eventsStore.get(eventId);
          if (event) {
            ws.send(JSON.stringify({
              type: 'STATE_UPDATE',
              eventId,
              data: buildVoterState(event),
            }));
          }
        }
      }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.warn('WS message error:', e);
    }
  });

  ws.on('close', () => {
    if (subscribedEventId && eventSockets.has(subscribedEventId)) {
      eventSockets.get(subscribedEventId)!.delete(ws);
    }
  });
});

// Helper: build admin report
function buildAdminReport(event: VotingEvent): AdminReport {
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

// ----------------- REST API -----------------

// Config route to return the public preview URL (unauthenticated by Google)
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    publicBaseUrl: getPublicAppUrl(req),
  });
});

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (password === 'dayone' || password === 'admin' || password === 'admin123') {
    res.json({ success: true, token: 'admin_' + Date.now() });
  } else {
    res.status(401).json({ error: 'Incorrect password. (Use: dayone)' });
  }
});

// List all events
app.get('/api/events', (_req: Request, res: Response) => {
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
app.post('/api/events', (req: Request, res: Response) => {
  const { title, criteria, contestants } = req.body;

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
  res.status(201).json(newEvent);
});

// Admin publishes the event
app.post('/api/events/:id/publish', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  event.status = 'published';
  broadcastWebSocket(event.id);

  const publicLink = `${getPublicAppUrl(req)}/?event=${event.id}&view=vote`;
  res.json({ success: true, event, publicLink });
});

// Admin deletes an event completely
app.delete('/api/events/:id', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  eventsStore.delete(req.params.id);
  const sockets = eventSockets.get(req.params.id);
  if (sockets) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'EVENT_DELETED',
          eventId: req.params.id,
        }));
      }
    }
    eventSockets.delete(req.params.id);
  }

  res.json({ success: true, message: 'Event successfully deleted' });
});

// Admin controls: select contestant, start vote, end vote, advance
app.post('/api/events/:id/control', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { action, contestantId, participantId } = req.body;

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

  broadcastWebSocket(event.id);
  res.json({ success: true, event: buildVoterState(event) });
});

// Admin gets full report
app.get('/api/events/:id/report', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.json(buildAdminReport(event));
});

// Voter: get public live state
app.get('/api/events/:id/public', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }
  res.json(buildVoterState(event));
});

// Voter enters name (unique name check per event)
app.post('/api/events/:id/join', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { name, existingParticipantId } = req.body;

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
  broadcastWebSocket(event.id);

  res.status(201).json({ participant, userVotes: [] });
});

// Voter submits 1 to 5 stars for active contestant
app.post('/api/events/:id/vote', (req: Request, res: Response) => {
  const event = eventsStore.get(req.params.id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const { contestantId, participantId, participantName, stars } = req.body;

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
  broadcastWebSocket(event.id);

  res.status(201).json({ success: true, vote: newVote });
});

// Start HTTP + WebSocket server
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Day One Voting server with WebSockets running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
