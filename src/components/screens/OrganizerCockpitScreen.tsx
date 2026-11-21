import React, { useEffect, useMemo, useState } from 'react';
import {
  TRAINING_TYPE_LABELS,
  type GuildMember,
  type Poll,
  type UserProfile,
} from '../../types';
import type { MemberProfile } from '../../firebase/members';
import {
  Trophy, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, UserMinus, UserCheck, Shield, ArrowLeft,
  Sparkles, Loader2, X, Users, Calendar, Ban, Trash2,
  Plus, Settings, Copy, Check, Lock, Eye, Pencil, RotateCcw,
  Split, HelpCircle, ChevronsDownUp, ChevronsUpDown
} from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import { formatFRDateTime, formatShortFRDate } from '../../utils/dateUtils';
import {
  computeMonthlyAssignedCounts,
  generateOptimalSchedule,
  splitIntoBalancedTeams,
  type ScheduleOptimizationResult,
} from '../../utils/planningOptimizer';

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
    }
  ) => Promise<string>;
  onRemoveSlot: (pollId: string, slotId: string) => Promise<void>;
  onUpdatePoll: (
    pollId: string,
    changes: Partial<{
      title: string;
      deadline: string;
      minParticipants: number;
      maxParticipants: number;
      status: 'OPEN' | 'CLOSED' | 'CANCELLED';
    }>
  ) => Promise<void>;
  onCreatePoll: () => void;
  onBack?: () => void;
}

interface SlotDraft {
  selectedIds: string[];
  waitlistIds: string[];
  teamAssignments: Record<string, 'A' | 'B'>;
  minParticipants: number;
  maxParticipants: number;
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

function toLocalDateAndTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return { date: '', time: '20:00' };
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
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
  onUpdatePoll,
  onCreatePoll,
  onBack,
}) => {
  const poll = polls.find((p) => p.id === selectedPollId) || polls[0] || null;

  const [activeTab, setActiveTab] = useState<'planning' | 'members'>('planning');
  const [sortMode, setSortMode] = useState<'rank' | 'date'>('rank');
  const [memberFilter, setMemberFilter] = useState<
    'all' | 'responded' | 'missing' | 'unfulfilled'
  >('all');

  // Tous les jours/créneaux repliés par défaut (Set vide)
  const [expandedSlotIds, setExpandedSlotIds] = useState<Set<string>>(() => new Set());

  // Brouillons par créneau
  const [draftsBySlot, setDraftsBySlot] = useState<Record<string, SlotDraft>>({});
  const [optimizationBanner, setOptimizationBanner] =
    useState<ScheduleOptimizationResult['summary'] | null>(null);
  const [pendingPollSwitchId, setPendingPollSwitchId] = useState<string | null>(null);

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
  const [addingSlot, setAddingSlot] = useState(false);

  const [showQuickSettings, setShowQuickSettings] = useState(false);
  const [settingsMin, setSettingsMin] = useState<number>(4);
  const [settingsMax, setSettingsMax] = useState<number>(8);
  const [settingsDeadlineDate, setSettingsDeadlineDate] = useState('');
  const [settingsDeadlineTime, setSettingsDeadlineTime] = useState('20:00');
  const [savingSettings, setSavingSettings] = useState(false);

  const [cancellingSlotId, setCancellingSlotId] = useState<string | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('Salle de jeu indisponible');
  const [confirmDeleteSlotId, setConfirmDeleteSlotId] = useState<string | null>(null);

  const [copiedType, setCopiedType] = useState<'discord' | 'reminders' | null>(null);

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

  // Fusion temps réel Firestore + brouillons locaux
  const resolvedSlots = poll.slots.map((slot) => {
    const draft = draftsBySlot[slot.id];
    const slotMin = draft?.minParticipants ?? slot.minParticipants ?? poll.minParticipants;
    const slotMax = draft?.maxParticipants ?? slot.maxParticipants ?? poll.maxParticipants;
    return {
      ...slot,
      minParticipants: slotMin,
      maxParticipants: slotMax,
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
  for (const s of resolvedSlots) {
    if (s.cancelled) continue;
    for (const uid of s.selectedIds) {
      assignedInThisPoll[uid] = (assignedInThisPoll[uid] || 0) + 1;
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
      if ((assignedInThisPoll[uid] || 0) >= desired) satisfiedCount++;
    }
  }

  const showToast = (msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => {
      setSavedFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const toggleSlotExpanded = (slotId: string) => {
    setExpandedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const areAllExpanded =
    orderedSlots.length > 0 && orderedSlots.every((s) => expandedSlotIds.has(s.id));

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedSlotIds(new Set());
    } else {
      setExpandedSlotIds(new Set(orderedSlots.map((s) => s.id)));
    }
  };

  const switchPollNow = (targetId: string) => {
    setDraftsBySlot({});
    setOptimizationBanner(null);
    setExpandedSlotIds(new Set());
    setPendingPollSwitchId(null);
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

  const cyclePlayerTeam = (slotId: string, userId: string) => {
    updateSlotDraft(slotId, (cur) => {
      const nextTeams = { ...cur.teamAssignments };
      const curTeam = nextTeams[userId];
      if (!curTeam) nextTeams[userId] = 'A';
      else if (curTeam === 'A') nextTeams[userId] = 'B';
      else delete nextTeams[userId];
      return { ...cur, teamAssignments: nextTeams };
    });
  };

  const applyBalancedTeamsToSlot = (slotId: string, selectedIds: string[]) => {
    updateSlotDraft(slotId, (cur) => ({
      ...cur,
      teamAssignments: splitIntoBalancedTeams(selectedIds),
    }));
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

  const handleRunOptimizer = () => {
    if (!canEdit) return;
    const result = generateOptimalSchedule(poll, monthlyOtherGames);
    const nextDrafts: Record<string, SlotDraft> = {};

    Object.values(result.slotProposals).forEach((prop) => {
      const base = poll.slots.find((s) => s.id === prop.slotId);
      nextDrafts[prop.slotId] = {
        selectedIds: prop.selectedIds,
        waitlistIds: prop.waitlistIds,
        teamAssignments: prop.teamAssignments,
        minParticipants: base?.minParticipants ?? poll.minParticipants,
        maxParticipants: base?.maxParticipants ?? poll.maxParticipants,
      };
    });

    setDraftsBySlot(nextDrafts);
    setOptimizationBanner(result.summary);
    setActiveTab('planning');
    setActionError(null);
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

  const handleSaveAllDrafts = async () => {
    if (!canEdit || dirtySlotIds.length === 0 || savingAll) return;
    for (const sid of dirtySlotIds) {
      const d = draftsBySlot[sid];
      if (d.minParticipants > d.maxParticipants) {
        setActionError('Un créneau modifié a un minimum supérieur à son maximum.');
        return;
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
      }));
      await onSaveSlotPlanBatch(poll.id, updates);
      setDraftsBySlot({});
      setOptimizationBanner(null);
      onDirtyChange?.(false);
      showToast(`Planning enregistré (${updates.length} créneau(x) mis à jour) !`);
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'enregistrer le planning.");
    } finally {
      setSavingAll(false);
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
      });
      setShowAddSlotForm(false);
      showToast('Nouveau créneau ajouté au sondage.');
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'ajouter ce créneau.");
    } finally {
      setAddingSlot(false);
    }
  };

  const openSettingsPanel = () => {
    const dt = toLocalDateAndTime(poll.deadline);
    setSettingsMin(poll.minParticipants);
    setSettingsMax(poll.maxParticipants);
    setSettingsDeadlineDate(dt.date);
    setSettingsDeadlineTime(dt.time);
    setShowQuickSettings((v) => !v);
    setShowAddSlotForm(false);
  };

  const handleSaveQuickSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || savingSettings) return;
    if (settingsMin > settingsMax) {
      setActionError('Le minimum ne peut pas dépasser le maximum.');
      return;
    }
    setSavingSettings(true);
    setActionError(null);
    try {
      const changes: any = {
        minParticipants: settingsMin,
        maxParticipants: settingsMax,
      };
      if (settingsDeadlineDate && settingsDeadlineTime) {
        changes.deadline = `${settingsDeadlineDate}T${settingsDeadlineTime}:00`;
      }
      await onUpdatePoll(poll.id, changes);
      setShowQuickSettings(false);
      showToast('Paramètres du sondage mis à jour.');
    } catch (err: any) {
      setActionError(err?.message || 'Impossible de mettre à jour les paramètres.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopyDiscordSummary = async () => {
    const lines: string[] = [
      `📅 **${poll.title}** (${TRAINING_TYPE_LABELS[poll.type] || poll.type})`,
      '',
    ];

    const slotsToExport = resolvedSlots
      .filter(
        (s) =>
          !s.cancelled &&
          (s.selectedIds.length > 0 || s.disponibles.length >= s.minParticipants)
      )
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime));

    const targetList = slotsToExport.length > 0 ? slotsToExport : activeSlots;

    for (const s of targetList) {
      lines.push(`**• ${s.dayName} ${formatShortFRDate(s.dateStr)} — ${s.startTime} à ${s.endTime}**`);
      if (s.selectedIds.length > 0) {
        const teamA = s.selectedIds.filter((id) => s.teamAssignments[id] === 'A');
        const teamB = s.selectedIds.filter((id) => s.teamAssignments[id] === 'B');
        const unassignedTeam = s.selectedIds.filter((id) => !s.teamAssignments[id]);

        if (teamA.length > 0 || teamB.length > 0) {
          if (teamA.length > 0) {
            lines.push(`  🟦 Équipe A : ${teamA.map((id) => getUserInfo(id).name).join(', ')}`);
          }
          if (teamB.length > 0) {
            lines.push(`  🟥 Équipe B : ${teamB.map((id) => getUserInfo(id).name).join(', ')}`);
          }
          if (unassignedTeam.length > 0) {
            lines.push(`  ✅ Titulaires : ${unassignedTeam.map((id) => getUserInfo(id).name).join(', ')}`);
          }
        } else {
          lines.push(`  ✅ Titulaires (${s.selectedIds.length}) : ${s.selectedIds.map((id) => getUserInfo(id).name).join(', ')}`);
        }
      } else {
        lines.push(`  🟢 Disponibles (${s.disponibles.length}) : ${s.disponibles.map((id) => getUserInfo(id).name).join(', ') || 'Aucun'}`);
      }

      if (s.waitlistIds.length > 0) {
        lines.push(`  ⏳ Liste d'attente : ${s.waitlistIds.map((id) => getUserInfo(id).name).join(', ')}`);
      }
      lines.push('');
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n').trim());
      setCopiedType('discord');
      setTimeout(() => setCopiedType((v) => (v === 'discord' ? null : v)), 2500);
    } catch {
      window.prompt('Copiez ce résumé Discord :', lines.join('\n'));
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
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
          {assigned}/?
        </span>
      );
    }
    if (desired === null) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
          {assigned}/∞
        </span>
      );
    }
    const over = assigned > desired;
    const met = assigned === desired && desired > 0;
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
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
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* Top Navigation & Sélecteur de sondage */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition group self-start"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
            <span>Retour à l'accueil</span>
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={poll.id}
            onChange={(e) => handlePollSelectChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-indigo-500 max-w-full sm:max-w-md"
          >
            {polls.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.status === 'OPEN' ? 'Ouvert' : p.status === 'CLOSED' ? 'Clôturé' : 'Annulé'}]{' '}
                {p.title}
              </option>
            ))}
          </select>

          {canEdit ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Pencil className="w-3 h-3" />
              Mode Édition ({currentUser.isAdmin ? 'Admin' : 'Organisateur'})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              <Eye className="w-3 h-3 text-indigo-400" />
              Lecture seule
            </span>
          )}
        </div>
      </div>

      {/* Header Sondage + KPIs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-indigo-900/40 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-indigo-700/40">
                {TRAINING_TYPE_LABELS[poll.type] || poll.type}
              </span>
              <span className="text-xs text-slate-400">
                Créé par <strong className="text-slate-200">{poll.createdByName || 'Organisateur'}</strong>
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">{poll.title}</h2>
          </div>

          <div className="text-xs text-slate-400 space-y-1 sm:text-right">
            <p className="flex items-center sm:justify-end gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Clôture : {formatFRDateTime(poll.deadline)}
            </p>
            <p>
              Défaut : Min <strong className="text-white">{poll.minParticipants}</strong> | Max{' '}
              <strong className="text-white">{poll.maxParticipants}</strong> joueurs
            </p>
          </div>
        </div>

        {/* 4 Cartes KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                className="h-full bg-indigo-500 transition-all"
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
              Souhaits couverts
            </p>
            <p className="text-lg font-bold text-white">
              {satisfiedCount} / {requestingCount}
            </p>
            <p className="text-[10px] text-slate-400">Objectifs de parties atteints</p>
          </div>
        </div>

        {/* Barre d'outils */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={handleRunOptimizer}
                className="bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Proposer une configuration optimale</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAddSlotForm((v) => !v);
                  setShowQuickSettings(false);
                  if (!newSlotDate) setNewSlotDate(poll.startDate || '');
                  setNewSlotMin(poll.minParticipants);
                  setNewSlotMax(poll.maxParticipants);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ajouter un créneau</span>
              </button>

              <button
                type="button"
                onClick={openSettingsPanel}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Settings className="w-3.5 h-3.5 text-slate-300" />
                <span>Paramètres</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleCopyDiscordSummary}
            title="Copie un résumé prêt à coller (Ctrl+V) dans un salon Discord avec les créneaux, titulaires et équipes"
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
          >
            {copiedType === 'discord' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>{copiedType === 'discord' ? 'Planning copié !' : 'Copier le planning Discord'}</span>
          </button>

          {canEdit && missingResponders.length > 0 && (
            <button
              type="button"
              onClick={handleCopyReminders}
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
            >
              {copiedType === 'reminders' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>
                {copiedType === 'reminders'
                  ? 'Mentions copiées !'
                  : `Relancer retardataires (${missingResponders.length})`}
              </span>
            </button>
          )}
        </div>

        {/* Formulaire inline Ajout de créneau */}
        {canEdit && showAddSlotForm && (
          <form
            onSubmit={handleCreateExtraSlot}
            className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 flex flex-wrap items-end gap-3 text-xs"
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

        {/* Panneau Paramètres rapides */}
        {canEdit && showQuickSettings && (
          <form
            onSubmit={handleSaveQuickSettings}
            className="bg-slate-950 border border-slate-700 rounded-xl p-4 space-y-3 text-xs"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400 block">Min. par défaut</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={settingsMin}
                  onChange={(e) => setSettingsMin(parseInt(e.target.value, 10) || 4)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 block">Max. par défaut</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={settingsMax}
                  onChange={(e) => setSettingsMax(parseInt(e.target.value, 10) || 8)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 block">Date clôture</label>
                <input
                  type="date"
                  value={settingsDeadlineDate}
                  onChange={(e) => setSettingsDeadlineDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 block">Heure clôture</label>
                <input
                  type="time"
                  value={settingsDeadlineTime}
                  onChange={(e) => setSettingsDeadlineTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {poll.status === 'OPEN' ? (
                  <button
                    type="button"
                    onClick={() => onUpdatePoll(poll.id, { status: 'CLOSED' })}
                    className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Clôturer les votes
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onUpdatePoll(poll.id, { status: 'OPEN' })}
                    className="bg-indigo-950 hover:bg-indigo-900 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-700 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rouvrir le sondage
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5"
              >
                {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Appliquer</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Feedbacks & Alerte Modifications non sauvegardées */}
      {actionError && (
        <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center justify-between gap-2">
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
        <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs rounded-xl p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}

      {canEdit && (dirtySlotIds.length > 0 || optimizationBanner) && (
        <div
          role="alert"
          className="bg-red-950/75 border-2 border-red-500/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
        >
          <div className="space-y-1 text-xs">
            <p className="font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              {optimizationBanner
                ? `Modifications non sauvegardées (proposition optimale) : ${optimizationBanner.plannedSessionsCount} séance(s) planifiée(s), ${optimizationBanner.satisfiedPlayersCount}/${optimizationBanner.totalRequestingPlayers} souhait(s) couvert(s).`
                : `Modifications non sauvegardées sur ${dirtySlotIds.length} créneau(x) ! Cliquez sur « Enregistrer tout le planning » pour ne rien perdre.`}
            </p>
            {optimizationBanner && optimizationBanner.unfulfilledPlayers.length > 0 && (
              <p className="text-amber-200 text-[11px]">
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
            {dirtySlotIds.length > 0 && (
              <button
                type="button"
                onClick={handleSaveAllDrafts}
                disabled={savingAll}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition flex items-center gap-1.5 shadow"
              >
                {savingAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Enregistrer tout le planning</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Onglets Cockpit & Contrôles d'affichage */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('planning')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
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
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === 'members'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Suivi des membres & Parties ({allRelevantUserIds.length})
          </button>
        </div>

        {activeTab === 'planning' && (
          <div className="flex flex-wrap items-center gap-2">
            {orderedSlots.length > 0 && (
              <button
                type="button"
                onClick={toggleExpandAll}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition"
              >
                {areAllExpanded ? (
                  <>
                    <ChevronsDownUp className="w-3.5 h-3.5" />
                    <span>Tout replier</span>
                  </>
                ) : (
                  <>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                    <span>Tout déplier</span>
                  </>
                )}
              </button>
            )}

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setSortMode('rank')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sortMode === 'rank' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
                }`}
              >
                Par classement
              </button>
              <button
                type="button"
                onClick={() => setSortMode('date')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  sortMode === 'date' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400'
                }`}
              >
                Par date
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: PLANNING & ÉQUIPES */}
      {activeTab === 'planning' && (
        <div className="space-y-4">
          {orderedSlots.map((slot, index) => {
            const isExpanded = expandedSlotIds.has(slot.id);
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

            return (
              <div
                key={slot.id}
                className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-lg transition ${
                  isCancelled
                    ? 'border-red-900/50 opacity-75'
                    : isDirty
                    ? 'border-red-500/70'
                    : isExceeded
                    ? 'border-amber-500/40'
                    : isMinReached
                    ? 'border-emerald-500/30'
                    : 'border-slate-800'
                }`}
              >
                {/* Summary Bar */}
                <div
                  onClick={() => toggleSlotExpanded(slot.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/40 transition select-none"
                >
                  <div className="flex items-center gap-3">
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

                    <div>
                      <h3 className="font-bold text-sm text-white flex flex-wrap items-center gap-2">
                        <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                          {slot.dayName} {formatShortFRDate(slot.dateStr)}
                        </span>
                        <span className="text-xs text-indigo-300 font-mono font-medium">
                          ({slot.startTime} - {slot.endTime})
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                          Min {slotMin} · Max {slotMax}
                        </span>
                        {slot.selectedIds.length > 0 && !isCancelled && (
                          <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            {slot.selectedIds.length} titulaire(s)
                          </span>
                        )}
                        {isDirty && (
                          <span className="text-[10px] bg-red-950 text-red-300 border border-red-700/60 px-2 py-0.5 rounded-full">
                            Non sauvegardé
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{nbDispo} disponible(s)</span>
                        <span>•</span>
                        <span>{nbIncertain} incertain(s)</span>
                        <span>•</span>
                        <span>{nbIndispo} indisponible(s)</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
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

                    <div className="text-slate-400 hover:text-white p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/70 p-4 sm:p-5 space-y-4">

                    {/* Barre d'actions créneau (Organisateur / Admin uniquement) */}
                    {canEdit && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px]">
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
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
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
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                              />
                            </label>
                          </div>

                          {slot.selectedIds.length >= 2 && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => applyBalancedTeamsToSlot(slot.id, slot.selectedIds)}
                              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-indigo-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
                            >
                              <Split className="w-3.5 h-3.5" />
                              <span>Répartir Équipe A / B</span>
                            </button>
                          )}

                          {isCancelled ? (
                            <button
                              type="button"
                              onClick={() => handleToggleCancelSlot(slot.id, true)}
                              className="text-[11px] bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 px-2.5 py-1.5 rounded-lg border border-emerald-700/60 flex items-center gap-1.5 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Réactiver ce créneau</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setCancellingSlotId((prev) => (prev === slot.id ? null : slot.id))
                              }
                              className="text-[11px] bg-slate-800 hover:bg-amber-950/60 text-amber-300 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Salle indispo / Annuler</span>
                            </button>
                          )}
                        </div>

                        <div>
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
                              <span>Supprimer créneau</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Confirmation annulation créneau avec motif */}
                    {canEdit && cancellingSlotId === slot.id && !isCancelled && (
                      <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
                        <input
                          type="text"
                          value={cancelReasonInput}
                          onChange={(e) => setCancelReasonInput(e.target.value)}
                          placeholder="Motif (ex: Salle de jeu indisponible)"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleCancelSlot(slot.id, false)}
                          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Confirmer l'annulation
                        </button>
                      </div>
                    )}

                    {/* Disponibles à répartir (Édition) */}
                    {canEdit && !isCancelled && unassignedDisponibles.length > 0 && (
                      <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-3.5 space-y-2.5">
                        <span className="text-xs font-semibold text-indigo-300 block">
                          Disponibles à répartir ({unassignedDisponibles.length})
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {unassignedDisponibles.map((userId) => {
                            const info = getUserInfo(userId);
                            return (
                              <div
                                key={userId}
                                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                  <span className="truncate">{info.name}</span>
                                  {renderQuotaBadge(userId)}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => moveToSelected(slot.id, userId)}
                                    className="text-[10px] bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded transition"
                                  >
                                    Titulaire
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveToWaitlist(slot.id, userId)}
                                    className="text-[10px] bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded transition"
                                  >
                                    Attente
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Incertains disponibles en dépannage (Édition) */}
                    {canEdit && !isCancelled && unassignedIncertains.length > 0 && (
                      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
                        <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          Joueurs incertains mobilisables si besoin ({unassignedIncertains.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {unassignedIncertains.map((userId) => {
                            const info = getUserInfo(userId);
                            return (
                              <div
                                key={userId}
                                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] flex items-center gap-2"
                              >
                                <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                <span className="text-slate-200">{info.name}</span>
                                <button
                                  type="button"
                                  onClick={() => moveToSelected(slot.id, userId)}
                                  className="text-[10px] text-emerald-300 hover:underline"
                                >
                                  + Titulaire
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Titulaires & Liste d'attente */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Colonne Titulaires */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Titulaires ({slot.selectedIds.length}/{slotMax})
                          </span>
                          {canEdit && (
                            <span className="text-[10px] text-slate-400">
                              Cliquez Éq. pour basculer A/B
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {slot.selectedIds.map((userId) => {
                            const info = getUserInfo(userId);
                            const team = slot.teamAssignments?.[userId];
                            return (
                              <div
                                key={userId}
                                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                  <span className="truncate">{info.name}</span>
                                  {renderQuotaBadge(userId)}
                                  {team && (
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        team === 'A'
                                          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                                          : 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                                      }`}
                                    >
                                      Éq. {team}
                                    </span>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => cyclePlayerTeam(slot.id, userId)}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded transition"
                                      title="Basculer Équipe A / B / Aucune"
                                    >
                                      {team ? `Éq.${team}` : 'Éq.'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveToWaitlist(slot.id, userId)}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-0.5 rounded transition flex items-center gap-1"
                                      title="Mettre en attente"
                                    >
                                      <UserMinus className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeFromAssignment(slot.id, userId)}
                                      className="text-slate-400 hover:text-red-400 p-0.5 rounded transition"
                                      title="Retirer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {slot.selectedIds.length === 0 && (
                            <p className="text-xs text-slate-400 italic py-2 text-center">
                              Aucun titulaire sélectionné pour le moment
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Colonne Liste d'attente */}
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Liste d'attente ({slot.waitlistIds.length})
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {slot.waitlistIds.map((userId) => {
                            const info = getUserInfo(userId);
                            return (
                              <div
                                key={userId}
                                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                  <span className="truncate">{info.name}</span>
                                  {renderQuotaBadge(userId)}
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => moveToSelected(slot.id, userId)}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-0.5 rounded transition flex items-center gap-1"
                                      title="Passer titulaire"
                                    >
                                      <UserCheck className="w-3 h-3" />
                                      Titulaire
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeFromAssignment(slot.id, userId)}
                                      className="text-slate-400 hover:text-red-400 p-0.5 rounded transition"
                                      title="Retirer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {slot.waitlistIds.length === 0 && (
                            <p className="text-xs text-slate-400 italic py-2 text-center">
                              Aucun joueur en liste d'attente
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Détail de tous les votes */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <p className="text-xs font-medium text-slate-400 mb-2">
                        Détail des réponses sur ce créneau :
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <p className="font-semibold text-emerald-400 mb-1.5">
                            🟢 Disponibles ({slot.disponibles.length})
                          </p>
                          <div className="space-y-1.5 text-slate-300">
                            {slot.disponibles.length > 0 ? (
                              slot.disponibles.map((id) => {
                                const info = getUserInfo(id);
                                return (
                                  <div key={id} className="flex items-center gap-1.5">
                                    <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                    <span className="truncate">{info.name}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-slate-400 italic">Aucun</span>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <p className="font-semibold text-amber-400 mb-1.5">
                            🟡 Incertains ({slot.incertains.length})
                          </p>
                          <div className="space-y-1.5 text-slate-300">
                            {slot.incertains.length > 0 ? (
                              slot.incertains.map((id) => {
                                const info = getUserInfo(id);
                                return (
                                  <div key={id} className="flex items-center gap-1.5">
                                    <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                    <span className="truncate">{info.name}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-slate-400 italic">Aucun</span>
                            )}
                          </div>
                        </div>

                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                          <p className="font-semibold text-red-400 mb-1.5">
                            🔴 Indisponibles ({slot.indisponibles.length})
                          </p>
                          <div className="space-y-1.5 text-slate-300">
                            {slot.indisponibles.length > 0 ? (
                              slot.indisponibles.map((id) => {
                                const info = getUserInfo(id);
                                return (
                                  <div key={id} className="flex items-center gap-1.5">
                                    <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                    <span className="truncate">{info.name}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <span className="text-slate-400 italic">Aucun</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bouton Enregistrer ce créneau */}
                    {canEdit && isDirty && (
                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleSaveSingleSlot(slot.id)}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs py-2 px-4 rounded-xl transition flex items-center gap-1.5 shadow"
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: SUIVI DES MEMBRES & PARTIES */}
      {activeTab === 'members' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">
              Suivi individuel et charge sur le mois
            </h3>
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
                  className={`px-2.5 py-1 rounded-lg border transition ${
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

          <div className="overflow-x-auto">
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
            className="bg-slate-900 border-2 border-red-500/70 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
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
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition"
              >
                Rester et enregistrer
              </button>
              <button
                type="button"
                onClick={() => switchPollNow(pendingPollSwitchId)}
                className="px-4 py-2 text-xs font-medium text-red-300 hover:text-white bg-red-950/70 hover:bg-red-700 border border-red-800/60 rounded-xl transition"
              >
                Changer sans enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
