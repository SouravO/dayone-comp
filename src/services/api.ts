import { useState, useEffect, useRef, useCallback } from 'react';
import { VoterEventState, AdminReport, VotingEvent } from '../types/index.ts';

const API_BASE = '/api';

export async function fetchPublicConfig(): Promise<{ publicBaseUrl: string }> {
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (res.ok) return res.json();
  } catch (e) {
    console.warn('Config fetch failed', e);
  }
  return { publicBaseUrl: '' };
}

export async function adminLogin(password: string): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function fetchEvents(): Promise<{ id: string; title: string; criteria: string; status: string; contestantsCount: number; participantsCount: number; votesCount: number }[]> {
  const res = await fetch(`${API_BASE}/events`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

export async function createVotingEvent(data: { title: string; criteria: string; contestants: string[] }): Promise<VotingEvent> {
  const res = await fetch(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create event');
  }
  return res.json();
}

export async function publishEvent(eventId: string): Promise<{ success: boolean; publicLink?: string }> {
  const res = await fetch(`${API_BASE}/events/${eventId}/publish`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to publish event');
  return res.json();
}

export async function deleteVotingEvent(eventId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/events/${eventId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete event');
  }
  return res.json();
}

export async function controlVoting(eventId: string, action: string, contestantId?: string, extra?: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_BASE}/events/${eventId}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, contestantId, ...extra }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Action failed');
  }
  return res.json();
}

export async function fetchPublicEvent(eventId: string): Promise<VoterEventState> {
  const res = await fetch(`${API_BASE}/events/${eventId}/public`);
  if (!res.ok) throw new Error('Failed to load event');
  return res.json();
}

export async function registerVoter(eventId: string, name: string, existingParticipantId?: string): Promise<{ participant: { id: string; name: string }; userVotes: { contestantId: string; stars: number }[] }> {
  const res = await fetch(`${API_BASE}/events/${eventId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, existingParticipantId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to enter voting room');
  }
  return res.json();
}

export async function submitVoterRating(eventId: string, data: { contestantId: string; participantId: string; participantName: string; stars: number }): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/events/${eventId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to record vote');
  }
  return res.json();
}

export async function fetchAdminReport(eventId: string): Promise<AdminReport> {
  const res = await fetch(`${API_BASE}/events/${eventId}/report`);
  if (!res.ok) throw new Error('Failed to load report');
  return res.json();
}

// WebSocket real-time synchronization hook
export function useLiveVoterEvent(eventId: string) {
  const [state, setState] = useState<VoterEventState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await fetchPublicEvent(eventId);
      setState(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      setState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchInitial();

    // Establish WebSocket connection
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      // Subscribe to this event's real-time stream
      socket.send(JSON.stringify({ type: 'SUBSCRIBE', eventId }));
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE_UPDATE' && msg.data) {
          setState(msg.data);
          setLoading(false);
        }
      } catch (e) {
        console.warn('WS parse error', e);
      }
    };

    socket.onerror = (e) => {
      console.warn('WS error', e);
    };

    // Reconnection handling
    socket.onclose = () => {
      // Fallback: poll once after close if needed
    };

    // Heartbeat ping
    const interval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);

    return () => {
      clearInterval(interval);
      socket.close();
      wsRef.current = null;
    };
  }, [eventId, fetchInitial]);

  return { state, loading, error, refresh: fetchInitial };
}
