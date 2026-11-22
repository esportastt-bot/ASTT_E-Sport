import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  GuildMember,
  GuildRole,
  Poll,
  ResponseStatus,
  SlotProfile,
  TrainingType,
} from '../types';
import {
  subscribeToPollsList,
  subscribeToResponses,
  subscribeToPollSlots,
  createPoll,
  deletePoll,
  cancelPoll,
  submitResponses,
  updateSlotSelection,
  updateSlotDetails,
  batchSavePollSlots,
  addSlotToPoll,
  deleteSlotFromPoll,
  updatePoll,
  type SlotVotesMap,
  type PollSlotSelection,
} from '../firebase/polls';
import { subscribeToAllMembers, type MemberProfile } from '../firebase/members';
import {
  subscribeToSlotProfiles,
  saveSlotProfile,
  deleteSlotProfile,
} from '../firebase/slotProfiles';
import { fetchDiscordGuildDirectory } from '../firebase/auth';
import { useAuth } from './AuthContext';

interface PollsContextType {
  polls: Poll[];
  membersMap: Record<string, MemberProfile>;
  voterNames: Record<string, string>;
  guildMembers: GuildMember[];
  guildRoles: GuildRole[];
  directoryLoading: boolean;
  directoryError: string | null;
  refreshDirectory: () => Promise<void>;
  slotProfiles: SlotProfile[];
  saveProfile: (profile: Omit<SlotProfile, 'id'> & { id?: string }) => Promise<string>;
  removeProfile: (profileId: string) => Promise<void>;
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
  saveVotes: (
    pollId: string,
    votes: Record<string, ResponseStatus>,
    desiredGames: number | null
  ) => Promise<void>;
  updateSelection: (
    pollId: string,
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ) => Promise<void>;
  updateSingleSlot: (
    pollId: string,
    slotId: string,
    changes: Partial<{
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments: Record<string, 'A' | 'B'>;
      cancelled: boolean;
      cancelReason: string;
      startTime: string;
      endTime: string;
      minParticipants: number;
      maxParticipants: number;
      trainingType: TrainingType;
    }>
  ) => Promise<void>;
  saveSlotPlanBatch: (
    pollId: string,
    updates: Array<{
      slotId: string;
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments?: Record<string, 'A' | 'B'>;
      cancelled?: boolean;
      cancelReason?: string;
      minParticipants?: number;
      maxParticipants?: number;
      trainingType?: TrainingType;
    }>
  ) => Promise<void>;
  addSlot: (
    pollId: string,
    slot: {
      dateStr: string;
      dayName: string;
      startTime: string;
      endTime: string;
      minParticipants?: number;
      maxParticipants?: number;
      trainingType?: TrainingType;
    }
  ) => Promise<string>;
  removeSlot: (pollId: string, slotId: string) => Promise<void>;
}

const PollsContext = createContext<PollsContextType>({
  polls: [],
  membersMap: {},
  voterNames: {},
  guildMembers: [],
  guildRoles: [],
  directoryLoading: false,
  directoryError: null,
  refreshDirectory: async () => {},
  slotProfiles: [],
  saveProfile: async () => '',
  removeProfile: async () => {},
  loading: false,
  error: null,
  createNewPoll: async () => '',
  removePoll: async () => {},
  cancelExistingPoll: async () => {},
  updateExistingPoll: async () => {},
  saveVotes: async () => {},
  updateSelection: async () => {},
  updateSingleSlot: async () => {},
  saveSlotPlanBatch: async () => {},
  addSlot: async () => '',
  removeSlot: async () => {},
});

export const PollsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, userProfile } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [membersMap, setMembersMap] = useState<Record<string, MemberProfile>>({});
  const [voterNames, setVoterNames] = useState<Record<string, string>>({});
  const [guildMembers, setGuildMembers] = useState<GuildMember[]>([]);
  const [guildRoles, setGuildRoles] = useState<GuildRole[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [slotProfiles, setSlotProfiles] = useState<SlotProfile[]>([]);
  const [loadedForUid, setLoadedForUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const responsesUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const slotsUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const responsesCacheRef = useRef<Map<string, SlotVotesMap>>(new Map());
  const desiredGamesCacheRef = useRef<Map<string, Record<string, number | null>>>(new Map());
  const slotsCacheRef = useRef<Map<string, PollSlotSelection[]>>(new Map());

  const refreshDirectory = useCallback(async () => {
    if (!firebaseUser) return;
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const { roles, members } = await fetchDiscordGuildDirectory();
      setGuildRoles(roles);
      setGuildMembers(members);
    } catch (err: any) {
      console.warn('Erreur annuaire Discord:', err);
      setDirectoryError(err?.message || "Impossible de charger la liste des membres Discord.");
    } finally {
      setDirectoryLoading(false);
    }
  }, [firebaseUser]);

  // Charger l'annuaire Discord complet dès connexion
  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    fetchDiscordGuildDirectory()
      .then(({ roles, members }) => {
        if (!active) return;
        setGuildRoles(roles);
        setGuildMembers(members);
        setDirectoryError(null);
      })
      .catch((err: any) => {
        if (!active) return;
        console.warn('Erreur annuaire Discord:', err);
        setDirectoryError(
          err?.message || "Impossible de charger la liste des membres Discord."
        );
      });
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  // Synchronisation Firestore (sondages accessibles, membres, profils de créneaux)
  useEffect(() => {
    const cleanupAllSubListeners = () => {
      responsesUnsubsRef.current.forEach((unsub) => unsub());
      responsesUnsubsRef.current.clear();
      slotsUnsubsRef.current.forEach((unsub) => unsub());
      slotsUnsubsRef.current.clear();
      responsesCacheRef.current.clear();
      desiredGamesCacheRef.current.clear();
      slotsCacheRef.current.clear();
    };

    if (!firebaseUser || !userProfile) {
      cleanupAllSubListeners();
      return;
    }

    let cancelled = false;
    let hadListenerError = false;

    const unsubMembers = subscribeToAllMembers((members) => {
      if (!cancelled) setMembersMap(members);
    });

    const unsubProfiles = subscribeToSlotProfiles((profiles) => {
      if (!cancelled) setSlotProfiles(profiles);
    });

    const unsubPolls = subscribeToPollsList(
      userProfile.id,
      userProfile.isAdmin,
      (firestorePolls, initialVoterNames) => {
        if (cancelled) return;

        if (Object.keys(initialVoterNames).length > 0) {
          setVoterNames((prev) => ({ ...prev, ...initialVoterNames }));
        }

        const activeIds = new Set(firestorePolls.map((p) => p.id));

        for (const [pid, unsub] of responsesUnsubsRef.current.entries()) {
          if (!activeIds.has(pid)) {
            unsub();
            responsesUnsubsRef.current.delete(pid);
            responsesCacheRef.current.delete(pid);
            desiredGamesCacheRef.current.delete(pid);
          }
        }
        for (const [pid, unsub] of slotsUnsubsRef.current.entries()) {
          if (!activeIds.has(pid)) {
            unsub();
            slotsUnsubsRef.current.delete(pid);
            slotsCacheRef.current.delete(pid);
          }
        }

        const mergedPolls = firestorePolls.map((poll) => {
          const cachedSlots = slotsCacheRef.current.get(poll.id);
          const cachedVotes = responsesCacheRef.current.get(poll.id);
          const cachedDesired = desiredGamesCacheRef.current.get(poll.id);

          const baseSlots = cachedSlots
            ? cachedSlots.map((cs) => {
                const existing = poll.slots.find((s) => s.id === cs.id);
                return {
                  id: cs.id,
                  dateStr: cs.dateStr,
                  dayName: cs.dayName,
                  startTime: cs.startTime,
                  endTime: cs.endTime,
                  minParticipants: cs.minParticipants ?? existing?.minParticipants,
                  maxParticipants: cs.maxParticipants ?? existing?.maxParticipants,
                  trainingType: cs.trainingType ?? existing?.trainingType,
                  disponibles: existing?.disponibles || [],
                  incertains: existing?.incertains || [],
                  indisponibles: existing?.indisponibles || [],
                  selectedIds: cs.selectedIds,
                  waitlistIds: cs.waitlistIds,
                  teamAssignments: cs.teamAssignments,
                  cancelled: cs.cancelled,
                  cancelReason: cs.cancelReason,
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

          return {
            ...poll,
            desiredGamesByUser: cachedDesired
              ? { ...poll.desiredGamesByUser, ...cachedDesired }
              : poll.desiredGamesByUser,
            slots: slotsWithVotes,
          };
        });

        setPolls(mergedPolls);
        if (!hadListenerError) {
          setError(null);
        }
        setLoadedForUid(firebaseUser.uid);

        for (const poll of firestorePolls) {
          if (!responsesUnsubsRef.current.has(poll.id)) {
            const unsubResp = subscribeToResponses(
              poll.id,
              (slotVotes, names, desiredByUser) => {
                if (cancelled) return;
                responsesCacheRef.current.set(poll.id, slotVotes);
                desiredGamesCacheRef.current.set(poll.id, desiredByUser);
                if (Object.keys(names).length > 0) {
                  setVoterNames((prev) => ({ ...prev, ...names }));
                }
                setPolls((prev) =>
                  prev.map((p) => {
                    if (p.id !== poll.id) return p;
                    return {
                      ...p,
                      desiredGamesByUser: desiredByUser,
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
              }
            );
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
                        minParticipants: cs.minParticipants ?? prevSlot?.minParticipants,
                        maxParticipants: cs.maxParticipants ?? prevSlot?.maxParticipants,
                        trainingType: cs.trainingType ?? prevSlot?.trainingType,
                        disponibles: v?.disponibles ?? prevSlot?.disponibles ?? [],
                        incertains: v?.incertains ?? prevSlot?.incertains ?? [],
                        indisponibles: v?.indisponibles ?? prevSlot?.indisponibles ?? [],
                        selectedIds: cs.selectedIds,
                        waitlistIds: cs.waitlistIds,
                        teamAssignments: cs.teamAssignments,
                        cancelled: cs.cancelled,
                        cancelReason: cs.cancelReason,
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
        hadListenerError = true;
        setError(err.message);
        setLoadedForUid(firebaseUser.uid);
      }
    );

    return () => {
      cancelled = true;
      unsubMembers();
      unsubProfiles();
      unsubPolls();
      cleanupAllSubListeners();
    };
  }, [firebaseUser, userProfile]);

  const requireAuth = () => {
    if (!firebaseUser || !userProfile) {
      throw new Error('Vous devez être connecté avec Discord pour effectuer cette action.');
    }
    return userProfile;
  };

  const saveProfile = async (
    profile: Omit<SlotProfile, 'id'> & { id?: string }
  ): Promise<string> => {
    const user = requireAuth();
    return saveSlotProfile({
      ...profile,
      createdBy: profile.createdBy || user.id,
      createdByName: profile.createdByName || user.name,
    });
  };

  const removeProfile = async (profileId: string): Promise<void> => {
    requireAuth();
    await deleteSlotProfile(profileId);
  };

  const createNewPoll = async (pollData: any, slots: any[]): Promise<string> => {
    const user = requireAuth();

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
      targetRoles: pollData.targetRoles || [],
      targetUsers: pollData.targetUsers || [],
      excludedUsers: pollData.excludedUsers || [],
      createdBy: user.id,
      createdByName: user.name,
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

  const saveVotes = async (
    pollId: string,
    votes: Record<string, ResponseStatus>,
    desiredGames: number | null
  ): Promise<void> => {
    const user = requireAuth();

    await submitResponses(pollId, user.id, user.name, votes, desiredGames);

    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;
        const updatedSlots = poll.slots.map((slot) => {
          const vote = votes[slot.id];
          const newDispo = slot.disponibles.filter((id) => id !== user.id);
          const newIncertain = slot.incertains.filter((id) => id !== user.id);
          const newIndispo = slot.indisponibles.filter((id) => id !== user.id);

          if (vote === 'DISPONIBLE') newDispo.push(user.id);
          else if (vote === 'INCERTAIN') newIncertain.push(user.id);
          else if (vote === 'INDISPONIBLE') newIndispo.push(user.id);

          return {
            ...slot,
            disponibles: newDispo,
            incertains: newIncertain,
            indisponibles: newIndispo,
          };
        });
        return {
          ...poll,
          desiredGamesByUser: {
            ...poll.desiredGamesByUser,
            [user.id]: desiredGames,
          },
          slots: updatedSlots,
        };
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

  const updateSingleSlot = async (
    pollId: string,
    slotId: string,
    changes: Partial<{
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments: Record<string, 'A' | 'B'>;
      cancelled: boolean;
      cancelReason: string;
      startTime: string;
      endTime: string;
      minParticipants: number;
      maxParticipants: number;
      trainingType: TrainingType;
    }>
  ): Promise<void> => {
    requireAuth();
    await updateSlotDetails(pollId, slotId, changes);

    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;
        return {
          ...poll,
          slots: poll.slots.map((slot) =>
            slot.id === slotId ? { ...slot, ...changes } : slot
          ),
        };
      })
    );
  };

  const saveSlotPlanBatch = async (
    pollId: string,
    updates: Array<{
      slotId: string;
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments?: Record<string, 'A' | 'B'>;
      cancelled?: boolean;
      cancelReason?: string;
      minParticipants?: number;
      maxParticipants?: number;
      trainingType?: TrainingType;
    }>
  ): Promise<void> => {
    requireAuth();
    await batchSavePollSlots(pollId, updates);

    const byId = new Map(updates.map((u) => [u.slotId, u]));
    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) return poll;
        return {
          ...poll,
          slots: poll.slots.map((slot) => {
            const u = byId.get(slot.id);
            if (!u) return slot;
            return {
              ...slot,
              selectedIds: u.selectedIds,
              waitlistIds: u.waitlistIds,
              teamAssignments: u.teamAssignments ?? slot.teamAssignments,
              cancelled: u.cancelled ?? slot.cancelled,
              cancelReason: u.cancelReason ?? slot.cancelReason,
              minParticipants: u.minParticipants ?? slot.minParticipants,
              maxParticipants: u.maxParticipants ?? slot.maxParticipants,
              trainingType: u.trainingType ?? slot.trainingType,
            };
          }),
        };
      })
    );
  };

  const addSlot = async (
    pollId: string,
    slot: {
      dateStr: string;
      dayName: string;
      startTime: string;
      endTime: string;
      minParticipants?: number;
      maxParticipants?: number;
      trainingType?: TrainingType;
    }
  ): Promise<string> => {
    requireAuth();
    return addSlotToPoll(pollId, slot);
  };

  const removeSlot = async (pollId: string, slotId: string): Promise<void> => {
    requireAuth();
    await deleteSlotFromPoll(pollId, slotId);
    setPolls((prev) =>
      prev.map((poll) =>
        poll.id === pollId
          ? { ...poll, slots: poll.slots.filter((s) => s.id !== slotId) }
          : poll
      )
    );
  };

  const isAuthenticated = Boolean(firebaseUser && userProfile);
  const visiblePolls = isAuthenticated ? polls : [];
  const visibleMembers = isAuthenticated ? membersMap : {};
  const visibleVoterNames = isAuthenticated ? voterNames : {};
  const isLoading = Boolean(firebaseUser && userProfile && loadedForUid !== firebaseUser.uid);

  return (
    <PollsContext.Provider
      value={{
        polls: visiblePolls,
        membersMap: visibleMembers,
        voterNames: visibleVoterNames,
        guildMembers: isAuthenticated ? guildMembers : [],
        guildRoles: isAuthenticated ? guildRoles : [],
        directoryLoading,
        directoryError,
        refreshDirectory,
        slotProfiles: isAuthenticated ? slotProfiles : [],
        saveProfile,
        removeProfile,
        loading: isLoading,
        error,
        createNewPoll,
        removePoll,
        cancelExistingPoll,
        updateExistingPoll,
        saveVotes,
        updateSelection,
        updateSingleSlot,
        saveSlotPlanBatch,
        addSlot,
        removeSlot,
      }}
    >
      {children}
    </PollsContext.Provider>
  );
};

export const usePolls = () => useContext(PollsContext);
