import React, { useEffect, useMemo, useState } from 'react';
import {
  TRAINING_TYPE_BADGE_CLASSES,
  TRAINING_TYPE_LABELS,
  type GuildMember,
  type Poll,
  type TrainingType,
  type UserProfile,
} from '../../types';
import type { MemberProfile } from '../../firebase/members';
import {
  Trophy, AlertTriangle, CheckCircle, Clock,
  ChevronDown, UserMinus, UserCheck, Shield, ArrowLeft,
  Sparkles, Loader2, X, Users, Calendar, Ban, Trash2,
  Plus, Copy, Check, Lock, Eye, Pencil, RotateCcw,
  Send, UserPlus, Search
} from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import { formatFRDateTime, formatShortFRDate } from '../../utils/dateUtils';
import {
  computeMonthlyAssignedCounts,
  generateOptimalSchedule,
  type ScheduleOptimizationResult,
} from '../../utils/planningOptimizer';
import {
  notifyNewPollMembersByDiscord,
  notifyPlanningDecisionByDiscord,
  notifyPollRemindersByDiscord,
  type DiscordNotifyResult,
} from '../../firebase/discordNotifications';

interface OrganizerCockpitScreenProps {
  polls: Poll[];
  selectedPollId: string | null;
  onSelectPollId: (pollId: string) => void;
  currentUser: UserProfile;
  guildMembers: GuildMember[];
  membersMap: Record<string, MemberProfile>;
  voterNames: Record<string, string>;
  onDirtyChange?: (dirty: boolean) => void;
  onUpdateSlot: (
    pollId: string,
    slotId: string,
    changes: Partial<{
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments: Record<string, 'A' | 'B'>;
      cancelled: boolean;
      cancelReason: string;
      minParticipants: number;
      maxParticipants: number;
      trainingType: TrainingType;
    }>
  ) => Promise<void>;
  onSaveSlotPlanBatch: (
    pollId: string,
    updates: Array<{
      slotId: string;
      selectedIds: string[];
      waitlistIds: string[];
      teamAssignments?: Record<string, 'A' | 'B'>;
      minParticipants?: number;
      maxParticipants?: number;
      trainingType?: TrainingType;
    }>
  ) => Promise<void>;
  onAddSlot: (
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
  onRemoveSlot: (pollId: string, slotId: string) => Promise<void>;
  onUpdateTargetUsers: (pollId: string, targetUsers: string[]) => Promise<void>;
  onCreatePoll: () => void;
  onBack?: () => void;
}

const TRAINING_TYPES: TrainingType[] = ['ASTT', 'MIX', 'SCRIM', 'ENTRAINEMENT'];

interface SlotDraft {
  selectedIds: string[];
  waitlistIds: string[];
  teamAssignments: Record<string, 'A' | 'B'>;
  minParticipants: number;
  maxParticipants: number;
  trainingType: TrainingType;
}

const FR_WEEKDAYS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

function getFrenchDayName(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Jour';
  return FR_WEEKDAYS[d.getDay()] || 'Jour';
}

export const OrganizerCockpitScreen: React.FC<OrganizerCockpitScreenProps> = ({
  polls,
  selectedPollId,
  onSelectPollId,
  currentUser,
  guildMembers,
  membersMap,
  voterNames,
  onDirtyChange,
  onUpdateSlot,
  onSaveSlotPlanBatch,
  onAddSlot,
  onRemoveSlot,
  onUpdateTargetUsers,
  onCreatePoll,
  onBack,
}) => {
  const poll = polls.find((p) => p.id === selectedPollId) || polls[0] || null;

  const [activeTab, setActiveTab] = useState<'planning' | 'members'>('planning');
  const [sortMode, setSortMode] = useState<'rank' | 'date'>('rank');
  const [memberFilter, setMemberFilter] = useState<
    'all' | 'responded' | 'missing' | 'unfulfilled'
  >('all');

  // Accordéon strict : 1 seul créneau déplié à la fois, tous repliés par défaut
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);

  // Brouillons par créneau
  const [draftsBySlot, setDraftsBySlot] = useState<Record<string, SlotDraft>>({});
  const [optimizationBanner, setOptimizationBanner] =
    useState<ScheduleOptimizationResult['summary'] | null>(null);
  const [proposedSchedule, setProposedSchedule] =
    useState<ScheduleOptimizationResult | null>(null);
  const [pendingPollSwitchId, setPendingPollSwitchId] = useState<string | null>(null);

  // Modale Ajouter / Supprimer des membres
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [draftTargetUserIds, setDraftTargetUserIds] = useState<string[]>([]);
  const [membersSearch, setMembersSearch] = useState('');
  const [notifyAddedMembers, setNotifyAddedMembers] = useState(true);
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersModalError, setMembersModalError] = useState<string | null>(null);

  const [savingAll, setSavingAll] = useState(false);
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Outils rapides
  const [showAddSlotForm, setShowAddSlotForm] = useState(false);
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('20:30');
  const [newSlotEnd, setNewSlotEnd] = useState('21:50');
  const [newSlotMin, setNewSlotMin] = useState(4);
  const [newSlotMax, setNewSlotMax] = useState(8);
  const [newSlotType, setNewSlotType] = useState<TrainingType>('ASTT');
  const [addingSlot, setAddingSlot] = useState(false);

  const [cancellingSlotId, setCancellingSlotId] = useState<string | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('Salle de jeu indisponible');
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState<string | null>(null);

  const [copiedType, setCopiedType] = useState<'reminders' | null>(null);

  // Modales MP Discord (Planning décidé & Relance retardataires)
  const [showPlanningDmModal, setShowPlanningDmModal] = useState(false);
  const [sendingPlanningDm, setSendingPlanningDm] = useState(false);
  const [planningDmResult, setPlanningDmResult] = useState<DiscordNotifyResult | null>(null);
  const [planningDmError, setPlanningDmError] = useState<string | null>(null);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [sendingReminderDm, setSendingReminderDm] = useState(false);
  const [reminderDmResult, setReminderDmResult] = useState<DiscordNotifyResult | null>(null);
  const [reminderDmError, setReminderDmError] = useState<string | null>(null);

  const dirtySlotIds = useMemo(() => {
    if (!poll) return [];
    return Object.keys(draftsBySlot).filter((sid) =>
      poll.slots.some((s) => s.id === sid)
    );
  }, [draftsBySlot, poll]);

  useEffect(() => {
    onDirtyChange?.(dirtySlotIds.length > 0);
  }, [dirtySlotIds.length, onDirtyChange]);

  const getUserInfo = (userId: string) => {
    const guildM = guildMembers.find((m) => m.discordId === userId);
    if (guildM) {
      return {
        name: guildM.displayName,
        avatar: guildM.avatarUrl,
        roles: guildM.roleNames,
      };
    }
    const dbMember = membersMap[userId];
    if (dbMember) {
      return {
        name: dbMember.displayName,
        avatar: dbMember.avatarUrl,
        roles: dbMember.discordRoles,
      };
    }
    if (userId === currentUser.id) {
      return {
        name: currentUser.name,
        avatar: currentUser.avatar,
        roles: currentUser.discordRoles,
      };
    }
    return {
      name: voterNames[userId] || `Membre ${userId.slice(-4)}`,
      avatar: '',
      roles: [],
    };
  };

  const monthlyOtherGames = useMemo(() => {
    if (!poll) return {};
    return computeMonthlyAssignedCounts(polls, poll);
  }, [polls, poll]);

  if (!poll) {
    return (
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-12 text-center space-y-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 space-y-4">
          <h2 className="text-xl font-bold text-white">Espace Pilotage</h2>
          <p className="text-sm text-slate-400">
            Aucun sondage n'est actuellement accessible pour ce compte.
          </p>
          <div className="flex items-center justify-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl"
              >
                Retour à l'accueil
              </button>
            )}
            <button
              type="button"
              onClick={onCreatePoll}
              className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
            >
              Créer un sondage
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = currentUser.isAdmin || poll.createdBy === currentUser.id;

  const resolvedSlots = poll.slots.map((slot) => {
    const draft = draftsBySlot[slot.id];
    const slotMin = draft?.minParticipants ?? slot.minParticipants ?? poll.minParticipants;
    const slotMax = draft?.maxParticipants ?? slot.maxParticipants ?? poll.maxParticipants;
    const slotType: TrainingType = draft?.trainingType ?? slot.trainingType ?? poll.type;
    return {
      ...slot,
      minParticipants: slotMin,
      maxParticipants: slotMax,
      trainingType: slotType,
      selectedIds: draft ? draft.selectedIds : slot.selectedIds,
      waitlistIds: draft ? draft.waitlistIds : slot.waitlistIds,
      teamAssignments: draft ? draft.teamAssignments : slot.teamAssignments || {},
    };
  });

  const orderedSlots = [...resolvedSlots].sort((a, b) => {
    if (sortMode === 'date') {
      return a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime);
    }
    if (Boolean(a.cancelled) !== Boolean(b.cancelled)) {
      return a.cancelled ? 1 : -1;
    }
    if (b.disponibles.length !== a.disponibles.length) {
      return b.disponibles.length - a.disponibles.length;
    }
    return b.incertains.length - a.incertains.length;
  });

  const assignedInThisPoll: Record<string, number> = {};
  const confirmedAssignedInThisPoll: Record<string, number> = {};
  for (const s of resolvedSlots) {
    if (s.cancelled) continue;
    const isConfirmedSession = s.selectedIds.length >= s.minParticipants;
    for (const uid of s.selectedIds) {
      assignedInThisPoll[uid] = (assignedInThisPoll[uid] || 0) + 1;
      if (isConfirmedSession) {
        confirmedAssignedInThisPoll[uid] = (confirmedAssignedInThisPoll[uid] || 0) + 1;
      }
    }
  }

  const allRelevantUserIds = Array.from(
    new Set<string>([
      ...(poll.targetUsers || []),
      ...Object.keys(poll.desiredGamesByUser || {}),
      ...poll.slots.flatMap((s) => [
        ...s.disponibles,
        ...s.incertains,
        ...s.indisponibles,
        ...s.selectedIds,
      ]),
    ])
  );

  const respondedUserIds = new Set<string>(Object.keys(poll.desiredGamesByUser || {}));
  poll.slots.forEach((s) => {
    s.disponibles.forEach((id) => respondedUserIds.add(id));
    s.incertains.forEach((id) => respondedUserIds.add(id));
    s.indisponibles.forEach((id) => respondedUserIds.add(id));
  });

  const targetCount = poll.targetUsers?.length || allRelevantUserIds.length;
  const respondedTargetCount = (poll.targetUsers?.length
    ? poll.targetUsers
    : allRelevantUserIds
  ).filter((id) => respondedUserIds.has(id)).length;
  const missingResponders = (poll.targetUsers || []).filter(
    (id) => !respondedUserIds.has(id)
  );

  // Destinataires du planning : UNIQUEMENT ceux ayant répondu Présent ou Indéterminé sur >= 1 créneau
  const presentUserSet = new Set<string>(poll.slots.flatMap((s) => s.disponibles));
  const uncertainUserSet = new Set<string>(poll.slots.flatMap((s) => s.incertains));
  const presentOrUncertainIds = Array.from(
    new Set<string>([...presentUserSet, ...uncertainUserSet])
  ).sort((a, b) => getUserInfo(a).name.localeCompare(getUserInfo(b).name, 'fr'));

  const activeSlots = resolvedSlots.filter((s) => !s.cancelled);
  const cancelledSlotsCount = resolvedSlots.length - activeSlots.length;
  const viableSlotsCount = activeSlots.filter(
    (s) => s.disponibles.length >= s.minParticipants
  ).length;
  const plannedSessionsCount = activeSlots.filter(
    (s) => s.selectedIds.length >= s.minParticipants
  ).length;

  let requestingCount = 0;
  let satisfiedCount = 0;
  for (const uid of allRelevantUserIds) {
    const desired = poll.desiredGamesByUser?.[uid];
    if (typeof desired === 'number' && desired > 0) {
      requestingCount++;
      if ((confirmedAssignedInThisPoll[uid] || 0) >= desired) satisfiedCount++;
    }
  }

  const showToast = (msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => {
      setSavedFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Accordéon exclusif : ouvrir un créneau ferme automatiquement le précédent
  const toggleSlotExpanded = (slotId: string) => {
    setExpandedSlotId((prev) => (prev === slotId ? null : slotId));
  };

  const switchPollNow = (targetId: string) => {
    setDraftsBySlot({});
    setOptimizationBanner(null);
    setProposedSchedule(null);
    setShowMembersModal(false);
    setMembersModalError(null);
    setExpandedSlotId(null);
    setPendingPollSwitchId(null);
    setShowPlanningDmModal(false);
    setPlanningDmResult(null);
    setPlanningDmError(null);
    setShowReminderModal(false);
    setReminderDmResult(null);
    setReminderDmError(null);
    onDirtyChange?.(false);
    onSelectPollId(targetId);
  };

  const handlePollSelectChange = (targetId: string) => {
    if (targetId === poll.id) return;
    if (dirtySlotIds.length > 0) {
      setPendingPollSwitchId(targetId);
      return;
    }
    switchPollNow(targetId);
  };

  // Helpers d'édition de brouillon
  const updateSlotDraft = (slotId: string, updater: (cur: SlotDraft) => SlotDraft) => {
    if (!canEdit) return;
    const base = poll.slots.find((s) => s.id === slotId);
    const current: SlotDraft = draftsBySlot[slotId] || {
      selectedIds: base?.selectedIds || [],
      waitlistIds: base?.waitlistIds || [],
      teamAssignments: base?.teamAssignments || {},
      minParticipants: base?.minParticipants ?? poll.minParticipants,
      maxParticipants: base?.maxParticipants ?? poll.maxParticipants,
      trainingType: base?.trainingType ?? poll.type,
    };
    setDraftsBySlot((prev) => ({
      ...prev,
      [slotId]: updater(current),
    }));
    setActionError(null);
  };

  const moveToSelected = (slotId: string, userId: string) => {
    updateSlotDraft(slotId, (cur) => ({
      ...cur,
      selectedIds: cur.selectedIds.includes(userId)
        ? cur.selectedIds
        : [...cur.selectedIds, userId],
      waitlistIds: cur.waitlistIds.filter((id) => id !== userId),
    }));
  };

  const moveToWaitlist = (slotId: string, userId: string) => {
    updateSlotDraft(slotId, (cur) => {
      const nextTeams = { ...cur.teamAssignments };
      delete nextTeams[userId];
      return {
        ...cur,
        selectedIds: cur.selectedIds.filter((id) => id !== userId),
        waitlistIds: cur.waitlistIds.includes(userId)
          ? cur.waitlistIds
          : [...cur.waitlistIds, userId],
        teamAssignments: nextTeams,
      };
    });
  };

  const removeFromAssignment = (slotId: string, userId: string) => {
    updateSlotDraft(slotId, (cur) => {
      const nextTeams = { ...cur.teamAssignments };
      delete nextTeams[userId];
      return {
        ...cur,
        selectedIds: cur.selectedIds.filter((id) => id !== userId),
        waitlistIds: cur.waitlistIds.filter((id) => id !== userId),
        teamAssignments: nextTeams,
      };
    });
  };

  const updateSlotMinMaxDraft = (
    slotId: string,
    field: 'minParticipants' | 'maxParticipants',
    value: number
  ) => {
    updateSlotDraft(slotId, (cur) => ({
      ...cur,
      [field]: value,
    }));
  };

  const updateSlotTrainingTypeDraft = (slotId: string, trainingType: TrainingType) => {
    updateSlotDraft(slotId, (cur) => ({
      ...cur,
      trainingType,
    }));
  };

  // Ouvre la popup de prévisualisation SANS modifier le planning tant que l'organisateur ne valide pas
  const handleRunOptimizer = () => {
    if (!canEdit) return;
    const result = generateOptimalSchedule(poll, monthlyOtherGames);
    setProposedSchedule(result);
    setActionError(null);
  };

  const handleConfirmApplyOptimization = () => {
    if (!canEdit || !proposedSchedule) return;
    const nextDrafts: Record<string, SlotDraft> = {};

    Object.values(proposedSchedule.slotProposals).forEach((prop) => {
      const base = poll.slots.find((s) => s.id === prop.slotId);
      nextDrafts[prop.slotId] = {
        selectedIds: prop.selectedIds,
        waitlistIds: prop.waitlistIds,
        teamAssignments: {},
        minParticipants: base?.minParticipants ?? poll.minParticipants,
        maxParticipants: base?.maxParticipants ?? poll.maxParticipants,
        trainingType: base?.trainingType ?? poll.type,
      };
    });

    setDraftsBySlot(nextDrafts);
    setOptimizationBanner(proposedSchedule.summary);
    setProposedSchedule(null);
    setActiveTab('planning');
    setActionError(null);
  };

  const openMembersModal = () => {
    if (!canEdit) return;
    setDraftTargetUserIds(Array.from(new Set(poll.targetUsers || [])));
    setMembersSearch('');
    setNotifyAddedMembers(true);
    setMembersModalError(null);
    setShowMembersModal(true);
  };

  const handleSaveTargetUsers = async () => {
    if (!canEdit || savingMembers) return;
    if (draftTargetUserIds.length === 0) {
      setMembersModalError('Sélectionnez au moins un membre concerné pour ce sondage.');
      return;
    }
    setSavingMembers(true);
    setMembersModalError(null);
    const prevSet = new Set(poll.targetUsers || []);
    const addedIds = draftTargetUserIds.filter((id) => !prevSet.has(id));
    try {
      await onUpdateTargetUsers(poll.id, draftTargetUserIds);
      let dmSuffix = '';
      if (notifyAddedMembers && addedIds.length > 0) {
        try {
          const dm = await notifyNewPollMembersByDiscord(poll.id, addedIds);
          dmSuffix = ` (${dm.sentCount}/${addedIds.length} MP envoyé(s))`;
        } catch {
          dmSuffix = ' (échec envoi MP aux nouveaux membres)';
        }
      }
      setShowMembersModal(false);
      showToast(`Membres du sondage mis à jour${dmSuffix} !`);
    } catch (err: any) {
      setMembersModalError(err?.message || 'Impossible de mettre à jour les membres.');
    } finally {
      setSavingMembers(false);
    }
  };

  const handleDiscardAllDrafts = () => {
    setDraftsBySlot({});
    setOptimizationBanner(null);
    onDirtyChange?.(false);
  };

  const handleSaveSingleSlot = async (slotId: string) => {
    const draft = draftsBySlot[slotId];
    if (!canEdit || !draft || savingSlotId) return;
    if (draft.minParticipants > draft.maxParticipants) {
      setActionError('Le minimum ne peut pas dépasser le maximum sur ce créneau.');
      return;
    }
    setSavingSlotId(slotId);
    setActionError(null);
    try {
      await onUpdateSlot(poll.id, slotId, {
        selectedIds: draft.selectedIds,
        waitlistIds: draft.waitlistIds,
        teamAssignments: draft.teamAssignments,
        minParticipants: draft.minParticipants,
        maxParticipants: draft.maxParticipants,
        trainingType: draft.trainingType,
      });
      setDraftsBySlot((prev) => {
        const copy = { ...prev };
        delete copy[slotId];
        return copy;
      });
      showToast('Composition du créneau enregistrée !');
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'enregistrer ce créneau.");
    } finally {
      setSavingSlotId(null);
    }
  };

  const saveAllDrafts = async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (dirtySlotIds.length === 0) return true;
    if (savingAll) return false;
    for (const sid of dirtySlotIds) {
      const d = draftsBySlot[sid];
      if (d.minParticipants > d.maxParticipants) {
        setActionError('Un créneau modifié a un minimum supérieur à son maximum.');
        return false;
      }
    }
    setSavingAll(true);
    setActionError(null);
    try {
      const updates = dirtySlotIds.map((sid) => ({
        slotId: sid,
        selectedIds: draftsBySlot[sid].selectedIds,
        waitlistIds: draftsBySlot[sid].waitlistIds,
        teamAssignments: draftsBySlot[sid].teamAssignments,
        minParticipants: draftsBySlot[sid].minParticipants,
        maxParticipants: draftsBySlot[sid].maxParticipants,
        trainingType: draftsBySlot[sid].trainingType,
      }));
      await onSaveSlotPlanBatch(poll.id, updates);
      setDraftsBySlot({});
      setOptimizationBanner(null);
      onDirtyChange?.(false);
      showToast(`Planning enregistré (${updates.length} créneau(x) mis à jour) !`);
      return true;
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'enregistrer le planning.");
      return false;
    } finally {
      setSavingAll(false);
    }
  };

  const handleSaveAllDrafts = () => {
    void saveAllDrafts();
  };

  const handleConfirmSendPlanningDm = async () => {
    if (!canEdit || sendingPlanningDm || presentOrUncertainIds.length === 0) return;
    setPlanningDmError(null);
    setPlanningDmResult(null);
    if (dirtySlotIds.length > 0) {
      const saved = await saveAllDrafts();
      if (!saved) {
        setPlanningDmError("Impossible d'enregistrer vos modifications avant l'envoi.");
        return;
      }
    }
    setSendingPlanningDm(true);
    try {
      const res = await notifyPlanningDecisionByDiscord(poll.id, presentOrUncertainIds);
      setPlanningDmResult(res);
    } catch (err: any) {
      setPlanningDmError(err?.message || "Impossible d'envoyer les MP Discord.");
    } finally {
      setSendingPlanningDm(false);
    }
  };

  const handleConfirmSendReminderDm = async () => {
    if (!canEdit || sendingReminderDm || missingResponders.length === 0) return;
    setReminderDmError(null);
    setReminderDmResult(null);
    setSendingReminderDm(true);
    try {
      const res = await notifyPollRemindersByDiscord(poll.id, missingResponders);
      setReminderDmResult(res);
    } catch (err: any) {
      setReminderDmError(err?.message || "Impossible d'envoyer la relance en MP Discord.");
    } finally {
      setSendingReminderDm(false);
    }
  };

  const handleToggleCancelSlot = async (slotId: string, currentlyCancelled: boolean) => {
    if (!canEdit) return;
    setActionError(null);
    try {
      if (currentlyCancelled) {
        await onUpdateSlot(poll.id, slotId, { cancelled: false, cancelReason: '' });
        showToast('Créneau réactivé.');
      } else {
        await onUpdateSlot(poll.id, slotId, {
          cancelled: true,
          cancelReason: cancelReasonInput.trim() || 'Salle de jeu indisponible',
        });
        setCancellingSlotId(null);
        showToast('Créneau marqué comme annulé.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Impossible de modifier le statut du créneau.');
    }
  };

  const handleConfirmDeleteSlot = async (slotId: string) => {
    if (!canEdit) return;
    setActionError(null);
    try {
      await onRemoveSlot(poll.id, slotId);
      setConfirmDeleteSlotId(null);
      if (expandedSlotId === slotId) setExpandedSlotId(null);
      setDraftsBySlot((prev) => {
        const copy = { ...prev };
        delete copy[slotId];
        return copy;
      });
      showToast('Créneau supprimé définitivement.');
    } catch (err: any) {
      setActionError(err?.message || 'Impossible de supprimer ce créneau.');
    }
  };

  const handleCreateExtraSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newSlotDate || !newSlotStart || !newSlotEnd || addingSlot) return;
    if (newSlotMin > newSlotMax) {
      setActionError('Le minimum ne peut pas dépasser le maximum pour le nouveau créneau.');
      return;
    }
    setAddingSlot(true);
    setActionError(null);
    try {
      await onAddSlot(poll.id, {
        dateStr: newSlotDate,
        dayName: getFrenchDayName(newSlotDate),
        startTime: newSlotStart,
        endTime: newSlotEnd,
        minParticipants: newSlotMin,
        maxParticipants: newSlotMax,
        trainingType: newSlotType,
      });
      setShowAddSlotForm(false);
      showToast('Nouveau créneau ajouté au sondage.');
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'ajouter ce créneau.");
    } finally {
      setAddingSlot(false);
    }
  };

  const handleCopyReminders = async () => {
    if (missingResponders.length === 0) return;
    const mentions = missingResponders.map((id) => `<@${id}>`).join(' ');
    const text = `⏰ Rappel : merci d'indiquer vos disponibilités sur **${poll.title}** !\n${mentions}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType('reminders');
      setTimeout(() => setCopiedType((v) => (v === 'reminders' ? null : v)), 2500);
    } catch {
      window.prompt('Copiez ce message de relance Discord :', text);
    }
  };

  const memberRows = allRelevantUserIds
    .map((uid) => {
      const info = getUserInfo(uid);
      const hasResponded = respondedUserIds.has(uid);
      const dispoCount = activeSlots.filter((s) => s.disponibles.includes(uid)).length;
      const incertainCount = activeSlots.filter((s) => s.incertains.includes(uid)).length;
      const desired = poll.desiredGamesByUser?.[uid];
      const assignedHere = assignedInThisPoll[uid] || 0;
      const monthTotal = (monthlyOtherGames[uid] || 0) + assignedHere;
      const unfulfilled =
        typeof desired === 'number' && desired > 0 && assignedHere < desired;

      return {
        uid,
        ...info,
        hasResponded,
        dispoCount,
        incertainCount,
        desired,
        assignedHere,
        monthTotal,
        unfulfilled,
      };
    })
    .filter((row) => {
      if (memberFilter === 'responded') return row.hasResponded;
      if (memberFilter === 'missing') return !row.hasResponded;
      if (memberFilter === 'unfulfilled') return row.unfulfilled;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const renderQuotaBadge = (uid: string) => {
    const assigned = assignedInThisPoll[uid] || 0;
    const desired = poll.desiredGamesByUser?.[uid];
    if (desired === undefined) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 shrink-0">
          {assigned}/?
        </span>
      );
    }
    if (desired === null) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-300 shrink-0">
          {assigned}/∞
        </span>
      );
    }
    const over = assigned > desired;
    const met = assigned === desired && desired > 0;
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${
          over
            ? 'bg-amber-950/70 text-amber-300 border-amber-700/60'
            : met
            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
            : 'bg-slate-800 text-slate-300 border-slate-700'
        }`}
        title={`Attribué : ${assigned} / Souhaité : ${desired}`}
      >
        {assigned}/{desired}
      </span>
    );
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">

      {/* Top Navigation & Sélecteur de sondage */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition group self-start"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
            <span>Retour à l'accueil</span>
          </button>
        )}

        <div className="flex flex-col xs:flex-row sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <select
            value={poll.id}
            onChange={(e) => handlePollSelectChange(e.target.value)}
            className="w-full sm:w-auto sm:max-w-md bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500"
          >
            {polls.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.status === 'OPEN' ? 'Ouvert' : p.status === 'CLOSED' ? 'Clôturé' : 'Annulé'}]{' '}
                {p.title}
              </option>
            ))}
          </select>

          {canEdit ? (
            <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 self-start sm:self-auto shrink-0">
              <Pencil className="w-3 h-3" />
              Mode Édition ({currentUser.isAdmin ? 'Admin' : 'Organisateur'})
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 self-start sm:self-auto shrink-0">
              <Eye className="w-3 h-3 text-indigo-400" />
              Lecture seule
            </span>
          )}
        </div>
      </div>

      {/* Header Sondage + KPIs */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {Array.from(
                new Set(
                  (resolvedSlots.filter((s) => !s.cancelled).length > 0
                    ? resolvedSlots.filter((s) => !s.cancelled)
                    : resolvedSlots
                  ).map((s) => s.trainingType || poll.type)
                )
              ).map((t) => (
                <span
                  key={t}
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-lg border ${TRAINING_TYPE_BADGE_CLASSES[t] || 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40'}`}
                >
                  {TRAINING_TYPE_LABELS[t] || t}
                </span>
              ))}
              <span className="text-xs text-slate-400">
                Créé par <strong className="text-slate-200">{poll.createdByName || 'Organisateur'}</strong>
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight border-l-4 border-indigo-500 pl-3 sm:pl-4 break-words">
              {poll.title}
            </h2>
          </div>

          <div className="text-xs text-slate-400 space-y-1 sm:text-right">
            <p className="flex items-center sm:justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Clôture : {formatFRDateTime(poll.deadline)}</span>
            </p>
            <p>
              Défaut : Min <strong className="text-white">{poll.minParticipants}</strong> | Max{' '}
              <strong className="text-white">{poll.maxParticipants}</strong> joueurs
            </p>
          </div>
        </div>

        {/* 4 Cartes KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              Participation
            </p>
            <p className="text-lg font-bold text-white">
              {respondedTargetCount} / {targetCount}
            </p>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{
                  width: `${targetCount > 0 ? Math.min(100, Math.round((respondedTargetCount / targetCount) * 100)) : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Créneaux viables
            </p>
            <p className="text-lg font-bold text-white">
              {viableSlotsCount} / {activeSlots.length}
            </p>
            <p className="text-[10px] text-slate-400">
              {cancelledSlotsCount > 0 ? `${cancelledSlotsCount} annulé(s)` : 'Tous actifs'}
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Séances planifiées
            </p>
            <p className="text-lg font-bold text-white">{plannedSessionsCount}</p>
            <p className="text-[10px] text-slate-400">Avec titulaires ≥ min</p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-indigo-300" />
              Objectifs parties
            </p>
            <p className="text-lg font-bold text-white">
              {satisfiedCount} / {requestingCount}
            </p>
            <p className="text-[10px] text-slate-400">Membres satisfaits (créneaux ≥ min)</p>
          </div>
        </div>

        {/* Barre d'outils (ergonomie structurée mobile 2×2 + ligne desktop) */}
        {canEdit && (
          <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleRunOptimizer}
              className="w-full sm:w-auto min-h-[42px] bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl transition active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Proposer une configuration optimale</span>
            </button>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setShowAddSlotForm((v) => !v);
                  if (!newSlotDate) setNewSlotDate(poll.startDate || '');
                  setNewSlotMin(poll.minParticipants);
                  setNewSlotMax(poll.maxParticipants);
                  setNewSlotType(poll.type);
                }}
                className="min-h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Créneau</span>
                  <span className="hidden sm:inline">Ajouter un créneau</span>
                </span>
              </button>

              <button
                type="button"
                onClick={openMembersModal}
                className="min-h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
                title="Ajouter ou supprimer des membres concernés par ce sondage"
              >
                <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Membres ({poll.targetUsers?.length || 0})</span>
                  <span className="hidden sm:inline">
                    Gérer les membres ({poll.targetUsers?.length || 0})
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={presentOrUncertainIds.length === 0}
                onClick={() => {
                  setPlanningDmResult(null);
                  setPlanningDmError(null);
                  setShowPlanningDmModal(true);
                }}
                title={
                  presentOrUncertainIds.length === 0
                    ? 'Aucun membre n’a encore répondu Présent ou Indéterminé'
                    : `Envoyer le détail du planning en MP Discord à ${presentOrUncertainIds.length} membre(s)`
                }
                className="min-h-[42px] bg-sky-600/20 hover:bg-sky-600/30 disabled:opacity-45 disabled:cursor-not-allowed text-sky-200 text-xs font-semibold px-3 py-2 rounded-xl border border-sky-500/40 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Send className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Planning MP ({presentOrUncertainIds.length})</span>
                  <span className="hidden sm:inline">
                    Envoyer le planning en MP ({presentOrUncertainIds.length})
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={missingResponders.length === 0}
                onClick={() => {
                  setReminderDmResult(null);
                  setReminderDmError(null);
                  setShowReminderModal(true);
                }}
                title={
                  missingResponders.length === 0
                    ? 'Tous les membres ciblés ont déjà répondu'
                    : `Relancer les ${missingResponders.length} membre(s) qui n'ont pas encore répondu`
                }
                className={`min-h-[42px] text-xs font-medium px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 transition ${
                  missingResponders.length === 0
                    ? 'bg-slate-900/70 border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700 active:scale-95'
                }`}
              >
                <Send
                  className={`w-3.5 h-3.5 shrink-0 ${
                    missingResponders.length === 0 ? 'text-slate-600' : 'text-amber-400'
                  }`}
                />
                <span className="truncate">
                  <span className="sm:hidden">Relancer ({missingResponders.length})</span>
                  <span className="hidden sm:inline">
                    Relancer retardataires ({missingResponders.length})
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Formulaire inline Ajout de créneau */}
        {canEdit && showAddSlotForm && (
          <form
            onSubmit={handleCreateExtraSlot}
            className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 flex flex-wrap items-end gap-3 text-xs animate-fade-slide-up"
          >
            <div className="space-y-1">
              <label className="text-slate-400 block">Date</label>
              <input
                type="date"
                required
                value={newSlotDate}
                onChange={(e) => setNewSlotDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 block">Début</label>
              <input
                type="time"
                required
                value={newSlotStart}
                onChange={(e) => setNewSlotStart(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 block">Fin</label>
              <input
                type="time"
                required
                value={newSlotEnd}
                onChange={(e) => setNewSlotEnd(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 block">Type</label>
              <select
                value={newSlotType}
                onChange={(e) => setNewSlotType(e.target.value as TrainingType)}
                className={`bg-slate-900 border rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none ${TRAINING_TYPE_BADGE_CLASSES[newSlotType]}`}
              >
                {TRAINING_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-slate-900 text-white">
                    {TRAINING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 block">Min</label>
              <input
                type="number"
                min={2}
                max={20}
                value={newSlotMin}
                onChange={(e) => setNewSlotMin(parseInt(e.target.value, 10) || 2)}
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 block">Max</label>
              <input
                type="number"
                min={2}
                max={20}
                value={newSlotMax}
                onChange={(e) => setNewSlotMax(parseInt(e.target.value, 10) || 8)}
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={addingSlot}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
            >
              {addingSlot && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Ajouter</span>
            </button>
          </form>
        )}
      </div>

      {/* Feedbacks d'erreur réseau ou confirmation de sauvegarde */}
      {actionError && (
        <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center justify-between gap-2 animate-fade-slide-up">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            {actionError}
          </span>
          <button onClick={() => setActionError(null)} className="text-red-300 hover:text-white">
            Fermer
          </button>
        </div>
      )}

      {savedFeedback && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs rounded-xl p-3 flex items-center gap-2 animate-fade-slide-up">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}

      {/* Bandeau informatif calme pour la proposition optimale */}
      {canEdit && optimizationBanner && (
        <div className="bg-indigo-950/75 border border-indigo-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-fade-slide-up">
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              Proposition optimale prête : {optimizationBanner.plannedSessionsCount} séance(s) planifiée(s),{' '}
              {optimizationBanner.satisfiedPlayersCount}/{optimizationBanner.totalRequestingPlayers} souhait(s) couvert(s).
            </p>
            {optimizationBanner.unfulfilledPlayers.length > 0 && (
              <p className="text-slate-300 text-[11px]">
                Objectif partiel pour :{' '}
                {optimizationBanner.unfulfilledPlayers
                  .map((u) => `${getUserInfo(u.userId).name} (${u.assigned}/${u.desired})`)
                  .join(', ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDiscardAllDrafts}
              disabled={savingAll}
              className="px-3 py-2 text-xs text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveAllDrafts}
              disabled={savingAll}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition flex items-center gap-1.5 shadow"
            >
              {savingAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Enregistrer le planning</span>
            </button>
          </div>
        </div>
      )}

      {/* Onglets Cockpit & Tri */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('planning')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'planning'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Planning & Équipes ({resolvedSlots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'members'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Suivi membres ({allRelevantUserIds.length})
          </button>
        </div>

        {activeTab === 'planning' && (
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs ml-auto">
            <button
              type="button"
              onClick={() => setSortMode('rank')}
              className={`px-3 py-1.5 rounded-lg transition ${
                sortMode === 'rank' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
              }`}
            >
              Par classement
            </button>
            <button
              type="button"
              onClick={() => setSortMode('date')}
              className={`px-3 py-1.5 rounded-lg transition ${
                sortMode === 'date' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
              }`}
            >
              Par date
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: PLANNING & ÉQUIPES (ACCORDÉON EXCLUSIF + CELLULE ÉPURÉE EN 3 ZONES) */}
      {activeTab === 'planning' && (
        <div className="space-y-3">
          {orderedSlots.map((slot, index) => {
            const isExpanded = expandedSlotId === slot.id;
            const isCancelled = Boolean(slot.cancelled);
            const slotMin = slot.minParticipants;
            const slotMax = slot.maxParticipants;
            const nbDispo = slot.disponibles.length;
            const nbIncertain = slot.incertains.length;
            const nbIndispo = slot.indisponibles.length;
            const isExceeded = nbDispo > slotMax;
            const isMinReached = nbDispo >= slotMin;
            const placesRestantes = Math.max(0, slotMax - nbDispo);

            const unassignedDisponibles = slot.disponibles.filter(
              (id) => !slot.selectedIds.includes(id) && !slot.waitlistIds.includes(id)
            );
            const unassignedIncertains = slot.incertains.filter(
              (id) => !slot.selectedIds.includes(id) && !slot.waitlistIds.includes(id)
            );

            const isDirty = Boolean(draftsBySlot[slot.id]);
            const isSavingThis = savingSlotId === slot.id;
            const totalAvailablePoolCount =
              unassignedDisponibles.length + unassignedIncertains.length;

            const fillPct =
              slotMax > 0 ? Math.min(100, Math.round((slot.selectedIds.length / slotMax) * 100)) : 0;
            const fillColor =
              slot.selectedIds.length > slotMax
                ? 'bg-amber-500'
                : slot.selectedIds.length >= slotMin
                ? 'bg-emerald-500'
                : 'bg-indigo-500';

            return (
              <div
                key={slot.id}
                className={`bg-slate-900/95 border rounded-2xl overflow-hidden shadow-lg transition duration-200 ${
                  isCancelled
                    ? 'border-red-900/50 opacity-75'
                    : isExpanded
                    ? 'border-indigo-500/60 ring-1 ring-indigo-500/20'
                    : isExceeded
                    ? 'border-amber-500/40'
                    : isMinReached
                    ? 'border-emerald-500/30'
                    : 'border-slate-800'
                }`}
              >
                {/* En-tête accordéon cliquable */}
                <button
                  type="button"
                  onClick={() => toggleSlotExpanded(slot.id)}
                  aria-expanded={isExpanded}
                  className="w-full text-left p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-800/40 transition select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isCancelled
                          ? 'bg-red-950 text-red-400 border border-red-800/60'
                          : index === 0 && sortMode === 'rank'
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                          : index === 1 && sortMode === 'rank'
                          ? 'bg-slate-300 text-slate-950'
                          : index === 2 && sortMode === 'rank'
                          ? 'bg-amber-700/80 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isCancelled ? <Ban className="w-4 h-4" /> : `#${index + 1}`}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                          {slot.dayName} {formatShortFRDate(slot.dateStr)}
                        </span>
                        <span className="text-xs text-indigo-300 font-mono font-medium">
                          ({slot.startTime} - {slot.endTime})
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TRAINING_TYPE_BADGE_CLASSES[slot.trainingType] || 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40'}`}
                        >
                          {TRAINING_TYPE_LABELS[slot.trainingType] || slot.trainingType}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                          Min {slotMin} · Max {slotMax}
                        </span>
                        {slot.selectedIds.length > 0 && !isCancelled && (
                          <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            {slot.selectedIds.length} titulaire(s)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{nbDispo} dispo</span>
                        <span>•</span>
                        <span>{nbIncertain} incertain</span>
                        <span>•</span>
                        <span>{nbIndispo} indispo</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                    {isCancelled ? (
                      <span className="bg-red-950/70 border border-red-800/60 text-red-300 text-xs px-2.5 py-1 rounded-xl font-medium">
                        Annulé — {slot.cancelReason || 'Indisponible'}
                      </span>
                    ) : isExceeded ? (
                      <span className="bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs px-2.5 py-1 rounded-xl font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Dépassement (+{nbDispo - slotMax})
                      </span>
                    ) : isMinReached ? (
                      <span className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs px-2.5 py-1 rounded-xl font-medium flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        {placesRestantes === 0 ? 'Complet' : `${placesRestantes} place(s) libre(s)`}
                      </span>
                    ) : (
                      <span className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-2.5 py-1 rounded-xl font-medium">
                        Manque {slotMin - nbDispo} joueur(s)
                      </span>
                    )}

                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-300 shrink-0 ${
                        isExpanded ? 'rotate-180 text-indigo-300' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Corps accordéon animé (3 zones épurées) */}
                <div className="accordion-content" data-open={isExpanded ? 'true' : 'false'}>
                  <div className="accordion-inner">
                    <div className="border-t border-slate-800 bg-slate-950/70 p-3.5 sm:p-5 space-y-4">

                      {/* ZONE 1 : Barre d'actions compacte du créneau (Organisateur / Admin) */}
                      {canEdit && (
                        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px]">
                              <label className="flex items-center gap-1 text-slate-300">
                                <span className="text-slate-400">Type</span>
                                <select
                                  value={slot.trainingType}
                                  onChange={(e) =>
                                    updateSlotTrainingTypeDraft(
                                      slot.id,
                                      e.target.value as TrainingType
                                    )
                                  }
                                  className={`bg-slate-900 border rounded px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none ${TRAINING_TYPE_BADGE_CLASSES[slot.trainingType]}`}
                                  aria-label="Type de session"
                                >
                                  {TRAINING_TYPES.map((t) => (
                                    <option key={t} value={t} className="bg-slate-900 text-white">
                                      {TRAINING_TYPE_LABELS[t]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span className="text-slate-400">Min</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={slotMin}
                                  onChange={(e) =>
                                    updateSlotMinMaxDraft(
                                      slot.id,
                                      'minParticipants',
                                      parseInt(e.target.value, 10) || 2
                                    )
                                  }
                                  className="w-11 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center text-white font-mono"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span className="text-slate-400">Max</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={slotMax}
                                  onChange={(e) =>
                                    updateSlotMinMaxDraft(
                                      slot.id,
                                      'maxParticipants',
                                      parseInt(e.target.value, 10) || 8
                                    )
                                  }
                                  className="w-11 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center text-white font-mono"
                                />
                              </label>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
                            {isCancelled ? (
                              <button
                                type="button"
                                onClick={() => handleToggleCancelSlot(slot.id, true)}
                                className="text-[11px] bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 px-2.5 py-1.5 rounded-lg border border-emerald-700/60 flex items-center gap-1.5 transition active:scale-95"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Réactiver</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setCancellingSlotId((prev) => (prev === slot.id ? null : slot.id))
                                }
                                className="text-[11px] bg-slate-800 hover:bg-amber-950/60 text-amber-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Salle indispo</span>
                              </button>
                            )}

                            {confirmDeleteSlotId === slot.id ? (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-red-300">Supprimer ?</span>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDeleteSlot(slot.id)}
                                  className="bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-lg font-semibold"
                                >
                                  Oui
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSlotId(null)}
                                  className="bg-slate-800 text-slate-300 px-2 py-1 rounded-lg"
                                >
                                  Non
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSlotId(slot.id)}
                                className="text-[11px] text-slate-400 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-950/40 flex items-center gap-1 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Supprimer</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Confirmation annulation avec motif */}
                      {canEdit && cancellingSlotId === slot.id && !isCancelled && (
                        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs animate-fade-slide-up">
                          <input
                            type="text"
                            value={cancelReasonInput}
                            onChange={(e) => setCancelReasonInput(e.target.value)}
                            placeholder="Motif (ex: Salle de jeu indisponible)"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleToggleCancelSlot(slot.id, false)}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3.5 py-2 rounded-lg"
                          >
                            Confirmer l'annulation
                          </button>
                        </div>
                      )}

                      {/* ZONE 2 : Composition (Titulaires vs File d'attente & Pool à placer) */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Carte Gauche : Titulaires */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Titulaires ({slot.selectedIds.length} / {slotMax})
                              </span>
                            </div>

                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${fillColor}`}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            {slot.selectedIds.map((userId) => {
                              const info = getUserInfo(userId);
                              const isUncertain = slot.incertains.includes(userId);
                              return (
                                <div
                                  key={userId}
                                  className={`min-h-[44px] rounded-xl px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 border ${
                                    isUncertain
                                      ? 'bg-slate-950/95 border-dashed border-amber-500/45 text-amber-200/80'
                                      : 'bg-slate-950 border-slate-800 text-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={isUncertain ? 'opacity-70' : ''}>
                                      <UserAvatar avatar={info.avatar} name={info.name} size="sm" />
                                    </div>
                                    <span className="truncate font-medium">{info.name}</span>
                                    {isUncertain && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 shrink-0">
                                        ? Incertain
                                      </span>
                                    )}
                                    {renderQuotaBadge(userId)}
                                  </div>

                                  {canEdit && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => moveToWaitlist(slot.id, userId)}
                                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1.5 rounded-lg transition flex items-center gap-1 active:scale-95"
                                        title="Mettre en file d'attente"
                                      >
                                        <UserMinus className="w-3 h-3" />
                                        <span className="hidden xs:inline">Attente</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeFromAssignment(slot.id, userId)}
                                        className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/40 transition"
                                        title="Retirer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {slot.selectedIds.length === 0 && (
                              <p className="text-xs text-slate-400 italic py-4 text-center">
                                Aucun titulaire sélectionné pour le moment
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Carte Droite : File d'attente + Disponibles à placer */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-4">
                          {/* Liste d'attente */}
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              Liste d'attente ({slot.waitlistIds.length})
                            </span>

                            <div className="space-y-1.5">
                              {slot.waitlistIds.map((userId) => {
                                const info = getUserInfo(userId);
                                return (
                                  <div
                                    key={userId}
                                    className="min-h-[44px] bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 flex items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <UserAvatar avatar={info.avatar} name={info.name} size="sm" />
                                      <span className="truncate font-medium">{info.name}</span>
                                      {renderQuotaBadge(userId)}
                                    </div>
                                    {canEdit && (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => moveToSelected(slot.id, userId)}
                                          className="text-[11px] bg-slate-800 hover:bg-emerald-950 text-emerald-300 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 active:scale-95"
                                          title="Passer titulaire"
                                        >
                                          <UserCheck className="w-3 h-3" />
                                          <span>Titulaire</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeFromAssignment(slot.id, userId)}
                                          className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/40 transition"
                                          title="Retirer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {slot.waitlistIds.length === 0 && (
                                <p className="text-xs text-slate-500 italic py-2 text-center">
                                  Aucun joueur en attente
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Disponibles & Incertains réunis (incertains sombres + bordure ambre pointillée) */}
                          <div className="pt-3 border-t border-slate-800 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-emerald-300">
                                Disponibles à placer ({totalAvailablePoolCount})
                              </span>
                              {unassignedIncertains.length > 0 && (
                                <span className="text-[10px] text-amber-300/90">
                                  dont {unassignedIncertains.length} incertain(s)
                                </span>
                              )}
                            </div>

                            {totalAvailablePoolCount > 0 ? (
                              <div className="space-y-1.5">
                                {[...unassignedDisponibles, ...unassignedIncertains].map((userId) => {
                                  const info = getUserInfo(userId);
                                  const isUnc = unassignedIncertains.includes(userId);
                                  return (
                                    <div
                                      key={userId}
                                      className={`rounded-xl px-2.5 py-2 text-xs flex flex-col xs:flex-row sm:flex-row sm:items-center justify-between gap-2 border ${
                                        isUnc
                                          ? 'bg-slate-950/95 border-dashed border-amber-500/50 text-slate-400'
                                          : 'bg-emerald-950/25 border-emerald-500/35 text-white'
                                      }`}
                                      title={isUnc ? 'A répondu Incertain sur ce créneau' : 'Disponible'}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isUnc ? (
                                          <span className="w-2 h-2 rounded-full border border-amber-400 shrink-0" />
                                        ) : (
                                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow shadow-emerald-400/50" />
                                        )}
                                        <div className={isUnc ? 'opacity-60 grayscale shrink-0' : 'shrink-0'}>
                                          <UserAvatar avatar={info.avatar} name={info.name} size="sm" />
                                        </div>
                                        <span className={`truncate font-medium ${isUnc ? 'italic' : ''}`}>
                                          {info.name}
                                        </span>
                                        {isUnc && (
                                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 shrink-0">
                                            ? Incertain
                                          </span>
                                        )}
                                        {renderQuotaBadge(userId)}
                                      </div>
                                      {canEdit && !isCancelled && (
                                        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => moveToSelected(slot.id, userId)}
                                            className="min-h-[34px] text-[11px] bg-emerald-950/80 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-700/60 px-2.5 py-1.5 rounded-lg transition active:scale-95"
                                          >
                                            + Titulaire
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => moveToWaitlist(slot.id, userId)}
                                            className="min-h-[34px] text-[11px] bg-amber-950/80 hover:bg-amber-700 text-amber-300 hover:text-white border border-amber-700/60 px-2.5 py-1.5 rounded-lg transition active:scale-95"
                                          >
                                            + Attente
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 italic py-2 text-center">
                                Aucun autre joueur disponible ou incertain
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bouton Enregistrer ce créneau */}
                      {canEdit && isDirty && (
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            disabled={isSavingThis}
                            onClick={() => handleSaveSingleSlot(slot.id)}
                            className="w-full sm:w-auto min-h-[42px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs py-2 px-4 rounded-xl transition flex items-center justify-center gap-1.5 shadow active:scale-95"
                          >
                            {isSavingThis ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Shield className="w-3.5 h-3.5" />
                            )}
                            <span>Enregistrer ce créneau</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barre flottante discrète si modifications locales (sans message d'erreur) */}
      {canEdit && !optimizationBanner && dirtySlotIds.length > 0 && activeTab === 'planning' && (
        <div className="sticky bottom-[72px] sm:bottom-6 z-30 bg-slate-900/95 backdrop-blur-md border border-indigo-500/40 rounded-2xl p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-2 animate-fade-slide-up">
          <span className="text-xs text-slate-300 font-medium">
            {dirtySlotIds.length} créneau(x) prêt(s) à enregistrer
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleDiscardAllDrafts}
              disabled={savingAll}
              className="px-3 py-2 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveAllDrafts}
              disabled={savingAll}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition flex items-center gap-1.5 shadow active:scale-95"
            >
              {savingAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Enregistrer le planning ({dirtySlotIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SUIVI DES MEMBRES & PARTIES (RESPONSIVE MOBILE + DESKTOP) */}
      {activeTab === 'members' && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">
                Suivi individuel et charge sur le mois
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>
                  Visibilité du sondage : uniquement les {poll.targetUsers?.length || 0} membre(s) ciblé(s) (+ Admins).
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { key: 'all', label: 'Tous' },
                { key: 'responded', label: 'Ont répondu' },
                { key: 'missing', label: 'Non-répondants' },
                { key: 'unfulfilled', label: 'Objectif non atteint' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setMemberFilter(f.key as any)}
                  className={`px-2.5 py-1.5 rounded-lg border transition ${
                    memberFilter === f.key
                      ? 'bg-indigo-600 border-indigo-500 text-white font-medium'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vue Mobile : Cartes individuelles */}
          <div className="md:hidden space-y-2.5">
            {memberRows.map((row) => (
              <div
                key={row.uid}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar avatar={row.avatar} name={row.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{row.name}</p>
                      {row.roles.length > 0 && (
                        <p className="text-[10px] text-slate-400 truncate">
                          {row.roles.slice(0, 3).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {row.hasResponded ? (
                    <span className="text-[11px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded-lg font-medium shrink-0">
                      Répondu
                    </span>
                  ) : (
                    <span className="text-[11px] bg-amber-950/60 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-lg font-medium shrink-0">
                      En attente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                  <div className="bg-slate-900 rounded-lg p-1.5">
                    <p className="text-[10px] text-slate-400">Dispos</p>
                    <p className="font-semibold text-slate-200 mt-0.5">
                      {row.dispoCount}
                      {row.incertainCount > 0 ? ` (+${row.incertainCount})` : ''}
                    </p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-1.5">
                    <p className="text-[10px] text-slate-400">Souhait</p>
                    <p className="font-mono font-semibold text-slate-200 mt-0.5">
                      {row.desired === undefined
                        ? '—'
                        : row.desired === null
                        ? '∞'
                        : row.desired}
                    </p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-1.5">
                    <p className="text-[10px] text-slate-400">Attribuées / Mois</p>
                    <p className="font-mono font-semibold text-emerald-300 mt-0.5">
                      {row.assignedHere} / {row.monthTotal}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {memberRows.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500 italic">
                Aucun membre dans cette catégorie.
              </p>
            )}
          </div>

          {/* Vue Desktop : Tableau complet */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Membre</th>
                  <th className="py-2.5 px-3 font-medium">Statut</th>
                  <th className="py-2.5 px-3 font-medium">Dispos</th>
                  <th className="py-2.5 px-3 font-medium">Souhait période</th>
                  <th className="py-2.5 px-3 font-medium">Attribuées</th>
                  <th className="py-2.5 pl-3 font-medium">Total ce mois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {memberRows.map((row) => (
                  <tr key={row.uid} className="hover:bg-slate-950/50">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <UserAvatar avatar={row.avatar} name={row.name} size="sm" />
                        <div>
                          <p className="font-medium text-white">{row.name}</p>
                          {row.roles.length > 0 && (
                            <p className="text-[10px] text-slate-400">
                              {row.roles.slice(0, 3).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {row.hasResponded ? (
                        <span className="text-emerald-400 font-medium">Répondu</span>
                      ) : (
                        <span className="text-amber-400 font-medium">En attente</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {row.dispoCount} dispo
                      {row.incertainCount > 0 ? ` · ${row.incertainCount} inc.` : ''}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-200">
                      {row.desired === undefined
                        ? '—'
                        : row.desired === null
                        ? 'Illimité'
                        : `${row.desired}`}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-mono font-semibold px-2 py-0.5 rounded ${
                          row.unfulfilled
                            ? 'bg-amber-950/70 text-amber-300'
                            : row.assignedHere > 0
                            ? 'bg-emerald-950/70 text-emerald-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {row.assignedHere}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 font-mono text-slate-300">
                      {row.monthTotal}
                    </td>
                  </tr>
                ))}

                {memberRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                      Aucun membre dans cette catégorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale confirmation changement de sondage si brouillons non sauvegardés */}
      {pendingPollSwitchId && (
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
                  Vous avez des changements en attente sur ce sondage.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
              Enregistrez le planning avant de changer de sondage, ou confirmez l'abandon de vos modifications locales.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingPollSwitchId(null)}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition active:scale-95"
              >
                Rester et enregistrer
              </button>
              <button
                type="button"
                onClick={() => switchPollNow(pendingPollSwitchId)}
                className="px-4 py-2.5 text-xs font-medium text-red-300 hover:text-white bg-red-950/70 hover:bg-red-700 border border-red-800/60 rounded-xl transition active:scale-95"
              >
                Changer sans enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale confirmation : Envoyer le planning en MP Discord (Présent / Indéterminé uniquement) */}
      {showPlanningDmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-sky-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-modal-pop"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-950/70 border border-sky-700/60 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">
                    Envoyer le planning en MP Discord
                  </h4>
                  <p className="text-xs text-slate-400">
                    Chaque destinataire recevra sa décision personnalisée + le planning complet.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanningDmModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-sky-950/30 border border-sky-800/50 rounded-xl p-3 text-xs text-sky-100">
              Seuls les membres ayant répondu <strong>Présent</strong> ou{' '}
              <strong>Indéterminé</strong> ({presentOrUncertainIds.length}) recevront ce message. Les
              membres uniquement indisponibles et les non-répondants sont exclus.
            </div>

            {dirtySlotIds.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Vos {dirtySlotIds.length} créneau(x) modifié(s) seront automatiquement enregistrés
                  avant l&apos;envoi des MP.
                </span>
              </div>
            )}

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {presentOrUncertainIds.map((uid) => {
                const info = getUserInfo(uid);
                const isPresent = presentUserSet.has(uid);
                return (
                  <div
                    key={uid}
                    className="flex items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar avatar={info.avatar} name={info.name} size="sm" />
                      <span className="font-medium text-white truncate">{info.name}</span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                        isPresent
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50'
                          : 'bg-amber-950/70 text-amber-300 border-amber-700/50'
                      }`}
                    >
                      {isPresent ? 'Présent' : 'Indéterminé'}
                    </span>
                  </div>
                );
              })}
            </div>

            {planningDmError && (
              <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{planningDmError}</span>
              </div>
            )}

            {planningDmResult && (
              <div
                className={`text-xs rounded-xl p-3 border space-y-1.5 ${
                  planningDmResult.failedCount > 0
                    ? 'bg-amber-950/50 border-amber-700/60 text-amber-100'
                    : 'bg-emerald-950/50 border-emerald-700/60 text-emerald-100'
                }`}
              >
                <p className="font-semibold">
                  {planningDmResult.sentCount} / {planningDmResult.totalAuthorized} MP Discord
                  envoyé(s) !
                </p>
                {planningDmResult.failed.length > 0 && (
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                    {planningDmResult.failed.map((f) => (
                      <li key={f.discordId}>
                        {f.displayName} : {f.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPlanningDmModal(false)}
                className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                {planningDmResult ? 'Fermer' : 'Annuler'}
              </button>
              {!planningDmResult && (
                <button
                  type="button"
                  disabled={sendingPlanningDm || savingAll || presentOrUncertainIds.length === 0}
                  onClick={handleConfirmSendPlanningDm}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-sky-600/20"
                >
                  {sendingPlanningDm || savingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {dirtySlotIds.length > 0
                          ? 'Enregistrer & Envoyer les MP'
                          : 'Envoyer en MP Discord'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale : Relancer les retardataires */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-modal-pop"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-950/70 border border-amber-700/60 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">
                    Relancer les retardataires ({missingResponders.length})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Envoyez un MP individuel avec le lien ou copiez les mentions Discord.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReminderModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {missingResponders.map((uid) => {
                const info = getUserInfo(uid);
                return (
                  <div
                    key={uid}
                    className="flex items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar avatar={info.avatar} name={info.name} size="sm" />
                      <span className="font-medium text-white truncate">{info.name}</span>
                    </div>
                    <span className="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-full shrink-0">
                      En attente
                    </span>
                  </div>
                );
              })}
            </div>

            {reminderDmError && (
              <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{reminderDmError}</span>
              </div>
            )}

            {reminderDmResult && (
              <div
                className={`text-xs rounded-xl p-3 border space-y-1.5 ${
                  reminderDmResult.failedCount > 0
                    ? 'bg-amber-950/50 border-amber-700/60 text-amber-100'
                    : 'bg-emerald-950/50 border-emerald-700/60 text-emerald-100'
                }`}
              >
                <p className="font-semibold">
                  {reminderDmResult.sentCount} / {reminderDmResult.totalAuthorized} MP de relance
                  envoyé(s) !
                </p>
                {reminderDmResult.failed.length > 0 && (
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                    {reminderDmResult.failed.map((f) => (
                      <li key={f.discordId}>
                        {f.displayName} : {f.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCopyReminders}
                className="px-3.5 py-2.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                {copiedType === 'reminders' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>
                  {copiedType === 'reminders' ? 'Mentions copiées !' : 'Copier les mentions (@...)'}
                </span>
              </button>

              {!reminderDmResult && (
                <button
                  type="button"
                  disabled={sendingReminderDm || missingResponders.length === 0}
                  onClick={handleConfirmSendReminderDm}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {sendingReminderDm ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Envoyer une relance en MP Discord</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popup prévisualisation : Proposition de configuration optimale */}
      {proposedSchedule && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-modal-pop max-h-[90vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-600/50 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-indigo-300" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">
                    Proposition de configuration optimale
                  </h4>
                  <p className="text-xs text-slate-400">
                    Aucune modification n&apos;est encore appliquée. Vérifiez puis validez ci-dessous.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProposedSchedule(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs shrink-0">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[11px] text-slate-400">Séances planifiées</p>
                <p className="text-base font-bold text-emerald-400">
                  {proposedSchedule.summary.plannedSessionsCount}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[11px] text-slate-400">Créneaux viables</p>
                <p className="text-base font-bold text-white">
                  {proposedSchedule.summary.viableSlotsCount}
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                <p className="text-[11px] text-slate-400">Objectifs satisfaits</p>
                <p className="text-base font-bold text-indigo-300">
                  {proposedSchedule.summary.satisfiedPlayersCount} /{' '}
                  {proposedSchedule.summary.totalRequestingPlayers}
                </p>
              </div>
            </div>

            <div className="overflow-y-auto space-y-2.5 pr-1 flex-1">
              {poll.slots
                .filter((s) => !s.cancelled)
                .sort(
                  (a, b) =>
                    a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime)
                )
                .map((slot) => {
                  const prop = proposedSchedule.slotProposals[slot.id];
                  const selectedIds = prop?.selectedIds || [];
                  const waitlistIds = prop?.waitlistIds || [];
                  const slotType = slot.trainingType || poll.type;
                  const minReq = slot.minParticipants ?? poll.minParticipants;
                  const viable = selectedIds.length >= minReq;
                  return (
                    <div
                      key={slot.id}
                      className={`rounded-xl border p-3 text-xs space-y-2 ${
                        viable
                          ? 'bg-slate-950/90 border-emerald-700/40'
                          : 'bg-slate-950/60 border-slate-800 opacity-80'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-white">
                            {slot.dayName} {formatShortFRDate(slot.dateStr)}
                          </span>
                          <span className="font-mono text-indigo-300">
                            ({slot.startTime}–{slot.endTime})
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TRAINING_TYPE_BADGE_CLASSES[slotType] || 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40'}`}
                          >
                            {TRAINING_TYPE_LABELS[slotType] || slotType}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            viable
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {selectedIds.length} titulaire(s)
                        </span>
                      </div>

                      {selectedIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedIds.map((uid) => {
                            const info = getUserInfo(uid);
                            return (
                              <span
                                key={uid}
                                className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-full px-2.5 py-0.5 text-[11px] text-slate-200"
                              >
                                <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                <span>{info.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">
                          Créneau non retenu (effectif insuffisant)
                        </p>
                      )}

                      {waitlistIds.length > 0 && (
                        <p className="text-[11px] text-amber-300/90">
                          ⏳ Attente : {waitlistIds.map((id) => getUserInfo(id).name).join(', ')}
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setProposedSchedule(null)}
                className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmApplyOptimization}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/20"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Valider cette proposition</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale : Ajouter / Supprimer des membres concernés */}
      {showMembersModal && (() => {
        const search = membersSearch.trim().toLowerCase();
        const currentIdsSet = new Set(draftTargetUserIds);
        const currentMembers = draftTargetUserIds
          .map((uid) => {
            const gm = guildMembers.find((m) => m.discordId === uid);
            const info = getUserInfo(uid);
            return {
              discordId: uid,
              displayName: gm?.displayName || info.name,
              avatarUrl: gm?.avatarUrl || info.avatar,
              roleNames: gm?.roleNames || info.roles,
            };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

        const availableMembers = guildMembers
          .filter((m) => {
            if (currentIdsSet.has(m.discordId)) return false;
            if (!search) return true;
            return (
              m.displayName.toLowerCase().includes(search) ||
              m.username.toLowerCase().includes(search) ||
              m.roleNames.some((r) => r.toLowerCase().includes(search))
            );
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

        const prevSet = new Set(poll.targetUsers || []);
        const newlyAddedCount = draftTargetUserIds.filter((id) => !prevSet.has(id)).length;

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 animate-modal-pop max-h-[90vh] flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-700/60 flex items-center justify-center shrink-0">
                    <UserPlus className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-white">
                      Gérer les membres du sondage
                    </h4>
                    <p className="text-xs text-slate-400">
                      Cliquez sur un membre pour l&apos;ajouter ou le retirer de ce sondage.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMembersModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto flex-1 pr-0.5">
                {/* Colonne gauche : Ajouter */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5 flex flex-col">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span>Membres du serveur ({availableMembers.length})</span>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={membersSearch}
                      onChange={(e) => setMembersSearch(e.target.value)}
                      placeholder="Rechercher un pseudo ou rôle..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {availableMembers.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic text-center py-6">
                        Aucun autre membre trouvé.
                      </p>
                    ) : (
                      availableMembers.map((m) => (
                        <button
                          key={m.discordId}
                          type="button"
                          onClick={() =>
                            setDraftTargetUserIds((prev) => [...prev, m.discordId])
                          }
                          className="w-full min-h-[40px] p-2 rounded-lg bg-slate-900 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/50 text-left flex items-center justify-between gap-2 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar avatar={m.avatarUrl} name={m.displayName} size="xs" />
                            <span className="text-xs text-white truncate">{m.displayName}</span>
                          </div>
                          <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Colonne droite : Membres concernés */}
                <div className="bg-slate-950/80 border border-emerald-800/40 rounded-xl p-3 space-y-2.5 flex flex-col">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                    <span>Membres concernés ({currentMembers.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {currentMembers.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic text-center py-6">
                        Aucun membre sélectionné.
                      </p>
                    ) : (
                      currentMembers.map((m) => (
                        <button
                          key={m.discordId}
                          type="button"
                          onClick={() =>
                            setDraftTargetUserIds((prev) =>
                              prev.filter((id) => id !== m.discordId)
                            )
                          }
                          className="w-full min-h-[40px] p-2 rounded-lg bg-emerald-950/25 hover:bg-red-950/35 border border-emerald-700/40 hover:border-red-500/50 text-left flex items-center justify-between gap-2 transition group"
                          title="Cliquer pour retirer ce membre"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <UserAvatar avatar={m.avatarUrl} name={m.displayName} size="xs" />
                            <span className="text-xs text-white truncate">{m.displayName}</span>
                          </div>
                          <UserMinus className="w-3.5 h-3.5 text-emerald-400 group-hover:text-red-400 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {newlyAddedCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-200 bg-indigo-950/30 border border-indigo-700/40 rounded-xl px-3 py-2.5 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={notifyAddedMembers}
                    onChange={(e) => setNotifyAddedMembers(e.target.checked)}
                    className="rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                  <span>
                    Envoyer un MP Discord avec le lien du sondage aux{' '}
                    <strong>{newlyAddedCount} nouveau(x) membre(s)</strong> ajouté(s)
                  </span>
                </label>
              )}

              {membersModalError && (
                <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{membersModalError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowMembersModal(false)}
                  className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={savingMembers}
                  onClick={handleSaveTargetUsers}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {savingMembers ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Enregistrer les membres</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
