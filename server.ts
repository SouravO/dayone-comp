import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import {
  app,
  eventsStore,
  buildVoterState,
  setWebSocketBroadcaster,
} from './src/server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Active WebSocket connections mapped by eventId
const eventSockets = new Map<string, Set<WebSocket>>();

// WebSocket Server attached on path '/ws' to avoid collision with Vite
const wss = new WebSocketServer({ server, path: '/ws' });

// Broadcaster function for WebSocket clients
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

// Connect the Express app's updates to WebSocket broadcast
setWebSocketBroadcaster(broadcastWebSocket);

// WebSocket Connection Handling
wss.on('connection', (ws: WebSocket) => {
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
            ws.send(
              JSON.stringify({
                type: 'STATE_UPDATE',
                eventId,
                data: buildVoterState(event),
              })
            );
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
    console.log(`Day One Voting server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
