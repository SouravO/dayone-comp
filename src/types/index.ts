export interface Contestant {
  id: string;
  name: string;
  order: number;
  bio?: string;
}

export interface ContestantCardInfo {
  id: string;
  name: string;
  order: number;
  voteCount: number;
}

export interface Vote {
  id: string;
  contestantId: string;
  participantId: string;
  participantName: string;
  stars: number; // 1 to 5 stars
  timestamp: number;
}

export interface Participant {
  id: string;
  name: string;
  joinedAt: number;
}

export type EventStatus = 'draft' | 'published' | 'completed';
export type VotingStatus = 'idle' | 'voting_active' | 'voting_ended';

export interface VotingEvent {
  id: string;
  title: string;
  criteria: string; // e.g. "Humor, Punchlines & Stage Presence"
  organization: string; // "Day One Standup Comedy"
  status: EventStatus;
  activeContestantId: string | null;
  votingStatus: VotingStatus;
  contestants: Contestant[];
  participants: Participant[];
  votes: Vote[];
  createdAt: number;
}

export interface ContestantSummary {
  contestantId: string;
  name: string;
  order: number;
  totalVotes: number;
  averageStars: number; // e.g. 4.6
  starCounts: Record<number, number>; // counts for 1..5
  rank: number;
}

export interface AdminReport {
  eventId: string;
  title: string;
  criteria: string;
  totalParticipants: number;
  totalVotes: number;
  summaries: ContestantSummary[];
  voterMatrix: {
    participantName: string;
    ratings: Record<string, number>; // contestantId -> stars
  }[];
}

export interface ParticipantInfo {
  id: string;
  name: string;
  joinedAt: number;
  votesCount: number;
}

export interface VoterEventState {
  id: string;
  title: string;
  criteria: string;
  organization: string;
  status: EventStatus;
  activeContestantId: string | null;
  activeContestant: Contestant | null;
  activeContestantIndex: number;
  totalContestants: number;
  votingStatus: VotingStatus;
  totalParticipants: number;
  currentContestantVotesCount: number;
  contestantsList?: ContestantCardInfo[];
  participantsList?: ParticipantInfo[];
}
