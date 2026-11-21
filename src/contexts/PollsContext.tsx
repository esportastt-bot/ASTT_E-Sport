import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Poll, ResponseStatus } from '../types';
import {
  subscribeToPollsList,
  subscribeToResponses,
  subscribeToPollSlots,
  createPoll,
  deletePoll,
  cancelPoll,
  submitResponses,
  updateSlotSelection,
  updatePoll,
  type SlotVotesMap,
  type PollSlotSelection,
} from '../firebase/polls';
import { subscribeToAllMembers, type MemberProfile } from '../firebase/members';
import { useAuth } from './AuthContext';

interface PollsContextType {
  polls: Poll[];
  membersMap: Record<string, MemberProfile>;
  voterNames: Record<string, string>;
  loading: boolean;
  error: string | null;
  createNewPoll: (pollData: any, slots: any[]) => Promise<string>;
  removePoll: (pollId: string) => Promise<void>;
  cancelExistingPoll: (pollId: string) => Promise<void>;
  updateExistingPoll: (
    pollId: string,
    changes: Partial<{
      title: string;
      deadline: string;
      minParticipants: number;
      maxParticipants: number;
      status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    }>
  ) => Promise<void>;
  saveVotes: (pollId: string, votes: Record<string, ResponseStatus>) => Promise<void>;
  updateSelection: (
    pollId: string,
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ) => Promise<void>;
}

const PollsContext = createContext<PollsContextType>({
  polls: [],
  membersMap: {},
  voterNames: {},
  loading: false,
  error: null,
  createNewPoll: async () => '',
  removePoll: async () => {},
  cancelExistingPoll: async () => {},
  updateExistingPoll: async () => {},
  saveVotes: async () => {},
  updateSelection: async () => {},
});

export const PollsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, userProfile } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, MemberProfile>>({});
  const [voterNames, setVoterNames] = useState<Record<string, string>>({});
  const [loadedForUid, setLoadedForUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Souscriptions temps réel par sondage + caches pour éviter l'écrasement entre snapshots
  const responsesUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const slotsUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const responsesCacheRef = useRef<Map<string, SlotVotesMap>>(new Map());
  const slotsCacheRef = useRef<Map<string, PollSlotSelection[]>>(new Map());

  useEffect(() => {
    const cleanupAllSubListeners = () => {
      responsesUnsubsRef.current.forEach((unsub) => unsub());
      responsesUnsubsRef.current.clear();
      slotsUnsubsRef.current.forEach((unsub) => unsub());
      slotsUnsubsRef.current.clear();
      responsesCacheRef.current.clear();
      slotsCacheRef.current.clear();
    };

    if (!firebaseUser) {
      cleanupAllSubListeners();
      return;
    }

    let cancelled = false;

    const unsubMembers = subscribeToAllMembers((members) => {
      if (!cancelled) setMembersMap(members);
    });

    const unsubPolls = subscribeToPollsList(
      (firestorePolls, initialVoterNames) => {
        if (cancelled) return;

        if (Object.keys(initialVoterNames).length > 0) {
          setVoterNames((prev) => ({ ...prev, ...initialVoterNames }));
        }

        const activeIds = new Set(firestorePolls.map((p) => p.id));

        // Nettoyer les listeners des sondages supprimés
        for (const [pid, unsub] of responsesUnsubsRef.current.entries()) {
          if (!activeIds.has(pid)) {
            unsub();
            responsesUnsubsRef.current.delete(pid);
            responsesCacheRef.current.delete(pid);
          }
        }
        for (const [pid, unsub] of slotsUnsubsRef.current.entries()) {
          if (!activeIds.has(pid)) {
            unsub();
            slotsUnsubsRef.current.delete(pid);
            slotsCacheRef.current.delete(pid);
          }
        }

        // Fusionner avec les caches temps réel déjà reçus
        const mergedPolls = firestorePolls.map((poll) => {
          const cachedSlots = slotsCacheRef.current.get(poll.id);
          const cachedVotes = responsesCacheRef.current.get(poll.id);

          const baseSlots = cachedSlots
            ? cachedSlots.map((cs) => {
                const existing = poll.slots.find((s) => s.id === cs.id);
                return {
                  id: cs.id,
                  dateStr: cs.dateStr,
                  dayName: cs.dayName,
                  startTime: cs.startTime,
                  endTime: cs.endTime,
                  disponibles: existing?.disponibles || [],
                  incertains: existing?.incertains || [],
                  indisponibles: existing?.indisponibles || [],
                  selectedIds: cs.selectedIds,
                  waitlistIds: cs.waitlistIds,
                };
              })
            : poll.slots;

          const slotsWithVotes = cachedVotes
            ? baseSlots.map((s) => {
                const v = cachedVotes[s.id] || {
                  disponibles: [],
                  incertains: [],
                  indisponibles: [],
                };
                return {
                  ...s,
                  disponibles: v.disponibles,
                  incertains: v.incertains,
                  indisponibles: v.indisponibles,
                };
              })
            : baseSlots;

          return { ...poll, slots: slotsWithVotes };
        });

        setPolls(mergedPolls);
        setError(null);
        setLoadedForUid(firebaseUser.uid);

        // Souscrire aux réponses et aux créneaux de chaque sondage
        for (const poll of firestorePolls) {
          if (!responsesUnsubsRef.current.has(poll.id)) {
            const unsubResp = subscribeToResponses(poll.id, (slotVotes, names) => {
              if (cancelled) return;
              responsesCacheRef.current.set(poll.id, slotVotes);
              if (Object.keys(names).length > 0) {
                setVoterNames((prev) => ({ ...prev, ...names }));
              }
              setPolls((prev) =>
                prev.map((p) => {
                  if (p.id !== poll.id) return p;
                  return {
                    ...p,
                    slots: p.slots.map((s) => {
                      const v = slotVotes[s.id] || {
                        disponibles: [],
                        incertains: [],
                        indisponibles: [],
                      };
                      return {
                        ...s,
                        disponibles: v.disponibles,
                        incertains: v.incertains,
                        indisponibles: v.indisponibles,
                      };
                    }),
                  };
                })
              );
            });
            responsesUnsubsRef.current.set(poll.id, unsubResp);
          }

          if (!slotsUnsubsRef.current.has(poll.id)) {
            const unsubSlots = subscribeToPollSlots(poll.id, (updatedSlotSelections) => {
              if (cancelled) return;
              slotsCacheRef.current.set(poll.id, updatedSlotSelections);
              setPolls((prev) =>
                prev.map((p) => {
                  if (p.id !== poll.id) return p;
                  const cachedVotes = responsesCacheRef.current.get(poll.id);
                  return {
                    ...p,
                    slots: updatedSlotSelections.map((cs) => {
                      const prevSlot = p.slots.find((s) => s.id === cs.id);
                      const v = cachedVotes?.[cs.id];
                      return {
                        id: cs.id,
                        dateStr: cs.dateStr,
                        dayName: cs.dayName,
                        startTime: cs.startTime,
                        endTime: cs.endTime,
                        disponibles: v?.disponibles ?? prevSlot?.disponibles ?? [],
                        incertains: v?.incertains ?? prevSlot?.incertains ?? [],
                        indisponibles: v?.indisponibles ?? prevSlot?.indisponibles ?? [],
                        selectedIds: cs.selectedIds,
                        waitlistIds: cs.waitlistIds,
                      };
                    }),
                  };
                })
              );
            });
            slotsUnsubsRef.current.set(poll.id, unsubSlots);
          }
        }
      },
      (err) => {
        if (cancelled) return;
        setError(err.message);
        setLoadedForUid(firebaseUser.uid);
      }
    );

    return () => {
      cancelled = true;
      unsubMembers();
      unsubPolls();
      cleanupAllSubListeners();
    };
  }, [firebaseUser]);

  const requireAuth = () => {
    if (!firebaseUser || !userProfile) {
      throw new Error('Vous devez être connecté avec Discord pour effectuer cette action.');
    }
  };

  const createNewPoll = async (pollData: any, slots: any[]): Promise<string> => {
    requireAuth();

    const payload = {
      title: pollData.title,
      type: pollData.trainingType || pollData.type,
      periodType: '1_week' as const,
      startDate: pollData.startDate,
      endDate: pollData.endDate,
      deadline: pollData.deadline,
      minParticipants: pollData.minParticipants || 4,
      maxParticipants: pollData.maxParticipants || 8,
      discordChannel: pollData.discordChannel || '',
      targetRoles: pollData.targetRoles || ['Membre'],
      targetUsers: pollData.targetUsers || [],
      excludedUsers: pollData.excludedUsers || [],
      status: 'OPEN' as const,
    };

    const firestoreId = await createPoll(payload, slots);
    return firestoreId;
  };

  const removePoll = async (pollId: string): Promise<void> => {
    requireAuth();
    await deletePoll(pollId);
    setPolls((prev) => prev.filter((p) => p.id !== pollId));
  };

  const cancelExistingPoll = async (pollId: string): Promise<void> => {
    requireAuth();
    await cancelPoll(pollId);
    setPolls((prev) => prev.map((p) => (p.id === pollId ? { ...p, status: 'CANCELLED' } : p)));
  };

  const updateExistingPoll = async (
    pollId: string,
    changes: Partial<{
      title: string;
      deadline: string;
      minParticipants: number;
      maxParticipants: number;
      status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    }>
  ): Promise<void> => {
    requireAuth();
    await updatePoll(pollId, changes);
    setPolls((prev) =>
      prev.map((p) => (p.id === pollId ? { ...p, ...changes } : p))
    );
  };

  const saveVotes = async (pollId: string, votes: Record<string, ResponseStatus>): Promise<void> => {
    requireAuth();
    if (!userProfile) return;

    await submitResponses(pollId, userProfile.id, userProfile.name, votes);

    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;
        const updatedSlots = poll.slots.map((slot) => {
          const vote = votes[slot.id];
          const newDispo = slot.disponibles.filter((id) => id !== userProfile.id);
          const newIncertain = slot.incertains.filter((id) => id !== userProfile.id);
          const newIndispo = slot.indisponibles.filter((id) => id !== userProfile.id);

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
  };

  const updateSelection = async (
    pollId: string,
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ): Promise<void> => {
    requireAuth();
    await updateSlotSelection(pollId, slotId, selectedIds, waitlistIds);

    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;
        return {
          ...poll,
          slots: poll.slots.map((slot) =>
            slot.id === slotId ? { ...slot, selectedIds, waitlistIds } : slot
          ),
        };
      })
    );
  };

  const visiblePolls = firebaseUser ? polls : [];
  const visibleMembers = firebaseUser ? membersMap : {};
  const visibleVoterNames = firebaseUser ? voterNames : {};
  const isLoading = Boolean(firebaseUser && loadedForUid !== firebaseUser.uid);

  return (
    <PollsContext.Provider
      value={{
        polls: visiblePolls,
        membersMap: visibleMembers,
        voterNames: visibleVoterNames,
        loading: isLoading,
        error,
        createNewPoll,
        removePoll,
        cancelExistingPoll,
        updateExistingPoll,
        saveVotes,
        updateSelection,
      }}
    >
      {children}
    </PollsContext.Provider>
  );
};

export const usePolls = () => useContext(PollsContext);
