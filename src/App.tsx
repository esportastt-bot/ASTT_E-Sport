import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { usePolls } from './contexts/PollsContext';
import type { ResponseStatus } from './types';
import { Navbar, type AppScreen } from './components/Navbar';
import { LoginScreen } from './components/screens/LoginScreen';
import { DashboardScreen } from './components/screens/DashboardScreen';
import { CreatePollWizard } from './components/screens/CreatePollWizard';
import { MemberVoteScreen } from './components/screens/MemberVoteScreen';
import { OrganizerCockpitScreen } from './components/screens/OrganizerCockpitScreen';
import bgFond from './assets/fond.webp';

export function App() {
  const { userProfile, loading: authLoading } = useAuth();
  const {
    polls,
    guildMembers,
    membersMap,
    voterNames,
    loading: pollsLoading,
    createNewPoll,
    removePoll,
    cancelExistingPoll,
    updateExistingPoll,
    saveVotes,
    updateSingleSlot,
    saveSlotPlanBatch,
    addSlot,
    removeSlot,
  } = usePolls();

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('dashboard');
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [deepLinkPollId, setDeepLinkPollId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('poll');
  });

  // Dériver l'écran affiché pour éviter tout setState synchrone dans useEffect
  const deepLinkMatch = Boolean(
    deepLinkPollId && polls.some((p) => p.id === deepLinkPollId)
  );
  const effectivePollId = deepLinkMatch ? deepLinkPollId : selectedPollId;
  const effectiveScreen: AppScreen = !userProfile
    ? 'login'
    : deepLinkMatch
    ? 'vote'
    : currentScreen === 'login'
    ? 'dashboard'
    : currentScreen;

  const activePoll = polls.find((p) => p.id === effectivePollId) || polls[0] || null;

  const clearDeepLinkUrl = () => {
    if (deepLinkPollId) {
      setDeepLinkPollId(null);
      const url = new URL(window.location.href);
      if (url.searchParams.has('poll')) {
        url.searchParams.delete('poll');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
  };

  const navigateTo = (screen: AppScreen) => {
    clearDeepLinkUrl();
    setCurrentScreen(screen);
  };

  const handleSelectPoll = (pollId: string, action: 'vote' | 'cockpit') => {
    clearDeepLinkUrl();
    setSelectedPollId(pollId);
    setCurrentScreen(action);
  };

  const handleCreatePollPublish = async (pollData: any) => {
    await createNewPoll(pollData, pollData.slots || []);
    navigateTo('dashboard');
  };

  const handleSaveVotes = async (
    votes: Record<string, ResponseStatus>,
    desiredGames: number | null
  ) => {
    if (!activePoll) return;
    await saveVotes(activePoll.id, votes, desiredGames);
  };

  const handleClosePoll = async (pollId: string) => {
    await updateExistingPoll(pollId, { status: 'CLOSED' });
  };

  const handleReopenPoll = async (pollId: string) => {
    await updateExistingPoll(pollId, { status: 'OPEN' });
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0.94)), url(${bgFond})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Barre de navigation */}
      {!authLoading && effectiveScreen !== 'login' && userProfile && (
        <Navbar
          currentScreen={effectiveScreen}
          setScreen={navigateTo}
          currentUser={userProfile}
        />
      )}

      {/* Main Content View */}
      <main className="flex-1 flex flex-col">
        {authLoading ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl px-8 py-6 shadow-2xl">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-300 font-medium">
                Vérification de la connexion Discord...
              </p>
            </div>
          </div>
        ) : (
          <>
            {effectiveScreen === 'login' && <LoginScreen />}

            {effectiveScreen === 'dashboard' && userProfile && (
              <DashboardScreen
                currentUser={userProfile}
                polls={polls}
                loading={pollsLoading}
                onSelectPoll={handleSelectPoll}
                onCreatePoll={() => navigateTo('create')}
                onDeletePoll={removePoll}
                onCancelPoll={cancelExistingPoll}
                onClosePoll={handleClosePoll}
                onReopenPoll={handleReopenPoll}
              />
            )}

            {effectiveScreen === 'create' && userProfile && (
              <CreatePollWizard
                currentUser={userProfile}
                onCancel={() => navigateTo('dashboard')}
                onPublish={handleCreatePollPublish}
              />
            )}

            {effectiveScreen === 'vote' && userProfile && activePoll && (
              <MemberVoteScreen
                key={activePoll.id}
                poll={activePoll}
                currentUser={userProfile}
                onSaveVotes={handleSaveVotes}
                onBack={() => navigateTo('dashboard')}
              />
            )}

            {effectiveScreen === 'cockpit' && userProfile && (
              <OrganizerCockpitScreen
                polls={polls}
                selectedPollId={activePoll?.id || null}
                onSelectPollId={(id) => setSelectedPollId(id)}
                currentUser={userProfile}
                guildMembers={guildMembers}
                membersMap={membersMap}
                voterNames={voterNames}
                onUpdateSlot={updateSingleSlot}
                onSaveSlotPlanBatch={saveSlotPlanBatch}
                onAddSlot={addSlot}
                onRemoveSlot={removeSlot}
                onUpdatePoll={updateExistingPoll}
                onCreatePoll={() => navigateTo('create')}
                onBack={() => navigateTo('dashboard')}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
