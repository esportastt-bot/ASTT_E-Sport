import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Poll, ResponseStatus } from '../types';
import { subscribeToPollsList, createPoll, deletePoll, cancelPoll, submitResponses, updateSlotSelection } from '../firebase/polls';
import { MOCK_POLL } from '../mock/data';
import { useAuth } from './AuthContext';

interface PollsContextType {
  polls: Poll[];
  loading: boolean;
  createNewPoll: (pollData: any, slots: any[]) => Promise<string>;
  removePoll: (pollId: string) => Promise<void>;
  cancelExistingPoll: (pollId: string) => Promise<void>;
  saveVotes: (pollId: string, votes: Record<string, ResponseStatus>) => Promise<void>;
  updateSelection: (pollId: string, slotId: string, selectedIds: string[], waitlistIds: string[]) => Promise<void>;
}

const PollsContext = createContext<PollsContextType>({
  polls: [],
  loading: true,
  createNewPoll: async () => '',
  removePoll: async () => {},
  cancelExistingPoll: async () => {},
  saveVotes: async () => {},
  updateSelection: async () => {},
});

export const PollsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [polls, setPolls] = useState<Poll[]>(() => {
    const saved = localStorage.getItem('astt_polls_cache');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [MOCK_POLL];
      }
    }
    return [MOCK_POLL];
  });
  const [loading, setLoading] = useState(true);

  // Sauvegarder dans le cache local
  useEffect(() => {
    localStorage.setItem('astt_polls_cache', JSON.stringify(polls));
  }, [polls]);

  // Synchronisation Firestore en temps réel si configuré
  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = subscribeToPollsList((firestorePolls) => {
        if (firestorePolls && firestorePolls.length > 0) {
          setPolls(firestorePolls);
        }
        setLoading(false);
      });
      return unsubscribe;
    } catch (e) {
      console.warn('Mode hors-ligne ou Firestore non connecté:', e);
      setLoading(false);
    }
  }, []);

  const createNewPoll = async (pollData: any, slots: any[]): Promise<string> => {
    const newId = `poll-${Date.now()}`;
    const newPoll: Poll = {
      id: newId,
      title: pollData.title,
      type: pollData.trainingType || pollData.type,
      periodType: '1_week',
      startDate: pollData.startDate,
      endDate: pollData.endDate,
      deadline: pollData.deadline,
      minParticipants: pollData.minParticipants || 4,
      maxParticipants: pollData.maxParticipants || 8,
      discordChannel: pollData.discordChannel || '',
      targetRoles: pollData.targetRoles || ['Joueur ASTT'],
      targetUsers: [],
      excludedUsers: pollData.excludedUsers || [],
      status: 'OPEN',
      slots: slots.map((s, idx) => ({
        id: s.id || `slot-${idx}-${Date.now()}`,
        dateStr: s.dateStr,
        dayName: s.dayName,
        startTime: s.startTime,
        endTime: s.endTime,
        disponibles: [],
        incertains: [],
        indisponibles: [],
        selectedIds: [],
        waitlistIds: [],
      })),
    };

    // Mise à jour optimiste locale
    setPolls(prev => [newPoll, ...prev]);

    // Firestore si configuré
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      try {
        const firestoreId = await createPoll(newPoll, slots);
        return firestoreId;
      } catch (err) {
        console.error('Erreur Firestore createPoll:', err);
      }
    }
    return newId;
  };

  const removePoll = async (pollId: string): Promise<void> => {
    // Mise à jour locale immédiate
    setPolls(prev => prev.filter(p => p.id !== pollId));

    // Firestore si configuré
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      try {
        await deletePoll(pollId);
      } catch (err) {
        console.error('Erreur Firestore deletePoll:', err);
      }
    }
  };

  const cancelExistingPoll = async (pollId: string): Promise<void> => {
    // Mise à jour locale immédiate
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, status: 'CANCELLED' } : p));

    // Firestore si configuré
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      try {
        await cancelPoll(pollId);
      } catch (err) {
        console.error('Erreur Firestore cancelPoll:', err);
      }
    }
  };

  const saveVotes = async (pollId: string, votes: Record<string, ResponseStatus>): Promise<void> => {
    if (!userProfile) return;

    // Mise à jour locale immédiate
    setPolls(prev =>
      prev.map(poll => {
        if (poll.id !== pollId) return poll;
        const updatedSlots = poll.slots.map(slot => {
          const vote = votes[slot.id];
          const newDispo = slot.disponibles.filter(id => id !== userProfile.id);
          const newIncertain = slot.incertains.filter(id => id !== userProfile.id);
          const newIndispo = slot.indisponibles.filter(id => id !== userProfile.id);

          if (vote === 'DISPONIBLE') newDispo.push(userProfile.id);
          else if (vote === 'INCERTAIN') newIncertain.push(userProfile.id);
          else if (vote === 'INDISPONIBLE') newIndispo.push(userProfile.id);

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

    // Firestore si configuré
    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      try {
        await submitResponses(pollId, userProfile.id, userProfile.name, votes);
      } catch (err) {
        console.error('Erreur Firestore submitResponses:', err);
      }
    }
  };

  const updateSelection = async (
    pollId: string,
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ): Promise<void> => {
    setPolls(prev =>
      prev.map(poll => {
        if (poll.id !== pollId) return poll;
        const updatedSlots = poll.slots.map(slot => {
          if (slot.id !== slotId) return slot;
          return { ...slot, selectedIds, waitlistIds };
        });
        return { ...poll, slots: updatedSlots };
      })
    );

    if (import.meta.env.VITE_FIREBASE_API_KEY) {
      try {
        await updateSlotSelection(pollId, slotId, selectedIds, waitlistIds);
      } catch (err) {
        console.error('Erreur Firestore updateSlotSelection:', err);
      }
    }
  };

  return (
    <PollsContext.Provider
      value={{
        polls,
        loading,
        createNewPoll,
        removePoll,
        cancelExistingPoll,
        saveVotes,
        updateSelection,
      }}
    >
      {children}
    </PollsContext.Provider>
  );
};

export const usePolls = () => useContext(PollsContext);
