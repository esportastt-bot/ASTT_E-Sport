import React, { useEffect, useMemo, useState } from 'react';
import {
  TRAINING_TYPE_BADGE_CLASSES,
  TRAINING_TYPE_LABELS,
  type SlotProfile,
  type TrainingType,
  type UserProfile,
} from '../../types';
import {
  ArrowLeft, ArrowRight, Check, Calendar, Users, Settings2,
  Plus, Trash2, ChevronLeft, ChevronRight, Bookmark, BookmarkPlus,
  Eye, CheckCircle2, Clock, Loader2, AlertTriangle, RefreshCw,
  Search, UserPlus, UserMinus
} from 'lucide-react';
import { usePolls } from '../../contexts/PollsContext';
import { UserAvatar } from '../UserAvatar';
import {
  getMonday, addDays, formatISODate, formatFRDate,
  getWeekNumber, DAYS_CONFIG
} from '../../utils/dateUtils';

const TRAINING_TYPES: TrainingType[] = ['ASTT', 'MIX', 'SCRIM', 'ENTRAINEMENT'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CALENDAR_WEEKDAYS = [
  { short: 'L', full: 'Lun' },
  { short: 'M', full: 'Mar' },
  { short: 'M', full: 'Mer' },
  { short: 'J', full: 'Jeu' },
  { short: 'V', full: 'Ven' },
  { short: 'S', full: 'Sam' },
  { short: 'D', full: 'Dim' },
];

function formatDefaultPollTitle(monday: Date): string {
  const num = getWeekNumber(monday);
  const sun = addDays(monday, 6);
  return `Entraînements Semaine ${num} (du ${formatFRDate(monday)} au ${formatFRDate(sun)})`;
}

interface CreatePollWizardProps {
  currentUser: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onPublish: (pollData: any) => Promise<void> | void;
}

interface DaySlotForm {
  startTime: string;
  endTime: string;
  minParticipants: number;
  maxParticipants: number;
  trainingType: TrainingType;
}

interface DayConfig {
  date: Date;
  dateStr: string;
  dayName: string;
  active: boolean;
  slots: DaySlotForm[];
}

export const CreatePollWizard: React.FC<CreatePollWizardProps> = ({
  currentUser,
  onDirtyChange,
  onCancel,
  onPublish,
}) => {
  const {
    guildMembers,
    guildRoles,
    directoryLoading,
    directoryError,
    refreshDirectory,
    slotProfiles,
    saveProfile,
    removeProfile,
  } = usePolls();

  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;
  const [hasEdits, setHasEdits] = useState(false);

  useEffect(() => {
    onDirtyChange?.(hasEdits);
  }, [hasEdits, onDirtyChange]);

  const markDirty = () => {
    setHasEdits(true);
    setPublishError(null);
  };

  // Semaine sélectionnée (par défaut : semaine prochaine)
  const [selectedMonday, setSelectedMonday] = useState<Date>(() =>
    addDays(getMonday(new Date()), 7)
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const initialMonday = addDays(getMonday(new Date()), 7);
    return new Date(initialMonday.getFullYear(), initialMonday.getMonth(), 1);
  });

  const weekNum = getWeekNumber(selectedMonday);
  const sundayDate = addDays(selectedMonday, 6);
  const weekLabel = `Semaine ${weekNum} (du ${formatFRDate(selectedMonday)} au ${formatFRDate(sundayDate)})`;

  // Form State
  const [title, setTitle] = useState(() => formatDefaultPollTitle(addDays(getMonday(new Date()), 7)));
  const [isCustomTitle, setIsCustomTitle] = useState(false);

  // Configuration des jours et créneaux individuels
  const [days, setDays] = useState<DayConfig[]>(() => {
    const initialMonday = addDays(getMonday(new Date()), 7);
    return DAYS_CONFIG.map((d, index) => {
      const dayDate = addDays(initialMonday, index);
      const isWeekday = index < 5;
      return {
        date: dayDate,
        dateStr: formatISODate(dayDate),
        dayName: d.dayName,
        active: isWeekday,
        slots: isWeekday
          ? [
              {
                startTime: '20:30',
                endTime: '21:50',
                minParticipants: 4,
                maxParticipants: 8,
                trainingType: 'ASTT',
              },
            ]
          : [],
      };
    });
  });

  // Profils de créneaux (ex: Profil HFGET)
  const [loadedProfileName, setLoadedProfileName] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Date et heure limites de réponse (clôture)
  const [deadlineDate, setDeadlineDate] = useState(() =>
    formatISODate(addDays(addDays(getMonday(new Date()), 7), -1))
  );
  const [deadlineTime, setDeadlineTime] = useState('20:00');

  // Participants (RIEN n'est coché à la base)
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [manuallyAddedIds, setManuallyAddedIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const applyWeekMonday = (newMonday: Date) => {
    setSelectedMonday(newMonday);
    setCalendarMonth(new Date(newMonday.getFullYear(), newMonday.getMonth(), 1));
    if (!isCustomTitle) {
      setTitle(formatDefaultPollTitle(newMonday));
    }
    setDeadlineDate(formatISODate(addDays(newMonday, -1)));

    setDays((prev) =>
      prev.map((d, index) => {
        const dayDate = addDays(newMonday, index);
        return {
          ...d,
          date: dayDate,
          dateStr: formatISODate(dayDate),
        };
      })
    );
    markDirty();
  };

  const changeWeek = (offsetWeeks: number) => {
    applyWeekMonday(addDays(selectedMonday, offsetWeeks * 7));
  };

  const shiftCalendarMonth = (offsetMonths: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offsetMonths, 1));
  };

  const [todayIso] = useState(() => formatISODate(new Date()));
  const selectedMondayIso = formatISODate(selectedMonday);

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = getMonday(firstOfMonth);
    const weeks: Array<{
      weekNum: number;
      monday: Date;
      mondayIso: string;
      isSelected: boolean;
      days: Array<{
        date: Date;
        iso: string;
        dayNumber: number;
        inMonth: boolean;
        isToday: boolean;
      }>;
    }> = [];

    for (let row = 0; row < 6; row++) {
      const monday = addDays(gridStart, row * 7);
      if (row === 5 && monday.getMonth() !== month) break;
      const mondayIso = formatISODate(monday);
      const weekDays = Array.from({ length: 7 }, (_, col) => {
        const d = addDays(monday, col);
        const iso = formatISODate(d);
        return {
          date: d,
          iso,
          dayNumber: d.getDate(),
          inMonth: d.getMonth() === month,
          isToday: iso === todayIso,
        };
      });
      weeks.push({
        weekNum: getWeekNumber(monday),
        monday,
        mondayIso,
        isSelected: mondayIso === selectedMondayIso,
        days: weekDays,
      });
    }
    return weeks;
  }, [calendarMonth, selectedMondayIso, todayIso]);

  // Charger un profil (ex: Profil HFGET)
  const handleLoadSlotProfile = (profile: SlotProfile) => {
    const defMin = typeof profile.minParticipants === 'number' ? profile.minParticipants : 4;
    const defMax = typeof profile.maxParticipants === 'number' ? profile.maxParticipants : 8;
    const defType: TrainingType = profile.trainingType || 'ASTT';

    setDays((prev) =>
      prev.map((day) => {
        const match = profile.days.find((pd) => pd.dayName === day.dayName);
        if (!match) return day;
        return {
          ...day,
          active: Boolean(match.active),
          slots: match.slots.map((s) => ({
            startTime: s.startTime || '20:30',
            endTime: s.endTime || '21:50',
            minParticipants: typeof s.minParticipants === 'number' ? s.minParticipants : defMin,
            maxParticipants: typeof s.maxParticipants === 'number' ? s.maxParticipants : defMax,
            trainingType: s.trainingType || defType,
          })),
        };
      })
    );
    setLoadedProfileName(profile.name);
    setProfileMessage(
      `Profil « ${profile.name} » chargé. Vous pouvez maintenant modifier librement chaque jour, type, horaire ou min/max.`
    );
    markDirty();
  };

  // Enregistrer le planning actuel comme profil réutilisable
  const handleSaveSlotProfile = async () => {
    const cleanName = newProfileName.trim();
    if (!cleanName || savingProfile) return;

    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const existing = slotProfiles.find(
        (p) =>
          p.name.toLowerCase() === cleanName.toLowerCase() &&
          (currentUser.isAdmin || p.createdBy === currentUser.id)
      );
      const firstActiveSlot = days.flatMap((d) => (d.active ? d.slots : []))[0];

      await saveProfile({
        id: existing?.id,
        name: cleanName,
        createdBy: existing?.createdBy || currentUser.id,
        createdByName: existing?.createdByName || currentUser.name,
        trainingType: firstActiveSlot?.trainingType || 'ASTT',
        minParticipants: firstActiveSlot?.minParticipants ?? 4,
        maxParticipants: firstActiveSlot?.maxParticipants ?? 8,
        days: days.map((d) => ({
          dayName: d.dayName,
          active: d.active,
          slots: d.slots.map((s) => ({
            startTime: s.startTime,
            endTime: s.endTime,
            minParticipants: s.minParticipants,
            maxParticipants: s.maxParticipants,
            trainingType: s.trainingType,
          })),
        })),
      });

      setLoadedProfileName(cleanName);
      setNewProfileName('');
      setProfileMessage(`Profil « ${cleanName} » enregistré !`);
    } catch (err: any) {
      setProfileMessage(err?.message || "Impossible d'enregistrer ce profil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteSlotProfile = async (profile: SlotProfile) => {
    try {
      await removeProfile(profile.id);
      if (loadedProfileName === profile.name) setLoadedProfileName(null);
    } catch (err: any) {
      setProfileMessage(err?.message || 'Impossible de supprimer ce profil.');
    }
  };

  // Toggle active day
  const toggleDayActive = (index: number) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[index];
      const newActive = !target.active;
      copy[index] = {
        ...target,
        active: newActive,
        slots:
          newActive && target.slots.length === 0
            ? [
                {
                  startTime: '20:30',
                  endTime: '21:50',
                  minParticipants: 4,
                  maxParticipants: 8,
                  trainingType: 'ASTT',
                },
              ]
            : target.slots,
      };
      return copy;
    });
    markDirty();
  };

  // Ajouter un créneau à un jour spécifique (hérite du type et du min/max du jour ou des valeurs par défaut)
  const addSlotToDay = (dayIndex: number) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const lastSlot = target.slots[target.slots.length - 1];
      const newStart = lastSlot ? lastSlot.endTime : '20:30';
      const [h, m] = newStart.split(':').map(Number);
      const endH = (h + 1 + Math.floor((m + 20) / 60)) % 24;
      const endM = (m + 20) % 60;
      const newEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      copy[dayIndex] = {
        ...target,
        active: true,
        slots: [
          ...target.slots,
          {
            startTime: newStart,
            endTime: newEnd,
            minParticipants: lastSlot?.minParticipants ?? 4,
            maxParticipants: lastSlot?.maxParticipants ?? 8,
            trainingType: lastSlot?.trainingType ?? 'ASTT',
          },
        ],
      };
      return copy;
    });
    markDirty();
  };

  const removeSlotFromDay = (dayIndex: number, slotIndex: number) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = target.slots.filter((_, idx) => idx !== slotIndex);
      copy[dayIndex] = {
        ...target,
        slots: newSlots,
        active: newSlots.length > 0,
      };
      return copy;
    });
    markDirty();
  };

  const updateSlotTime = (
    dayIndex: number,
    slotIndex: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = [...target.slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
      copy[dayIndex] = { ...target, slots: newSlots };
      return copy;
    });
    markDirty();
  };

  const updateSlotParticipants = (
    dayIndex: number,
    slotIndex: number,
    field: 'minParticipants' | 'maxParticipants',
    value: number
  ) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = [...target.slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
      copy[dayIndex] = { ...target, slots: newSlots };
      return copy;
    });
    markDirty();
  };

  // Appliquer un Min ou Max à tous les créneaux d'un jour donné
  const applyDayParticipants = (
    dayIndex: number,
    field: 'minParticipants' | 'maxParticipants',
    value: number
  ) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      copy[dayIndex] = {
        ...target,
        slots: target.slots.map((s) => ({ ...s, [field]: value })),
      };
      return copy;
    });
    markDirty();
  };

  const updateSlotTrainingType = (
    dayIndex: number,
    slotIndex: number,
    value: TrainingType
  ) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = [...target.slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], trainingType: value };
      copy[dayIndex] = { ...target, slots: newSlots };
      return copy;
    });
    markDirty();
  };

  const applyDayTrainingType = (dayIndex: number, value: TrainingType) => {
    setDays((prev) => {
      const copy = [...prev];
      const target = copy[dayIndex];
      copy[dayIndex] = {
        ...target,
        slots: target.slots.map((s) => ({ ...s, trainingType: value })),
      };
      return copy;
    });
    markDirty();
  };

  // Cocher / décocher un rôle Discord
  const toggleDiscordRole = (roleId: string) => {
    const isCurrentlySelected = selectedRoleIds.includes(roleId);

    if (!isCurrentlySelected) {
      const nextRoleIds = [...selectedRoleIds, roleId];
      setSelectedRoleIds(nextRoleIds);
      const roleMemberIds = guildMembers
        .filter((m) => m.roleIds.includes(roleId))
        .map((m) => m.discordId);

      setSelectedMemberIds((prev) => Array.from(new Set([...prev, ...roleMemberIds])));
    } else {
      const nextRoleIds = selectedRoleIds.filter((id) => id !== roleId);
      setSelectedRoleIds(nextRoleIds);

      setSelectedMemberIds((prev) =>
        prev.filter((uid) => {
          if (manuallyAddedIds.includes(uid)) return true;
          const member = guildMembers.find((m) => m.discordId === uid);
          if (!member) return false;
          return member.roleIds.some((rId) => nextRoleIds.includes(rId));
        })
      );
    }
    markDirty();
  };

  const addMemberToTarget = (discordId: string) => {
    setSelectedMemberIds((prev) => (prev.includes(discordId) ? prev : [...prev, discordId]));
    setManuallyAddedIds((prev) => (prev.includes(discordId) ? prev : [...prev, discordId]));
    markDirty();
  };

  const removeMemberFromTarget = (discordId: string) => {
    setSelectedMemberIds((prev) => prev.filter((id) => id !== discordId));
    setManuallyAddedIds((prev) => prev.filter((id) => id !== discordId));
    markDirty();
  };

  const addAllAvailableMembers = () => {
    const allIds = guildMembers.map((m) => m.discordId);
    setSelectedMemberIds(allIds);
    setManuallyAddedIds(allIds);
    markDirty();
  };

  const clearSelectedMembers = () => {
    setSelectedMemberIds([]);
    setManuallyAddedIds([]);
    setSelectedRoleIds([]);
    markDirty();
  };

  const selectedMembersList = useMemo(
    () =>
      selectedMemberIds
        .map((id) => guildMembers.find((m) => m.discordId === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [selectedMemberIds, guildMembers]
  );

  const unselectedMembersList = useMemo(() => {
    const search = memberSearch.trim().toLowerCase();
    return guildMembers.filter((m) => {
      if (selectedMemberIds.includes(m.discordId)) return false;
      if (!search) return true;
      return (
        m.displayName.toLowerCase().includes(search) ||
        m.username.toLowerCase().includes(search) ||
        m.roleNames.some((rn) => rn.toLowerCase().includes(search))
      );
    });
  }, [guildMembers, selectedMemberIds, memberSearch]);

  const totalSlotsCount = days.reduce(
    (acc, d) => acc + (d.active ? d.slots.length : 0),
    0
  );

  const handleFinish = async () => {
    if (isPublishing) return;
    setPublishError(null);

    if (!title.trim()) {
      setPublishError('Veuillez saisir un titre pour le sondage.');
      return;
    }
    if (totalSlotsCount === 0) {
      setPublishError('Ajoutez au moins un créneau horaire dans la semaine avant de publier.');
      return;
    }

    // Validation Min / Max sur chaque créneau configuré
    for (const d of days) {
      if (!d.active) continue;
      for (let i = 0; i < d.slots.length; i++) {
        const s = d.slots[i];
        if (s.minParticipants < 2) {
          setPublishError(
            `${d.dayName} (créneau ${i + 1}) : le minimum doit être d'au moins 2 joueurs.`
          );
          return;
        }
        if (s.minParticipants > s.maxParticipants) {
          setPublishError(
            `${d.dayName} (${s.startTime}–${s.endTime}) : le minimum (${s.minParticipants}) ne peut pas dépasser le maximum (${s.maxParticipants}).`
          );
          return;
        }
      }
    }

    if (!deadlineDate || !deadlineTime) {
      setPublishError('Veuillez renseigner une date et une heure de clôture valides.');
      return;
    }
    if (selectedMemberIds.length === 0) {
      setPublishError(
        'Sélectionnez au moins un membre dans la zone « Membres concernés » (étape 3) pour qu’il puisse voir ce sondage.'
      );
      return;
    }

    const finalSlots: any[] = [];
    days.forEach((d) => {
      if (d.active) {
        d.slots.forEach((s, idx) => {
          finalSlots.push({
            id: `slot-${d.dateStr}-${s.startTime.replace(':', '')}-${idx}`,
            dateStr: d.dateStr,
            dayName: d.dayName,
            startTime: s.startTime,
            endTime: s.endTime,
            minParticipants: s.minParticipants,
            maxParticipants: s.maxParticipants,
            trainingType: s.trainingType,
            disponibles: [],
            incertains: [],
            indisponibles: [],
            selectedIds: [],
            waitlistIds: [],
          });
        });
      }
    });

    const selectedRoleNames = guildRoles
      .filter((r) => selectedRoleIds.includes(r.id))
      .map((r) => r.name);

    const slotMins = finalSlots.map((s) => s.minParticipants as number);
    const slotMaxs = finalSlots.map((s) => s.maxParticipants as number);
    const derivedType: TrainingType = finalSlots[0]?.trainingType || 'ASTT';
    const derivedMin = slotMins.length > 0 ? Math.min(...slotMins) : 4;
    const derivedMax = slotMaxs.length > 0 ? Math.max(...slotMaxs) : 8;

    setIsPublishing(true);
    try {
      await onPublish({
        title: title.trim(),
        trainingType: derivedType,
        startDate: formatISODate(selectedMonday),
        endDate: formatISODate(sundayDate),
        deadline: `${deadlineDate}T${deadlineTime}:00`,
        minParticipants: derivedMin,
        maxParticipants: derivedMax,
        targetRoles: selectedRoleNames,
        targetUsers: selectedMemberIds,
        excludedUsers: [],
        slots: finalSlots,
      });
      setHasEdits(false);
      onDirtyChange?.(false);
    } catch (err: any) {
      console.error('Erreur publication sondage:', err);
      setPublishError(err?.message || 'Impossible de publier le sondage sur Firestore.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6">

      {/* Top Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <button
            type="button"
            onClick={onCancel}
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à l'accueil
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-white">Créer un sondage hebdomadaire</h2>
        </div>

        <div className="flex items-center gap-2">
          {step < 4 && (
            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Récapitulatif</span>
            </button>
          )}
        </div>
      </div>

      {/* Steps Indicator (lisible sur mobile et desktop) */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {[
          { num: 1, short: 'Semaine', title: 'Titre & Semaine', icon: Calendar },
          { num: 2, short: 'Créneaux', title: 'Créneaux, Types & Profils', icon: Settings2 },
          { num: 3, short: 'Membres', title: 'Membres ciblés', icon: Users },
          { num: 4, short: 'Valider', title: 'Validation', icon: Check },
        ].map((s) => {
          const IconComponent = s.icon;
          const isActive = step === s.num;
          const isPassed = step > s.num;

          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`p-2 sm:p-3 rounded-xl border text-left transition flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-2.5 ${
                isActive
                  ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-950/30'
                  : isPassed
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                  : 'bg-slate-950 border-slate-800/80 text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isPassed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isPassed ? <Check className="w-3.5 h-3.5" /> : <IconComponent className="w-3.5 h-3.5" />}
              </div>
              <span className="sm:hidden text-[11px] font-semibold leading-tight text-center">
                {s.num}. {s.short}
              </span>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-tight">{s.title}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">

        {/* STEP 1: TITRE & SEMAINE (CALENDRIER INTERACTIF) */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Titre du sondage tout en haut */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                Titre du sondage
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  setTitle(nextTitle);
                  setIsCustomTitle(
                    nextTitle.trim().length > 0 &&
                      nextTitle !== formatDefaultPollTitle(selectedMonday)
                  );
                  markDirty();
                }}
                placeholder="Ex: Entraînements Semaine 47..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base sm:text-lg font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
              />
            </div>

            {/* Calendrier interactif & choix de semaine */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Choix de la semaine</span>
                </h3>
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => changeWeek(-1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition"
                    title="Semaine précédente"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Sem. préc.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyWeekMonday(addDays(getMonday(new Date()), 7))}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 text-xs border border-indigo-800/60 transition"
                  >
                    Semaine prochaine
                  </button>
                  <button
                    type="button"
                    onClick={() => changeWeek(1)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 transition"
                    title="Semaine suivante"
                  >
                    <span>Sem. suiv.</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Période sélectionnée */}
              <div className="bg-indigo-950/35 border border-indigo-500/40 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white shrink-0">
                    S{weekNum}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-white">
                    Du {formatFRDate(selectedMonday)} au {formatFRDate(sundayDate)}
                  </span>
                </div>
                <span className="text-[11px] text-indigo-300">
                  Cliquez sur un jour ou un numéro de semaine
                </span>
              </div>

              {/* Calendrier mensuel interactif */}
              <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-2.5 sm:p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(-1)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                    aria-label="Mois précédent"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 min-w-0">
                    <span className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
                      {MONTHS_FR[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyWeekMonday(getMonday(new Date()))}
                      className="text-[11px] font-medium px-2.5 py-0.5 sm:py-1 rounded-lg bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/60 text-slate-200 transition shrink-0"
                    >
                      Aujourd&apos;hui
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(1)}
                    className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                    aria-label="Mois suivant"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-8 gap-1 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 pt-1">
                  <div className="py-1 text-indigo-400/90">Sem</div>
                  {CALENDAR_WEEKDAYS.map((wd, idx) => (
                    <div key={idx} className="py-1">
                      <span className="sm:hidden">{wd.short}</span>
                      <span className="hidden sm:inline">{wd.full}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  {calendarWeeks.map((wk) => (
                    <div
                      key={wk.mondayIso}
                      className={`grid grid-cols-8 gap-1 rounded-xl p-0.5 sm:p-1 transition ${
                        wk.isSelected
                          ? 'bg-indigo-600/25 ring-1 ring-indigo-500/80 shadow-sm shadow-indigo-950/60'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => applyWeekMonday(wk.monday)}
                        className={`py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center transition ${
                          wk.isSelected
                            ? 'bg-indigo-600 text-white shadow'
                            : 'bg-slate-950/90 text-slate-400 hover:text-white'
                        }`}
                        title={`Sélectionner la semaine ${wk.weekNum}`}
                      >
                        S{wk.weekNum}
                      </button>

                      {wk.days.map((day) => (
                        <button
                          key={day.iso}
                          type="button"
                          onClick={() => applyWeekMonday(wk.monday)}
                          className={`py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center transition ${
                            wk.isSelected
                              ? day.isToday
                                ? 'bg-emerald-500/25 text-emerald-200 font-bold ring-1 ring-emerald-400/80'
                                : day.inMonth
                                  ? 'text-white font-semibold hover:bg-indigo-500/30'
                                  : 'text-indigo-200/70 hover:bg-indigo-500/20'
                              : day.isToday
                                ? 'bg-emerald-950/70 text-emerald-300 font-bold ring-1 ring-emerald-500/70 hover:bg-emerald-900/60'
                                : day.inMonth
                                  ? 'text-slate-200 hover:bg-slate-800 hover:text-white'
                                  : 'text-slate-600 hover:bg-slate-800/50 hover:text-slate-400'
                          }`}
                        >
                          {day.dayNumber}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PROFILS & CRÉNEAUX PAR JOUR (AVEC MIN/MAX PAR JOUR ET CRÉNEAU) */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  Étape 2 : Profils, Types, Créneaux & Capacités
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chargez un profil pré-enregistré ou réglez librement les types de session (MIX, SCRIM, ASTT, Entraînement), horaires et min/max de joueurs par jour ou créneau.
                </p>
              </div>

              <span className="text-xs font-semibold text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/60 self-start sm:self-auto">
                {totalSlotsCount} créneau(x) configuré(s)
              </span>
            </div>

            {/* Bloc Profils de créneaux */}
            <div className="bg-slate-950/90 border border-indigo-500/25 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                  <Bookmark className="w-4 h-4" />
                  <span>Profils de créneaux réutilisables</span>
                </div>
                {loadedProfileName && (
                  <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-lg">
                    Chargé : {loadedProfileName}
                  </span>
                )}
              </div>

              {slotProfiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {slotProfiles.map((profile) => {
                    const isLoaded = loadedProfileName === profile.name;
                    const canDelete =
                      currentUser.isAdmin || profile.createdBy === currentUser.id;
                    const activeDaysCount = profile.days.filter((d) => d.active).length;

                    return (
                      <div
                        key={profile.id}
                        className={`flex items-center rounded-xl border text-xs overflow-hidden transition ${
                          isLoaded
                            ? 'bg-indigo-600/25 border-indigo-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleLoadSlotProfile(profile)}
                          className="px-3 py-1.5 flex items-center gap-1.5 hover:text-white transition"
                          title={`Charger les jours et horaires de « ${profile.name} »`}
                        >
                          <Bookmark className="w-3 h-3 text-indigo-400" />
                          <span className="font-semibold">{profile.name}</span>
                          <span className="text-[10px] text-slate-400">
                            ({activeDaysCount}j)
                          </span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSlotProfile(profile)}
                            className="px-2 py-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border-l border-slate-800 transition"
                            title="Supprimer ce profil"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Aucun profil enregistré pour le moment. Configurez vos créneaux ci-dessous puis donnez un nom (ex: <strong className="text-slate-200">Profil HFGET</strong>) pour le réutiliser en 1 clic.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Nom du profil (ex: Profil HFGET)"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSaveSlotProfile}
                  disabled={!newProfileName.trim() || savingProfile}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  {savingProfile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Enregistrer ce planning en profil</span>
                </button>
              </div>

              {profileMessage && (
                <p className="text-[11px] text-emerald-300">{profileMessage}</p>
              )}
            </div>

            {/* Liste des jours de la semaine */}
            <div className="space-y-3">
              {days.map((day, dayIdx) => {
                const dayDateFormatted = formatFRDate(day.date);
                const dayMinVal = day.slots[0]?.minParticipants ?? 4;
                const dayMaxVal = day.slots[0]?.maxParticipants ?? 8;
                const dayTypeVal: TrainingType = day.slots[0]?.trainingType ?? 'ASTT';

                return (
                  <div
                    key={day.dayName}
                    className={`border rounded-2xl p-4 transition ${
                      day.active
                        ? 'bg-slate-950/80 border-slate-700/80'
                        : 'bg-slate-950/30 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`day-${dayIdx}`}
                          checked={day.active}
                          onChange={() => toggleDayActive(dayIdx)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                        <label
                          htmlFor={`day-${dayIdx}`}
                          className="font-bold text-sm text-white cursor-pointer flex items-center gap-2"
                        >
                          <span>{day.dayName}</span>
                          <span className="text-xs font-normal text-slate-400 font-mono">
                            {dayDateFormatted}
                          </span>
                        </label>
                      </div>

                      {day.active && (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Contrôles rapides Type / Min / Max pour tout le jour */}
                          {day.slots.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-[11px]">
                              <span className="text-slate-400">Jour :</span>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span>Type</span>
                                <select
                                  value={dayTypeVal}
                                  onChange={(e) =>
                                    applyDayTrainingType(dayIdx, e.target.value as TrainingType)
                                  }
                                  className={`bg-slate-950 border rounded px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none ${TRAINING_TYPE_BADGE_CLASSES[dayTypeVal]}`}
                                  title="Appliquer ce type de session à tous les créneaux de ce jour"
                                >
                                  {TRAINING_TYPES.map((t) => (
                                    <option key={t} value={t} className="bg-slate-950 text-white">
                                      {TRAINING_TYPE_LABELS[t]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span>Min</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={dayMinVal}
                                  onChange={(e) =>
                                    applyDayParticipants(
                                      dayIdx,
                                      'minParticipants',
                                      parseInt(e.target.value, 10) || 2
                                    )
                                  }
                                  className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                                  title="Appliquer ce minimum à tous les créneaux de ce jour"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-slate-300">
                                <span>Max</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={dayMaxVal}
                                  onChange={(e) =>
                                    applyDayParticipants(
                                      dayIdx,
                                      'maxParticipants',
                                      parseInt(e.target.value, 10) || 8
                                    )
                                  }
                                  className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                                  title="Appliquer ce maximum à tous les créneaux de ce jour"
                                />
                              </label>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => addSlotToDay(dayIdx)}
                            className="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-2.5 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Ajouter créneau</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {day.active && (
                      <div className="space-y-2 pt-2 border-t border-slate-800/60">
                        {day.slots.map((slot, slotIdx) => (
                          <div
                            key={slotIdx}
                            className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 bg-slate-900/90 border border-slate-800 p-3 rounded-xl text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 sm:justify-start">
                              <span className="text-slate-400 font-medium shrink-0">
                                Créneau {slotIdx + 1} :
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSlotFromDay(dayIdx, slotIdx)}
                                className="sm:hidden text-slate-400 hover:text-red-400 p-1.5 rounded-lg bg-slate-950 border border-slate-800 transition"
                                title="Supprimer ce créneau"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-400">Type</span>
                                <select
                                  value={slot.trainingType}
                                  onChange={(e) =>
                                    updateSlotTrainingType(
                                      dayIdx,
                                      slotIdx,
                                      e.target.value as TrainingType
                                    )
                                  }
                                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold border focus:outline-none focus:border-indigo-500 bg-slate-950 ${TRAINING_TYPE_BADGE_CLASSES[slot.trainingType]}`}
                                  aria-label="Type de session du créneau"
                                >
                                  {TRAINING_TYPES.map((t) => (
                                    <option key={t} value={t} className="bg-slate-950 text-white">
                                      {TRAINING_TYPE_LABELS[t]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-400">De</span>
                                <input
                                  type="time"
                                  value={slot.startTime}
                                  onChange={(e) =>
                                    updateSlotTime(dayIdx, slotIdx, 'startTime', e.target.value)
                                  }
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-400">à</span>
                                <input
                                  type="time"
                                  value={slot.endTime}
                                  onChange={(e) =>
                                    updateSlotTime(dayIdx, slotIdx, 'endTime', e.target.value)
                                  }
                                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-950/80 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                                <span className="text-slate-400">Min</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={slot.minParticipants}
                                  onChange={(e) =>
                                    updateSlotParticipants(
                                      dayIdx,
                                      slotIdx,
                                      'minParticipants',
                                      parseInt(e.target.value, 10) || 2
                                    )
                                  }
                                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                                />
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                                <span className="text-slate-400">Max</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={20}
                                  value={slot.maxParticipants}
                                  onChange={(e) =>
                                    updateSlotParticipants(
                                      dayIdx,
                                      slotIdx,
                                      'maxParticipants',
                                      parseInt(e.target.value, 10) || 8
                                    )
                                  }
                                  className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center text-white font-mono"
                                />
                              </label>
                            </div>

                            <span className="text-[10px] text-slate-400">
                              (2 matchs de 40 min = 1h20)
                            </span>

                            <div className="hidden sm:flex ml-auto items-center">
                              <button
                                type="button"
                                onClick={() => removeSlotFromDay(dayIdx, slotIdx)}
                                className="text-slate-400 hover:text-red-400 p-1 transition"
                                title="Supprimer ce créneau"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {day.slots.length === 0 && (
                          <p className="text-xs text-slate-400 italic py-1">
                            Aucun créneau configuré pour ce jour. Cliquez sur « Ajouter créneau ».
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Date & Heure limites */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Date et heure limites de réponse (clôture automatique) :
              </label>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => {
                    setDeadlineDate(e.target.value);
                    markDirty();
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => {
                    setDeadlineTime(e.target.value);
                    markDirty();
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: PARTICIPANTS (2 ZONES DISCORD) */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Étape 3 : Qui peut voir et répondre à ce sondage ?
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Seuls les membres placés dans « Membres concernés » verront ce sondage. Cochez un rôle pour basculer tout le groupe, ou cliquez sur un membre pour le déplacer individuellement.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void refreshDirectory()}
                disabled={directoryLoading}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${directoryLoading ? 'animate-spin' : ''}`} />
                <span>Actualiser Discord</span>
              </button>
            </div>

            {directoryError && (
              <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{directoryError}</span>
              </div>
            )}

            {/* Rôles Discord */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Rôles Discord (cliquer pour basculer les membres du rôle) :
              </label>

              {guildRoles.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {directoryLoading ? 'Chargement des rôles Discord...' : 'Aucun rôle disponible.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {guildRoles.map((role) => {
                    const isSelected = selectedRoleIds.includes(role.id);
                    const countInRole = guildMembers.filter((m) =>
                      m.roleIds.includes(role.id)
                    ).length;

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleDiscordRole(role.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                        <span>{role.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {countInRole}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2 Zones côte à côte */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Tous les membres du serveur ({unselectedMembersList.length})
                  </span>
                  <button
                    type="button"
                    onClick={addAllAvailableMembers}
                    disabled={guildMembers.length === 0}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
                  >
                    Tout ajouter
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Rechercher un pseudo ou rôle..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {directoryLoading && guildMembers.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-slate-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Chargement des membres du serveur ASTT...</span>
                    </div>
                  ) : unselectedMembersList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-6">
                      Aucun autre membre disponible
                    </p>
                  ) : (
                    unselectedMembersList.map((member) => (
                      <button
                        key={member.discordId}
                        type="button"
                        onClick={() => addMemberToTarget(member.discordId)}
                        className="w-full min-h-[44px] p-2 rounded-xl bg-slate-900/90 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/50 text-left flex items-center justify-between gap-2 transition active:scale-[0.99] group"
                        title="Cliquer pour ajouter aux membres concernés"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar avatar={member.avatarUrl} name={member.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-100 truncate">
                              {member.displayName}
                            </p>
                            {member.roleNames.length > 0 && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {member.roleNames.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <UserPlus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-emerald-500/30 rounded-2xl p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-300">
                    Membres concernés ({selectedMembersList.length})
                  </span>
                  {selectedMembersList.length > 0 && (
                    <button
                      type="button"
                      onClick={clearSelectedMembers}
                      className="text-[11px] text-red-400 hover:text-red-300"
                    >
                      Tout retirer
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  Cliquez sur un membre pour le retirer de ce sondage (même s'il appartient à un rôle coché).
                </p>

                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {selectedMembersList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-8">
                      Aucun membre sélectionné pour le moment.
                    </p>
                  ) : (
                    selectedMembersList.map((member) => (
                      <button
                        key={member.discordId}
                        type="button"
                        onClick={() => removeMemberFromTarget(member.discordId)}
                        className="w-full min-h-[44px] p-2 rounded-xl bg-emerald-950/25 hover:bg-red-950/35 border border-emerald-700/40 hover:border-red-500/50 text-left flex items-center justify-between gap-2 transition active:scale-[0.99] group"
                        title="Cliquer pour retirer ce membre"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <UserAvatar avatar={member.avatarUrl} name={member.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate">
                              {member.displayName}
                            </p>
                            {member.roleNames.length > 0 && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {member.roleNames.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <UserMinus className="w-3.5 h-3.5 text-emerald-400 group-hover:text-red-400 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: RÉCAPITULATIF */}
        {step === 4 && (() => {
          const activeSlotsList = days.flatMap((d) => (d.active ? d.slots : []));
          const distinctTypes = Array.from(new Set(activeSlotsList.map((s) => s.trainingType)));
          const minBound = activeSlotsList.length > 0 ? Math.min(...activeSlotsList.map((s) => s.minParticipants)) : 4;
          const maxBound = activeSlotsList.length > 0 ? Math.max(...activeSlotsList.map((s) => s.maxParticipants)) : 8;

          return (
            <div className="space-y-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Étape 4 : Récapitulatif avant publication
              </h3>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Titre :</span>
                  <span className="font-semibold text-white text-right">{title || '—'}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Période :</span>
                  <span className="font-semibold text-white text-right">{weekLabel}</span>
                </div>
                <div className="flex justify-between items-center gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Types de session :</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {distinctTypes.length > 0 ? (
                      distinctTypes.map((t) => (
                        <span
                          key={t}
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${TRAINING_TYPE_BADGE_CLASSES[t]}`}
                        >
                          {TRAINING_TYPE_LABELS[t]}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Créneaux configurés :</span>
                  <span className="font-semibold text-emerald-400">{totalSlotsCount} créneau(x)</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Membres concernés :</span>
                  <span className="font-semibold text-white">
                    {selectedMembersList.length} membre(s)
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Joueurs par créneau :</span>
                  <span className="font-semibold text-white">
                    {minBound === maxBound ? `${minBound}` : `${minBound} à ${maxBound}`} joueurs (selon créneau)
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">Clôture des votes :</span>
                  <span className="font-semibold text-amber-400">
                    {deadlineDate} à {deadlineTime}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300">Détail des créneaux retenus :</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {days
                    .filter((d) => d.active && d.slots.length > 0)
                    .map((d) => (
                      <div key={d.dayName} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                        <span className="font-bold text-white">
                          {d.dayName} {formatFRDate(d.date)}
                        </span>
                        <div className="mt-1.5 space-y-1">
                          {d.slots.map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-1.5 text-[11px]">
                              <span className="text-indigo-300 font-mono">
                                • {s.startTime}–{s.endTime}{' '}
                                <span className="text-slate-400">
                                  ({s.minParticipants}–{s.maxParticipants})
                                </span>
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${TRAINING_TYPE_BADGE_CLASSES[s.trainingType]}`}
                              >
                                {TRAINING_TYPE_LABELS[s.trainingType]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {publishError && (
                <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{publishError}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={isPublishing}
              className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Précédent
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-white px-3 py-2 transition"
            >
              Annuler
            </button>
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20"
            >
              Suivant
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPublishing}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              {isPublishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publication...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Publier le sondage</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
