import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { usePolls } from './contexts/PollsContext';
import type { ResponseStatus } from './types';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/screens/LoginScreen';
import { DashboardScreen } from './components/screens/DashboardScreen';
import { CreatePollWizard } from './components/screens/CreatePollWizard';
import { MemberVoteScreen } from './components/screens/MemberVoteScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import bgFond from './assets/fond.webp';

export function App() {
  const { userProfile, loginAsDemoUser } = useAuth();
  const { polls, loading, createNewPoll, removePoll, cancelExistingPoll, saveVotes } = usePolls();
  const [currentScreen, setCurrentScreen] = useState<'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile'>('dashboard');
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);

  // Poll sélectionné pour voter ou voir les résultats
  const activePoll = polls.find(p => p.id === selectedPollId) || polls[0] || null;

  const toggleUserRole = () => {
    if (!userProfile) {
      loginAsDemoUser(true);
      return;
    }
    loginAsDemoUser(userProfile.role !== 'CAPTAIN');
  };

  const handleLogin = (asCaptain: boolean) => {
    loginAsDemoUser(asCaptain);
    setCurrentScreen('dashboard');
  };

  const handleSelectPoll = (pollId: string, action: 'vote' | 'results' | 'edit') => {
    setSelectedPollId(pollId);
    if (action === 'vote') setCurrentScreen('vote');
    else if (action === 'results') setCurrentScreen('results');
    else if (action === 'edit') setCurrentScreen('create');
  };

  const handleCreatePollPublish = async (pollData: any) => {
    await createNewPoll(pollData, pollData.slots || []);
    setCurrentScreen('dashboard');
  };

  const handleSaveVotes = async (votes: Record<string, ResponseStatus>) => {
    if (!activePoll) return;
    await saveVotes(activePoll.id, votes);
  };

  const currentUser = userProfile || {
    id: 'usr_guest',
    name: 'Visiteur',
    avatar: '👤',
    role: 'MEMBER' as const,
    discordRoles: [],
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 md:pb-0"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(2, 6, 23, 0.82), rgba(2, 6, 23, 0.94)), url(${bgFond})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Navigation bar with persona switcher */}
      {currentScreen !== 'login' && (
        <Navbar
          currentScreen={currentScreen}
          setScreen={setCurrentScreen}
          currentUser={currentUser}
          toggleUserRole={toggleUserRole}
        />
      )}

      {/* Main Content View */}
      <main className="flex-1">
        {currentScreen === 'login' && <LoginScreen onLogin={handleLogin} />}

        {currentScreen === 'dashboard' && (
          <DashboardScreen
            currentUser={currentUser}
            polls={polls}
            loading={loading}
            onSelectPoll={handleSelectPoll}
            onCreatePoll={() => setCurrentScreen('create')}
            onDeletePoll={removePoll}
            onCancelPoll={cancelExistingPoll}
          />
        )}

        {currentScreen === 'create' && (
          <CreatePollWizard
            onCancel={() => setCurrentScreen('dashboard')}
            onPublish={handleCreatePollPublish}
          />
        )}

        {currentScreen === 'vote' && activePoll && (
          <MemberVoteScreen
            poll={activePoll}
            currentUser={currentUser}
            onSaveVotes={handleSaveVotes}
          />
        )}

        {currentScreen === 'results' && activePoll && (
          <ResultsScreen
            poll={activePoll}
            currentUser={currentUser}
          />
        )}
      </main>
    </div>
  );
}

export default App;
