import React, { useState, useEffect } from 'react';
import {
  VoterEventState,
  AdminReport,
} from '../types/index.ts';
import {
  createVotingEvent,
  publishEvent,
  controlVoting,
  fetchAdminReport,
  fetchEvents,
  fetchPublicConfig,
  deleteVotingEvent,
} from '../services/api.ts';
import {
  Play,
  Square,
  Plus,
  Trash2,
  LogOut,
  RefreshCw,
  ExternalLink,
  Users,
  Trophy,
  Mic2,
  Radio,
  Search,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';

interface AdminDashboardViewProps {
  currentEventId: string;
  onSelectEvent: (eventId: string) => void;
  onLogout: () => void;
  onOpenVoterView: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentEventId,
  onSelectEvent,
  onLogout,
  onOpenVoterView,
}) => {
  const [eventsList, setEventsList] = useState<{ id: string; title: string; criteria: string; status: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'control' | 'voters' | 'create' | 'report'>(currentEventId ? 'control' : 'create');
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [voterSearch, setVoterSearch] = useState('');
  const [deletingVoterId, setDeletingVoterId] = useState<string | null>(null);

  // Quick inline add contestant below the grid
  const [inlineContestantName, setInlineContestantName] = useState('');
  const [addingContestant, setAddingContestant] = useState(false);

  // Create Event Form State (Plain and empty, zero mock data)
  const [newTitle, setNewTitle] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newContestants, setNewContestants] = useState<string[]>(['', '']);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Live event state
  const [eventData, setEventData] = useState<VoterEventState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadAllEvents = async () => {
    try {
      const list = await fetchEvents();
      setEventsList(list);
      if (!currentEventId && list.length > 0) {
        onSelectEvent(list[0].id);
      }
    } catch (e) {
      console.warn('Failed to fetch events', e);
    }
  };

  const loadEventState = async () => {
    if (!currentEventId) {
      setEventData(null);
      return;
    }
    try {
      const res = await fetch(`/api/events/${currentEventId}/public`);
      if (res.ok) {
        const data = await res.json();
        setEventData(data);
      }
    } catch (e) {
      console.warn('Failed to load event data', e);
    }
  };

  const loadReport = async () => {
    if (!currentEventId) return;
    setLoadingReport(true);
    try {
      const rep = await fetchAdminReport(currentEventId);
      setReport(rep);
    } catch (e) {
      console.warn('Failed to load report', e);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    loadAllEvents();
    loadEventState();
  }, [currentEventId]);

  useEffect(() => {
    if (activeTab === 'report') {
      loadReport();
    }
  }, [activeTab, currentEventId]);

  // Handle randomly starting voting for any chosen contestant (only one active at a time)
  const handleStartContestantVoting = async (contestantId: string) => {
    if (!currentEventId) return;
    setActionLoading(true);
    try {
      await controlVoting(currentEventId, 'start_contestant_voting', contestantId);
      await loadEventState();
    } catch (err: any) {
      alert(err.message || 'Failed to start voting');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle stopping voting for a contestant
  const handleStopContestantVoting = async (contestantId: string) => {
    if (!currentEventId) return;
    setActionLoading(true);
    try {
      await controlVoting(currentEventId, 'stop_contestant_voting', contestantId);
      await loadEventState();
    } catch (err: any) {
      alert(err.message || 'Failed to stop voting');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle quick inline addition of a contestant
  const handleAddInlineContestant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEventId || !inlineContestantName.trim()) return;
    setAddingContestant(true);
    try {
      await controlVoting(currentEventId, 'add_contestant', undefined, {
        name: inlineContestantName.trim(),
      });
      setInlineContestantName('');
      await loadEventState();
    } catch (err: any) {
      alert(err.message || 'Failed to add contestant');
    } finally {
      setAddingContestant(false);
    }
  };

  // Handle deleting a contestant from the show
  const handleDeleteContestant = async (contestantId: string) => {
    if (!currentEventId) return;
    if (!confirm('Remove this contestant from the show?')) return;
    setActionLoading(true);
    try {
      await controlVoting(currentEventId, 'delete_contestant', contestantId);
      await loadEventState();
    } catch (err: any) {
      alert(err.message || 'Failed to delete contestant');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle permanently deleting the entire competition
  const handleDeleteEvent = async () => {
    if (!currentEventId) return;
    setActionLoading(true);
    try {
      await deleteVotingEvent(currentEventId);
      setShowDeleteConfirm(false);
      const remaining = eventsList.filter((e) => e.id !== currentEventId);
      setEventsList(remaining);
      if (remaining.length > 0) {
        onSelectEvent(remaining[0].id);
        setActiveTab('control');
      } else {
        onSelectEvent('');
        setEventData(null);
        setActiveTab('create');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete competition');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle removing an individual voter from the live room
  const handleDeleteParticipant = async (participantId: string, participantName: string) => {
    if (!currentEventId) return;
    if (!confirm(`Are you sure you want to remove voter "${participantName}" and revoke their votes?`)) return;
    setDeletingVoterId(participantId);
    try {
      await controlVoting(currentEventId, 'delete_participant', undefined, { participantId });
      await loadEventState();
    } catch (err: any) {
      alert(err.message || 'Failed to remove voter');
    } finally {
      setDeletingVoterId(null);
    }
  };

  const handlePublish = async () => {
    if (!currentEventId) return;
    setActionLoading(true);
    try {
      await publishEvent(currentEventId);
      await loadEventState();
      loadAllEvents();
    } catch (err: any) {
      alert(err.message || 'Publish failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validContestants = newContestants.map((c) => c.trim()).filter((c) => c.length > 0);
    if (!newTitle.trim()) {
      setCreateError('Please enter competition title');
      return;
    }
    if (validContestants.length === 0) {
      setCreateError('Please add at least one contestant name');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const created = await createVotingEvent({
        title: newTitle.trim(),
        criteria: newCriteria.trim(),
        contestants: validContestants,
      });

      setNewTitle('');
      setNewCriteria('');
      setNewContestants(['', '']);
      await loadAllEvents();
      onSelectEvent(created.id);
      setActiveTab('control');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create event');
    } finally {
      setCreateLoading(false);
    }
  };

  const contestantsList = eventData?.contestantsList || [];
  const participantsList = eventData?.participantsList || [];
  const isAnyVotingActive = eventData?.votingStatus === 'voting_active';
  const activeContestant = eventData?.activeContestant;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#101014] border border-neutral-800 rounded-3xl p-5 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-red-500 font-bold uppercase">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Day One Standup Comedy · Admin Portal</span>
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black font-display text-white">
              {eventData?.title || 'No Event Selected'}
            </h1>

            {eventsList.length > 1 && (
              <select
                value={currentEventId}
                onChange={(e) => onSelectEvent(e.target.value)}
                className="bg-[#08080A] border border-neutral-700 text-xs text-white rounded-lg px-2.5 py-1 focus:border-red-500 focus:outline-none"
              >
                {eventsList.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {eventData?.criteria && (
            <p className="text-xs text-neutral-400 mt-1">
              Criteria: <strong className="text-neutral-200">{eventData.criteria}</strong>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {currentEventId && (
            <>
              <button
                onClick={onOpenVoterView}
                className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700 transition-colors"
              >
                <ExternalLink size={14} className="text-red-500" />
                <span>Voter Sub-Page (/vote)</span>
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs font-semibold rounded-xl border border-red-900/60 transition-colors"
                title="Permanently Delete Competition"
              >
                <Trash2 size={14} className="text-red-500" />
                <span>Delete Competition</span>
              </button>
            </>
          )}

          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-3 py-2 text-xs text-neutral-400 hover:text-red-400 font-semibold"
          >
            <LogOut size={14} />
            <span>Exit Admin</span>
          </button>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3 flex-wrap">
        <button
          onClick={() => setActiveTab('control')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'control'
              ? 'bg-red-600 text-white shadow-md shadow-red-700/40'
              : 'text-neutral-400 hover:text-white bg-[#101014]'
          }`}
        >
          Live Stage Grid
        </button>

        <button
          onClick={() => setActiveTab('voters')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'voters'
              ? 'bg-red-600 text-white shadow-md shadow-red-700/40'
              : 'text-neutral-400 hover:text-white bg-[#101014]'
          }`}
        >
          <Users size={14} />
          <span>Registered Voters</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeTab === 'voters' ? 'bg-black/40 text-white font-bold' : 'bg-neutral-800 text-neutral-300'}`}>
            {eventData?.totalParticipants ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'create'
              ? 'bg-red-600 text-white shadow-md shadow-red-700/40'
              : 'text-neutral-400 hover:text-white bg-[#101014]'
          }`}
        >
          + Create New Voting
        </button>

        <button
          onClick={() => setActiveTab('report')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'report'
              ? 'bg-red-600 text-white shadow-md shadow-red-700/40'
              : 'text-neutral-400 hover:text-white bg-[#101014]'
          }`}
        >
          Final Report
        </button>
      </div>

      {/* TAB 1: CONTESTANTS GRID & RANDOM START/STOP CONTROL */}
      {activeTab === 'control' && (
        eventData ? (
          <div className="space-y-6">
            {/* Live Telemetry Bar */}
            <div className="bg-[#101014] border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {isAnyVotingActive ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-500 uppercase tracking-wider bg-red-950/40 border border-red-800/60 px-3 py-1.5 rounded-xl animate-pulse">
                      <Radio size={14} className="text-red-500 animate-spin duration-3000" />
                      <span>LIVE VOTING ON: {activeContestant?.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-neutral-400 bg-[#08080A] border border-neutral-800 px-3 py-1.5 rounded-xl">
                      <span className="w-2 h-2 rounded-full bg-neutral-600" />
                      <span>No active voting right now (select a comic below)</span>
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setActiveTab('voters')}
                  className="flex items-center gap-1.5 text-xs text-neutral-300 font-mono hover:text-white bg-[#08080A] hover:bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                  title="Click to view all registered voters"
                >
                  <Users size={14} className="text-red-500" />
                  <span>{eventData.totalParticipants} Voters Connected</span>
                  <span className="text-[10px] text-red-400 font-sans font-bold underline ml-1">View List</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {eventData.status === 'draft' && (
                  <button
                    onClick={handlePublish}
                    disabled={actionLoading}
                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl"
                  >
                    Publish Event
                  </button>
                )}

                <button
                  onClick={() => {
                    if (confirm('Complete event and calculate final rankings report?')) {
                      controlVoting(currentEventId, 'complete_event').then(() => {
                        loadEventState();
                        setActiveTab('report');
                      });
                    }
                  }}
                  className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold rounded-xl"
                >
                  Complete Show & View Report
                </button>
              </div>
            </div>

            {/* SECTION 1: THE 4 TO 5 COLUMN CONTESTANT GRID */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-base font-bold font-display text-white">
                    Contestant Voting Grid
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Click "Start Voting" on any contestant to randomly start voting. Only one contestant votes at a time.
                  </p>
                </div>
                <span className="text-xs text-neutral-500 font-mono">
                  {contestantsList.length} Contestants
                </span>
              </div>

              {contestantsList.length === 0 ? (
                <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-8 text-center">
                  <p className="text-xs text-neutral-400">No contestants added yet. Add contestants below.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                  {contestantsList.map((c) => {
                    const isCurrentVoting = eventData.activeContestantId === c.id && isAnyVotingActive;
                    const isCurrentStopped = eventData.activeContestantId === c.id && !isAnyVotingActive;

                    return (
                      <div
                        key={c.id}
                        className={`rounded-2xl p-4 flex flex-col justify-between transition-all border relative ${
                          isCurrentVoting
                            ? 'bg-red-950/30 border-red-500 shadow-xl shadow-red-900/30 scale-[1.02]'
                            : isCurrentStopped
                            ? 'bg-[#121218] border-neutral-700 shadow-md'
                            : 'bg-[#101014] border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        {/* Top: Order & Live Badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs font-bold text-neutral-400">
                            #{c.order}
                          </span>

                          {isCurrentVoting ? (
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-white bg-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              <span>Voting Live</span>
                            </span>
                          ) : c.voteCount > 0 ? (
                            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-full">
                              {c.voteCount} Votes
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-neutral-500">
                              Ready
                            </span>
                          )}
                        </div>

                        {/* Comic Name */}
                        <div className="my-2">
                          <h3 className="font-bold text-base text-white truncate" title={c.name}>
                            {c.name}
                          </h3>
                          <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center justify-between font-mono">
                            <span>Votes Cast:</span>
                            <strong className="text-white font-bold">{c.voteCount}</strong>
                          </div>
                        </div>

                        {/* Action Buttons: Random Start or Stop */}
                        <div className="mt-3 pt-2 border-t border-neutral-800/80">
                          {isCurrentVoting ? (
                            <button
                              onClick={() => handleStopContestantVoting(c.id)}
                              disabled={actionLoading}
                              className="w-full py-2.5 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                            >
                              <Square size={14} className="fill-current text-red-500" />
                              <span>Stop Voting</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartContestantVoting(c.id)}
                              disabled={actionLoading}
                              className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-red-700/30"
                            >
                              <Play size={14} className="fill-current text-white" />
                              <span>Start Voting</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 2: ADD CONTESTANT ONE BY ONE BELOW & MANAGEMENT LIST */}
            <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Add Contestants to the Show</h3>
                  <p className="text-xs text-neutral-400">
                    Add performers one by one below. They appear in the voting grid above instantly.
                  </p>
                </div>
              </div>

              {/* Inline input to add a contestant */}
              <form onSubmit={handleAddInlineContestant} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Enter contestant name..."
                  value={inlineContestantName}
                  onChange={(e) => setInlineContestantName(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-xs focus:border-red-500 focus:outline-none font-medium"
                />
                <button
                  type="submit"
                  disabled={addingContestant || !inlineContestantName.trim()}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-red-700/30 shrink-0"
                >
                  <Plus size={15} />
                  <span>{addingContestant ? 'Adding...' : 'Add Contestant'}</span>
                </button>
              </form>

              {/* Contestants List Below */}
              <div className="divide-y divide-neutral-800/80 max-h-64 overflow-y-auto pr-1 pt-2">
                {contestantsList.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-neutral-500 w-6">#{c.order}</span>
                      <span className="font-semibold text-white">{c.name}</span>
                      <span className="text-neutral-500 font-mono text-[11px]">({c.voteCount} votes)</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartContestantVoting(c.id)}
                        disabled={actionLoading}
                        className="px-2.5 py-1 text-[11px] font-bold text-red-500 hover:text-white hover:bg-red-600/20 rounded-lg transition-colors"
                      >
                        Start Vote
                      </button>

                      <button
                        onClick={() => handleDeleteContestant(c.id)}
                        disabled={actionLoading}
                        className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                        title="Remove Contestant"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-8 text-center shadow-xl">
            <h3 className="text-base font-bold text-white">No Event Selected</h3>
            <p className="text-xs text-neutral-400 mt-1 mb-4">
              Create a new voting event to get started.
            </p>
            <button
              onClick={() => setActiveTab('create')}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl"
            >
              + Create Voting Event
            </button>
          </div>
        )
      )}

      {/* TAB: REGISTERED VOTERS */}
      {activeTab === 'voters' && (
        eventData ? (
          <div className="space-y-6">
            <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-xl">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-display text-white">
                      Registered Live Voters
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-red-600/20 text-red-400 border border-red-500/30">
                      {participantsList.length} Connected
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    Audience members who entered their name and joined this competition via <strong className="text-neutral-200">/vote</strong>.
                  </p>
                </div>

                {/* Search / Filter Input */}
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search voter name..."
                    value={voterSearch}
                    onChange={(e) => setVoterSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Summary Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
                <div className="bg-[#08080A] border border-neutral-800/80 rounded-2xl p-4">
                  <span className="text-[11px] font-mono text-neutral-400 uppercase">Total Audience</span>
                  <div className="text-2xl font-black text-white font-display mt-0.5">
                    {participantsList.length}
                  </div>
                  <span className="text-[11px] text-neutral-500">Joined via /vote</span>
                </div>

                <div className="bg-[#08080A] border border-neutral-800/80 rounded-2xl p-4">
                  <span className="text-[11px] font-mono text-neutral-400 uppercase">Active Voters</span>
                  <div className="text-2xl font-black text-white font-display mt-0.5">
                    {participantsList.filter((p) => p.votesCount > 0).length}
                  </div>
                  <span className="text-[11px] text-neutral-500">Voted at least once</span>
                </div>

                <div className="bg-[#08080A] border border-neutral-800/80 rounded-2xl p-4">
                  <span className="text-[11px] font-mono text-neutral-400 uppercase">Total Votes Cast</span>
                  <div className="text-2xl font-black text-red-500 font-display mt-0.5">
                    {participantsList.reduce((acc, p) => acc + p.votesCount, 0)}
                  </div>
                  <span className="text-[11px] text-neutral-500">Across {contestantsList.length} contestants</span>
                </div>
              </div>

              {/* Voter List */}
              {participantsList.length === 0 ? (
                <div className="py-12 text-center bg-[#08080A] border border-neutral-800/60 rounded-2xl px-4">
                  <Users className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                  <h3 className="text-sm font-bold text-white">No Voters Joined Yet</h3>
                  <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                    Audience members can join by visiting <span className="text-red-400 font-mono">/vote</span> on their mobile browser and entering their name.
                  </p>
                </div>
              ) : (
                (() => {
                  const filtered = participantsList.filter((p) =>
                    p.name.toLowerCase().includes(voterSearch.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-xs text-neutral-500">
                        No voters found matching "{voterSearch}"
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 text-[11px] font-mono text-neutral-400 uppercase">
                            <th className="py-3 px-3">#</th>
                            <th className="py-3 px-3">Voter Name</th>
                            <th className="py-3 px-3">Time Joined</th>
                            <th className="py-3 px-3">Votes Submitted</th>
                            <th className="py-3 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/60 font-medium">
                          {filtered.map((p, idx) => {
                            const totalContestants = contestantsList.length;
                            const pct = totalContestants > 0 ? Math.round((p.votesCount / totalContestants) * 100) : 0;
                            const isDeleting = deletingVoterId === p.id;

                            return (
                              <tr key={p.id} className="hover:bg-neutral-900/30 transition-colors">
                                <td className="py-3.5 px-3 font-mono text-neutral-500">
                                  {idx + 1}
                                </td>
                                <td className="py-3.5 px-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30 font-bold flex items-center justify-center uppercase text-xs shrink-0">
                                      {p.name.charAt(0)}
                                    </div>
                                    <div>
                                      <span className="font-bold text-white text-sm block">
                                        {p.name}
                                      </span>
                                      <span className="text-[10px] text-neutral-500 font-mono">
                                        ID: {p.id}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-3 font-mono text-neutral-400">
                                  {new Date(p.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-3.5 px-3">
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-neutral-200">
                                      <strong className="text-white">{p.votesCount}</strong> / {totalContestants}
                                    </span>
                                    <div className="w-20 bg-neutral-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                      <div
                                        className="bg-red-500 h-full rounded-full transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-3 text-right">
                                  <button
                                    onClick={() => handleDeleteParticipant(p.id, p.name)}
                                    disabled={actionLoading || isDeleting}
                                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                                    title="Remove this voter"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-8 text-center shadow-xl">
            <h3 className="text-base font-bold text-white">No Event Selected</h3>
            <p className="text-xs text-neutral-400 mt-1 mb-4">
              Select or create an event to see registered voters.
            </p>
          </div>
        )
      )}

      {/* TAB 2: CREATE VOTING EVENT */}
      {activeTab === 'create' && (
        <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <h2 className="text-xl font-bold font-display text-white mb-1">
            Create Day One Voting Event
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            Enter the event details, voting criteria, and specify the contestants one by one.
          </p>

          {createError && (
            <div className="p-3 bg-red-950/40 border border-red-900 rounded-xl text-xs text-red-300 mb-4">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Competition Title
              </label>
              <input
                type="text"
                required
                placeholder="Enter competition title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-3 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Voting Criteria (e.g. Humor, Timing, Stage Presence)
              </label>
              <input
                type="text"
                required
                placeholder="Enter criteria for voting"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                className="w-full px-4 py-3 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-neutral-300">
                  Contestants (One by One)
                </label>
                <button
                  type="button"
                  onClick={() => setNewContestants((prev) => [...prev, ''])}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 font-bold"
                >
                  <Plus size={14} />
                  <span>Add Another Contestant</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {newContestants.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-center font-mono text-xs text-neutral-500">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      required
                      placeholder={`Contestant ${idx + 1} Name`}
                      value={name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewContestants((prev) => {
                          const copy = [...prev];
                          copy[idx] = val;
                          return copy;
                        });
                      }}
                      className="flex-1 px-3.5 py-2.5 bg-[#08080A] border border-neutral-700 rounded-xl text-white text-sm focus:border-red-500 focus:outline-none"
                    />
                    {newContestants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewContestants((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-neutral-500 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={createLoading}
                className="w-full py-3.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-700/30"
              >
                {createLoading ? 'Creating Event...' : 'Create & Open Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: ADMIN FINAL REPORT */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="bg-[#101014] border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h2 className="text-xl font-bold font-display text-white">
                  Day One Competition Report
                </h2>
                <p className="text-xs text-neutral-400">
                  Criteria: {report?.criteria || 'Performance'} · 5-Star Rating System
                </p>
              </div>

              <button
                onClick={loadReport}
                className="p-2 bg-neutral-900 text-neutral-300 hover:text-white rounded-xl"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {loadingReport ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                Generating Report...
              </div>
            ) : !report || report.summaries.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                No report data recorded yet.
              </div>
            ) : (
              <div className="space-y-6 pt-5">
                {/* Rankings Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 text-xs font-mono text-neutral-400 uppercase">
                        <th className="py-3 px-3 text-center">Rank</th>
                        <th className="py-3 px-3">Contestant</th>
                        <th className="py-3 px-3 text-right">Average Stars</th>
                        <th className="py-3 px-3 text-right">Total Votes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {report.summaries.map((s) => (
                        <tr key={s.contestantId} className="hover:bg-neutral-900/30">
                          <td className="py-3 px-3 text-center font-mono font-bold">
                            {s.rank === 1 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white text-xs">
                                1
                              </span>
                            ) : (
                              <span className="text-neutral-400">#{s.rank}</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-semibold text-white">
                            {s.name}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            <span className="text-red-500 mr-1">⭐ {s.averageStars}</span>
                            <span className="text-xs text-neutral-500">/ 5</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-neutral-300">
                            {s.totalVotes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Individual Voter Matrix */}
                <div className="pt-4 border-t border-neutral-800">
                  <h3 className="text-sm font-bold text-white mb-2">
                    Individual Voter Submissions
                  </h3>
                  {report.voterMatrix.length === 0 ? (
                    <p className="text-xs text-neutral-500 py-3">No votes cast yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-neutral-800 text-[11px] font-mono text-neutral-400 uppercase">
                            <th className="py-2.5 px-3">Voter Name</th>
                            {report.summaries.map((c) => (
                              <th key={c.contestantId} className="py-2.5 px-3 text-center">
                                {c.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/40 font-mono">
                          {report.voterMatrix.map((vm, idx) => (
                            <tr key={idx} className="hover:bg-neutral-900/20">
                              <td className="py-2.5 px-3 font-semibold text-neutral-200">
                                {vm.participantName}
                              </td>
                              {report.summaries.map((c) => {
                                const stars = vm.ratings[c.contestantId];
                                return (
                                  <td key={c.contestantId} className="py-2.5 px-3 text-center">
                                    {stars ? (
                                      <span className="text-red-400 font-bold">
                                        {stars} ★
                                      </span>
                                    ) : (
                                      <span className="text-neutral-600">-</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DELETE COMPETITION CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#101014] border border-red-900/60 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 mx-auto mb-4">
              <AlertTriangle size={26} />
            </div>

            <h3 className="text-xl font-bold font-display text-white text-center">
              Delete Competition?
            </h3>
            <p className="text-xs text-neutral-400 text-center mt-2 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-white">"{eventData?.title}"</strong>?
              All registered contestants, audience star ratings, and the final report will be erased immediately.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={actionLoading}
                className="flex-1 py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-semibold text-xs rounded-xl border border-neutral-700 transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteEvent}
                disabled={actionLoading}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-red-700/30 flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                <span>{actionLoading ? 'Deleting...' : 'Yes, Delete Competition'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
