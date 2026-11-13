import { useState } from 'react';
import { MOCK_USERS, MOCK_POLL } from './mock/data';
import type { UserProfile, Poll, ResponseStatus } from './types';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/screens/LoginScreen';
import { DashboardScreen } from './components/screens/DashboardScreen';
import { CreatePollWizard } from './components/screens/CreatePollWizard';
import { MemberVoteScreen } from './components/screens/MemberVoteScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';

export function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile>(MOCK_USERS[0]); // Alex (Capitaine) by default
  const [currentScreen, setCurrentScreen] = useState<'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile'>('dashboard');
  const [polls, setPolls] = useState<Poll[]>([MOCK_POLL]);

  const toggleUserRole = () => {
    // Switch between Alex (Capitaine) and Thomas (Membre)
    if (currentUser.role === 'CAPTAIN') {
      setCurrentUser(MOCK_USERS[1]); // Thomas
    } else {
      setCurrentUser(MOCK_USERS[0]); // Alex
    }
  };

  const handleLogin = (asCaptain: boolean) => {
    setCurrentUser(asCaptain ? MOCK_USERS[0] : MOCK_USERS[1]);
    setCurrentScreen('dashboard');
  };

  const handleSelectPoll = (_pollId: string, action: 'vote' | 'results' | 'edit') => {
    if (action === 'vote') setCurrentScreen('vote');
    else if (action === 'results') setCurrentScreen('results');
    else if (action === 'edit') setCurrentScreen('create');
  };

  const handleCreatePollPublish = (pollData: any) => {
    // Create new mock poll
    const newPoll: Poll = {
      ...MOCK_POLL,
      id: `poll-${Date.now()}`,
      title: pollData.title,
      type: pollData.trainingType,
    };
    setPolls([newPoll, ...polls]);
    setCurrentScreen('dashboard');
  };

  const handleSaveVotes = (votes: Record<string, ResponseStatus>) => {
    // Update local poll votes
    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== MOCK_POLL.id) return poll;
        const updatedSlots = poll.slots.map((slot) => {
          const vote = votes[slot.id];
          const newDispo = slot.disponibles.filter((id) => id !== currentUser.id);
          const newIncertain = slot.incertains.filter((id) => id !== currentUser.id);
          const newIndispo = slot.indisponibles.filter((id) => id !== currentUser.id);

          if (vote === 'DISPONIBLE') newDispo.push(currentUser.id);
          else if (vote === 'INCERTAIN') newIncertain.push(currentUser.id);
          else if (vote === 'INDISPONIBLE') newIndispo.push(currentUser.id);

          return {
            ...slot,
            disponibles: newDispo,
            incertains: newIncertain,
            indisponibles: newIndispo,
          };
        });
        return { ...poll, slots: updatedSlots };
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 md:pb-0">
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
            onSelectPoll={handleSelectPoll}
            onCreatePoll={() => setCurrentScreen('create')}
          />
        )}

        {currentScreen === 'create' && (
          <CreatePollWizard
            onCancel={() => setCurrentScreen('dashboard')}
            onPublish={handleCreatePollPublish}
          />
        )}

        {currentScreen === 'vote' && (
          <MemberVoteScreen
            poll={polls[0]}
            currentUser={currentUser}
            onSaveVotes={handleSaveVotes}
          />
        )}

        {currentScreen === 'results' && (
          <ResultsScreen
            poll={polls[0]}
            currentUser={currentUser}
          />
        )}
      </main>
    </div>
  );
}

export default App;
