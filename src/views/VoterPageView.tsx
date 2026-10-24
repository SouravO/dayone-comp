import React, { useState, useEffect } from 'react';
import { VoterEventState } from '../types/index.ts';
import { registerVoter, submitVoterRating } from '../services/api.ts';
import { Star, CheckCircle, Clock, Mic2, AlertCircle, Sparkles } from 'lucide-react';

interface VoterPageViewProps {
  state: VoterEventState | null;
  loading: boolean;
  error: string | null;
}

export const VoterPageView: React.FC<VoterPageViewProps> = ({
  state,
  loading,
  error,
}) => {
  const [voterName, setVoterName] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Star rating (1 to 5)
  const [selectedStars, setSelectedStars] = useState<number>(0);
  const [hoveredStars, setHoveredStars] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [submittedVotes, setSubmittedVotes] = useState<Record<string, number>>({});

  const eventId = state?.id;

  // Restore participant session from localStorage
  useEffect(() => {
    if (!eventId) return;
    try {
      const stored = localStorage.getItem(`dayone_voter_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.id && parsed.name) {
          setParticipantId(parsed.id);
          setVoterName(parsed.name);
          setHasEnteredName(true);
          registerVoter(eventId, parsed.name, parsed.id)
            .then((res) => {
              const map: Record<string, number> = {};
              res.userVotes?.forEach((v) => {
                map[v.contestantId] = v.stars;
              });
              setSubmittedVotes(map);
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Storage read failed', e);
    }
  }, [eventId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !voterName.trim()) return;

    setJoining(true);
    setJoinError(null);

    try {
      const res = await registerVoter(eventId, voterName.trim());
      setParticipantId(res.participant.id);
      setHasEnteredName(true);
      localStorage.setItem(
        `dayone_voter_${eventId}`,
        JSON.stringify({ id: res.participant.id, name: res.participant.name })
      );
    } catch (err: any) {
      setJoinError(err.message || 'Could not join voting room');
    } finally {
      setJoining(false);
    }
  };

  const handleVote = async () => {
    if (!eventId || !state?.activeContestantId || !participantId || selectedStars < 1) return;

    setSubmitting(true);
    setVoteError(null);

    try {
      await submitVoterRating(eventId, {
        contestantId: state.activeContestantId,
        participantId,
        participantName: voterName,
        stars: selectedStars,
      });

      setSubmittedVotes((prev) => ({
        ...prev,
        [state.activeContestantId!]: selectedStars,
      }));
      setSelectedStars(0);
    } catch (err: any) {
      setVoteError(err.message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  };

  const getStarLabel = (stars: number) => {
    switch (stars) {
      case 1:
        return '1 Star · Tough Crowd';
      case 2:
        return '2 Stars · Decent Set';
      case 3:
        return '3 Stars · Good Jokes';
      case 4:
        return '4 Stars · Great Punchlines';
      case 5:
        return '5 Stars · Comedy Masterpiece!';
      default:
        return 'Select 1 to 5 Stars';
    }
  };

  if (loading && !state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-10 h-10 border-2 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-sm">Connecting to Day One Live Stage...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-[#101014] border border-red-900/50 rounded-3xl text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
        <h3 className="text-base font-bold text-white">Event Unavailable</h3>
        <p className="text-xs text-neutral-400 mt-1">{error || 'Please check the link provided by the host.'}</p>
      </div>
    );
  }

  // STEP 1: Enter Name
  if (!hasEnteredName) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-[#101014] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-red-600/20 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-500 mb-3">
              <Mic2 size={24} />
            </div>
            <span className="text-xs font-mono uppercase tracking-widest text-red-500 font-bold">
              Day One Standup Comedy
            </span>
            <h2 className="text-2xl font-black font-display text-white mt-1">
              {state.title}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Criteria: <span className="text-neutral-200 font-semibold">{state.criteria}</span>
            </p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="name-input" className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Your Name
              </label>
              <input
                id="name-input"
                type="text"
                required
                placeholder="Enter your name"
                value={voterName}
                onChange={(e) => setVoterName(e.target.value)}
                maxLength={40}
                className="w-full px-4 py-3.5 bg-[#08080A] border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 text-sm font-medium"
              />
              <p className="text-[11px] text-neutral-500 mt-1.5">
                Enter your name once to cast live star votes during the show.
              </p>
            </div>

            {joinError && (
              <p className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-900/50">
                {joinError}
              </p>
            )}

            <button
              type="submit"
              disabled={joining || !voterName.trim()}
              className="w-full min-h-[48px] py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-red-700/30 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {joining ? 'Entering Room...' : 'Join Live Voting'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-neutral-800 text-center text-xs text-neutral-500">
            <span>Synchronized real-time voting · Day One Standup Comedy</span>
          </div>
        </div>
      </div>
    );
  }

  const activeContestant = state.activeContestant;
  const hasVotedForActive = activeContestant ? !!submittedVotes[activeContestant.id] : false;
  const userStarsForActive = activeContestant ? submittedVotes[activeContestant.id] : null;

  return (
    <div className="max-w-md mx-auto px-4 py-6 pb-20">
      {/* Voter Top Identity Header */}
      <div className="flex items-center justify-between bg-[#101014] border border-neutral-800 rounded-2xl px-4 py-2.5 mb-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-neutral-300">
            Voter: <strong className="text-white font-bold">{voterName}</strong>
          </span>
        </div>
        <div className="text-[11px] text-neutral-400 font-mono">
          {Object.keys(submittedVotes).length}/{state.totalContestants} Voted
        </div>
      </div>

      {/* Main Live Card */}
      {state.status === 'completed' ? (
        <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-8 text-center shadow-xl">
          <Sparkles className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-2xl font-bold font-display text-white">Event Completed</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-xs mx-auto">
            Thank you for participating! The Day One Standup Comedy competition has concluded.
          </p>
        </div>
      ) : activeContestant ? (
        <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
          {/* Active Contestant Info */}
          <div className="text-center pb-5 border-b border-neutral-800">
            <span className="text-[11px] font-mono uppercase tracking-widest text-red-500 font-bold">
              Now On Stage · Contestant {state.activeContestantIndex} of {state.totalContestants}
            </span>
            <h2 className="text-3xl font-black font-display text-white mt-1">
              {activeContestant.name}
            </h2>
            {activeContestant.bio && (
              <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                {activeContestant.bio}
              </p>
            )}

            {/* Voting Criteria Banner */}
            <div className="mt-3 inline-block px-3 py-1 bg-[#08080A] border border-neutral-800 rounded-xl text-xs text-neutral-300">
              Criteria: <strong className="text-white">{state.criteria}</strong>
            </div>
          </div>

          {/* Voting States */}
          <div className="pt-6">
            {hasVotedForActive ? (
              /* Already Voted for this contestant */
              <div className="py-6 px-4 bg-red-950/20 border border-red-600/30 rounded-2xl text-center">
                <CheckCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                <h4 className="text-base font-bold text-white">Vote Recorded!</h4>
                <div className="flex items-center justify-center gap-1.5 my-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={20}
                      className={s <= (userStarsForActive || 0) ? 'text-red-500 fill-red-500' : 'text-neutral-700'}
                    />
                  ))}
                </div>
                <p className="text-xs text-neutral-300 mt-1">
                  You rated {activeContestant.name} <strong>{userStarsForActive} out of 5 stars</strong>.
                </p>
                <p className="text-[11px] text-neutral-500 mt-3 pt-3 border-t border-neutral-800">
                  Your vote is locked. The next contestant will unlock when the host brings them on stage.
                </p>
              </div>
            ) : state.votingStatus === 'idle' ? (
              /* Admin has NOT started vote yet */
              <div className="py-8 px-4 bg-[#08080A] border border-neutral-800 rounded-2xl text-center">
                <Clock className="w-10 h-10 text-neutral-500 mx-auto mb-2 animate-spin duration-3000" />
                <h4 className="text-base font-semibold text-neutral-200">Waiting for Admin</h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                  Watch {activeContestant.name}'s performance! The host will open the 5-star voting when ready.
                </p>
              </div>
            ) : state.votingStatus === 'voting_ended' ? (
              /* Voting ended for this contestant */
              <div className="py-8 px-4 bg-[#08080A] border border-neutral-800 rounded-2xl text-center">
                <h4 className="text-base font-semibold text-neutral-200">Voting Closed</h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                  Voting has ended for {activeContestant.name}. Standby for the next comic.
                </p>
              </div>
            ) : (
              /* Voting is ACTIVE! Show 1-5 Stars Rating */
              <div className="text-center">
                <h4 className="text-sm font-bold text-white mb-1">
                  Rate this performance
                </h4>
                <p className="text-xs text-neutral-400 mb-4">
                  Tap stars to rate from 1 to 5
                </p>

                {/* 5-Star Interactive Rating Selector */}
                <div className="flex items-center justify-center gap-3 py-2 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isLit = (hoveredStars || selectedStars) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedStars(star)}
                        onMouseEnter={() => setHoveredStars(star)}
                        onMouseLeave={() => setHoveredStars(0)}
                        className="p-2 transition-transform active:scale-90 hover:scale-110 focus:outline-none"
                      >
                        <Star
                          size={38}
                          className={`transition-colors ${
                            isLit
                              ? 'text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                              : 'text-neutral-700 hover:text-neutral-500'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Star text label */}
                <div className="text-xs font-semibold text-red-400 mb-5 min-h-[18px]">
                  {selectedStars > 0 ? getStarLabel(selectedStars) : 'Tap a star to rate'}
                </div>

                {voteError && (
                  <p className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-900/50 mb-4">
                    {voteError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleVote}
                  disabled={submitting || selectedStars < 1}
                  className="w-full min-h-[48px] py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-red-700/30 active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {submitting ? 'Submitting Vote...' : selectedStars > 0 ? `Submit ${selectedStars} Star Rating` : 'Select Stars to Vote'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-8 text-center shadow-xl">
          <h3 className="text-lg font-bold text-white">Standby For First Comic</h3>
          <p className="text-xs text-neutral-400 mt-2">
            The host will bring the first contestant to the stage shortly.
          </p>
        </div>
      )}
    </div>
  );
};
