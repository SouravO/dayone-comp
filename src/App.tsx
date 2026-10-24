import React, { useState, useEffect } from 'react';
import { VoterPageView } from './views/VoterPageView.tsx';
import { AdminDashboardView } from './views/AdminDashboardView.tsx';
import { AdminLoginModal } from './views/AdminLoginModal.tsx';
import { useLiveVoterEvent, fetchEvents } from './services/api.ts';
import { Mic2, Lock, ArrowRight, UserCheck } from 'lucide-react';

export default function App() {
  const [currentEventId, setCurrentEventId] = useState<string>('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);

  // Path routing: supports '/vote', '/vote/:id', '/admin', and '/'
  const [pathname, setPathname] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      setPathname(path);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check URL path and query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const urlEvent = params.get('event');

      // Check if event ID is embedded in path: /vote/:eventId
      if (path.startsWith('/vote/')) {
        const idFromPath = path.replace('/vote/', '').trim();
        if (idFromPath) {
          setCurrentEventId(idFromPath);
        }
      } else if (urlEvent) {
        setCurrentEventId(urlEvent);
      } else {
        // Fetch published event if available
        fetchEvents()
          .then((list) => {
            if (list && list.length > 0) {
              const active = list.find((e) => e.status === 'published') || list[0];
              setCurrentEventId(active.id);
            }
          })
          .catch(() => {});
      }

      // Check existing admin session
      const token = localStorage.getItem('dayone_admin_token');
      if (token) {
        setIsAdminLoggedIn(true);
      }
    }
  }, [pathname]);

  // Real-time synchronization stream for the active event
  const { state, loading, error, refresh } = useLiveVoterEvent(currentEventId);

  const handleAdminLoginSuccess = () => {
    setIsAdminLoggedIn(true);
    navigateTo('/admin');
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('dayone_admin_token');
    setIsAdminLoggedIn(false);
    navigateTo('/');
  };

  // Determine if the current view should be the Voter Page
  const isVoterPage = pathname === '/vote' || pathname.startsWith('/vote');

  return (
    <div className="min-h-screen bg-[#08080A] text-white flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#08080A]/95 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Brand */}
          <div
            onClick={() => navigateTo(isAdminLoggedIn ? '/admin' : '/')}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
              <Mic2 size={16} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-black font-display tracking-tight text-white text-base">
                Day One
              </span>
              <span className="text-xs uppercase font-bold text-red-500 hidden sm:inline">
                Standup Comedy
              </span>
            </div>
          </div>

          {/* Sub-Route Navigation */}
          <div className="flex items-center gap-2">
            {isVoterPage ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-lg">
                  Sub-route: <strong className="text-white">/vote</strong>
                </span>

                {isAdminLoggedIn ? (
                  <button
                    onClick={() => navigateTo('/admin')}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 transition-colors"
                  >
                    Go to Admin
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAdminLoginModal(true)}
                    className="p-1.5 text-neutral-500 hover:text-neutral-300"
                    title="Admin Login"
                  >
                    <Lock size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateTo('/vote')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm shadow-red-700/30"
                >
                  <UserCheck size={14} />
                  <span>Go to Voter Page (/vote)</span>
                </button>

                {!isAdminLoggedIn && (
                  <button
                    onClick={() => setShowAdminLoginModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-800"
                  >
                    <Lock size={12} className="text-red-500" />
                    <span>Admin</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main View Router */}
      <main className="flex-1 flex flex-col justify-center">
        {isVoterPage ? (
          /* Sub-Route: /vote (Voters only access this) */
          <VoterPageView
            state={state}
            loading={loading}
            error={error}
          />
        ) : isAdminLoggedIn ? (
          /* Admin View: /admin or / */
          <AdminDashboardView
            currentEventId={currentEventId}
            onSelectEvent={(id) => {
              setCurrentEventId(id);
              refresh();
            }}
            onLogout={handleAdminLogout}
            onOpenVoterView={() => navigateTo('/vote')}
          />
        ) : (
          /* Non-logged in root page: straightforward prompt */
          <div className="max-w-md mx-auto my-auto p-8 text-center bg-[#101014] border border-neutral-800 rounded-3xl shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
              <Mic2 size={24} />
            </div>
            <span className="text-xs font-mono uppercase tracking-widest text-red-500 font-bold">
              Day One Standup Comedy
            </span>
            <h2 className="text-2xl font-black font-display text-white mt-1">
              Live Stage Voting
            </h2>

            <div className="my-6 space-y-3">
              <button
                onClick={() => navigateTo('/vote')}
                className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-red-700/30 flex items-center justify-center gap-2"
              >
                <span>Open Voter Page (/vote)</span>
                <ArrowRight size={16} />
              </button>

              <button
                onClick={() => setShowAdminLoginModal(true)}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Lock size={13} className="text-red-500" />
                <span>Admin Login</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={showAdminLoginModal}
        onClose={() => setShowAdminLoginModal(false)}
        onLoginSuccess={handleAdminLoginSuccess}
      />
    </div>
  );
}
