import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { usePolls } from './contexts/PollsContext';
import type { ResponseStatus } from './types';
import { notifyPollCreatedByDiscord } from './firebase/discordNotifications';
import { Navbar, type AppScreen } from './components/Navbar';
import { LoginScreen } from './components/screens/LoginScreen';
import {
  DashboardScreen,
  type DashboardNotificationBanner,
} from './components/screens/DashboardScreen';
import { CreatePollWizard } from './components/screens/CreatePollWizard';
import { MemberVoteScreen } from './components/screens/MemberVoteScreen';
import { OrganizerCockpitScreen } from './components/screens/OrganizerCockpitScreen';
import bgFond from './assets/fond.webp';

export function App() {
  const { userProfile, loading: authLoading, logout } = useAuth();
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

  // Garde contre les modifications non sauvegardées (déclenché uniquement au changement de page)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState<DashboardNotificationBanner | null>(
    null
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

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

  const guardNavigation = (action: () => void) => {
    if (hasUnsavedChanges) {
      setPendingAction(() => action);
      return;
    }
    action();
  };

  const navigateTo = (screen: AppScreen) => {
    if (screen === effectiveScreen) return;
    guardNavigation(() => {
      setHasUnsavedChanges(false);
      clearDeepLinkUrl();
      setCurrentScreen(screen);
    });
  };

  const handleSelectPoll = (pollId: string, action: 'vote' | 'cockpit') => {
    guardNavigation(() => {
      setHasUnsavedChanges(false);
      clearDeepLinkUrl();
      setSelectedPollId(pollId);
      setCurrentScreen(action);
    });
  };

  const handleLogout = () => {
    guardNavigation(() => {
      setHasUnsavedChanges(false);
      void logout();
    });
  };

  const handleCreatePollPublish = async (pollData: any) => {
    const pollId = await createNewPoll(pollData, pollData.slots || []);
    setHasUnsavedChanges(false);
    clearDeepLinkUrl();
    try {
      const dm = await notifyPollCreatedByDiscord(pollId, pollData.targetUsers || []);
      if (dm.failedCount > 0) {
        setDashboardNotice({
          type: 'warning',
          title: `Sondage publié ! ${dm.sentCount}/${dm.totalAuthorized} MP Discord envoyé(s) (${dm.failedCount} échec(s)).`,
          details: dm.failed.map((f) => `${f.displayName} : ${f.reason}`),
        });
      } else {
        setDashboardNotice({
          type: 'success',
          title: `Sondage publié ! ${dm.sentCount}/${dm.totalAuthorized} membre(s) notifié(s) en MP Discord.`,
        });
      }
    } catch (err: any) {
      setDashboardNotice({
        type: 'warning',
        title: 'Sondage publié, mais l’envoi automatique des MP Discord a échoué.',
        details: [err?.message || 'Erreur lors de la communication avec le bot Discord.'],
      });
    }
    setCurrentScreen('dashboard');
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
    <div className="min-h-screen text-slate-100 flex flex-col relative">
      {/* Couche de fond fixe performante sur iOS / Android */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-slate-950 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0.94)), url(${bgFond})`,
        }}
      />

      {/* Barre de navigation */}
      {!authLoading && effectiveScreen !== 'login' && userProfile && (
        <Navbar
          currentScreen={effectiveScreen}
          setScreen={navigateTo}
          currentUser={userProfile}
          onLogout={handleLogout}
        />
      )}

      {/* Main Content View (padding bas suffisant pour la barre mobile) */}
      <main className="flex-1 flex flex-col w-full pb-24 sm:pb-8">
        {authLoading ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="flex flex-col items-center gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl px-8 py-6 shadow-2xl animate-modal-pop">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm text-slate-300 font-medium">
                Vérification de la connexion Discord...
              </p>
            </div>
          </div>
        ) : (
          <div key={effectiveScreen} className="w-full animate-fade-slide-up">
            {effectiveScreen === 'login' && <LoginScreen />}

            {effectiveScreen === 'dashboard' && userProfile && (
              <DashboardScreen
                currentUser={userProfile}
                polls={polls}
                loading={pollsLoading}
                notificationBanner={dashboardNotice}
                onDismissNotification={() => setDashboardNotice(null)}
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
                onDirtyChange={setHasUnsavedChanges}
                onCancel={() => navigateTo('dashboard')}
                onPublish={handleCreatePollPublish}
              />
            )}

            {effectiveScreen === 'vote' && userProfile && activePoll && (
              <MemberVoteScreen
                key={activePoll.id}
                poll={activePoll}
                currentUser={userProfile}
                onDirtyChange={setHasUnsavedChanges}
                onSaveVotes={handleSaveVotes}
                onBack={() => navigateTo('dashboard')}
              />
            )}

            {effectiveScreen === 'cockpit' && userProfile && (
              <OrganizerCockpitScreen
                polls={polls}
                selectedPollId={activePoll?.id || null}
                onSelectPollId={(id) => {
                  setHasUnsavedChanges(false);
                  setSelectedPollId(id);
                }}
                currentUser={userProfile}
                guildMembers={guildMembers}
                membersMap={membersMap}
                voterNames={voterNames}
                onDirtyChange={setHasUnsavedChanges}
                onUpdateSlot={updateSingleSlot}
                onSaveSlotPlanBatch={saveSlotPlanBatch}
                onAddSlot={addSlot}
                onRemoveSlot={removeSlot}
                onCreatePoll={() => navigateTo('create')}
                onBack={() => navigateTo('dashboard')}
              />
            )}
          </div>
        )}
      </main>

      {/* Modale d'alerte : affichée uniquement quand l'utilisateur essaie de quitter sans sauvegarder */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="bg-slate-900 border-2 border-red-500/70 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-modal-pop"
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">
                  Modifications non sauvegardées !
                </h4>
                <p className="text-xs text-red-300">
                  Attention : vous risquez de perdre vos saisies.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
              Des modifications ont été effectuées sur cette page mais n'ont pas encore été enregistrées. Veuillez sauvegarder avant de quitter, ou confirmer l'abandon.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition active:scale-95"
              >
                Rester et enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = pendingAction;
                  setPendingAction(null);
                  setHasUnsavedChanges(false);
                  action();
                }}
                className="px-4 py-2.5 text-xs font-medium text-red-300 hover:text-white bg-red-950/70 hover:bg-red-700 border border-red-800/60 rounded-xl transition active:scale-95"
              >
                Quitter sans enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
