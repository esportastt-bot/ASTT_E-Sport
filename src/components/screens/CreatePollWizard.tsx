import React, { useState } from 'react';
import type { TrainingType } from '../../types';
import { 
  ArrowLeft, ArrowRight, Check, Calendar, Users, Settings2, 
  Clock, Plus, Trash2, ChevronLeft, ChevronRight, Copy, 
  Eye, CheckCircle2 
} from 'lucide-react';
import { MOCK_USERS } from '../../mock/data';
import { 
  getMonday, addDays, formatISODate, formatFRDate, 
  getWeekNumber, DAYS_CONFIG 
} from '../../utils/dateUtils';

interface CreatePollWizardProps {
  onCancel: () => void;
  onPublish: (pollData: any) => void;
}

interface DaySlotForm {
  startTime: string;
  endTime: string;
}

interface DayConfig {
  date: Date;
  dateStr: string;
  dayName: string;
  active: boolean;
  slots: DaySlotForm[];
}

export const CreatePollWizard: React.FC<CreatePollWizardProps> = ({
  onCancel,
  onPublish,
}) => {
  const [step, setStep] = useState<number>(1);
  const totalSteps = 4;

  // Semaine sélectionnée (par défaut : semaine prochaine)
  const [selectedMonday, setSelectedMonday] = useState<Date>(() => {
    const nextWeekMonday = addDays(getMonday(new Date()), 7);
    return nextWeekMonday;
  });

  const weekNum = getWeekNumber(selectedMonday);
  const sundayDate = addDays(selectedMonday, 6);
  const weekLabel = `Semaine ${weekNum} (du ${formatFRDate(selectedMonday)} au ${formatFRDate(sundayDate)})`;

  // Form State
  const [title, setTitle] = useState(`Entraînements ${weekLabel}`);
  const [trainingType, setTrainingType] = useState<TrainingType>('ASTT');

  // Configuration des jours et de leurs créneaux individuels
  const [days, setDays] = useState<DayConfig[]>(() => {
    return DAYS_CONFIG.map((d, index) => {
      const dayDate = addDays(selectedMonday, index);
      // Lun à Ven actifs par défaut avec 20:30-21:50
      const isWeekday = index < 5;
      return {
        date: dayDate,
        dateStr: formatISODate(dayDate),
        dayName: d.dayName,
        active: isWeekday,
        slots: isWeekday ? [{ startTime: '20:30', endTime: '21:50' }] : [],
      };
    });
  });

  // Quand on change de semaine, mettre à jour les dates des jours
  const changeWeek = (offsetWeeks: number) => {
    const newMonday = addDays(selectedMonday, offsetWeeks * 7);
    setSelectedMonday(newMonday);
    const newWeekNum = getWeekNumber(newMonday);
    const newSunday = addDays(newMonday, 6);
    const newLabel = `Semaine ${newWeekNum} (du ${formatFRDate(newMonday)} au ${formatFRDate(newSunday)})`;
    setTitle(`Entraînements ${newLabel}`);

    setDays(prev =>
      prev.map((d, index) => {
        const dayDate = addDays(newMonday, index);
        return {
          ...d,
          date: dayDate,
          dateStr: formatISODate(dayDate),
        };
      })
    );
  };

  // Toggle active day
  const toggleDayActive = (index: number) => {
    setDays(prev => {
      const copy = [...prev];
      const target = copy[index];
      const newActive = !target.active;
      copy[index] = {
        ...target,
        active: newActive,
        slots: newActive && target.slots.length === 0 
          ? [{ startTime: '20:30', endTime: '21:50' }] 
          : target.slots,
      };
      return copy;
    });
  };

  // Ajouter un créneau à un jour spécifique
  const addSlotToDay = (dayIndex: number) => {
    setDays(prev => {
      const copy = [...prev];
      const target = copy[dayIndex];
      // Créneau suivant proposé (+1h20 par défaut)
      const lastSlot = target.slots[target.slots.length - 1];
      const newStart = lastSlot ? lastSlot.endTime : '20:30';
      const [h, m] = newStart.split(':').map(Number);
      const endH = (h + 1 + Math.floor((m + 20) / 60)) % 24;
      const endM = (m + 20) % 60;
      const newEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      copy[dayIndex] = {
        ...target,
        active: true,
        slots: [...target.slots, { startTime: newStart, endTime: newEnd }],
      };
      return copy;
    });
  };

  // Supprimer un créneau
  const removeSlotFromDay = (dayIndex: number, slotIndex: number) => {
    setDays(prev => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = target.slots.filter((_, idx) => idx !== slotIndex);
      copy[dayIndex] = {
        ...target,
        slots: newSlots,
        active: newSlots.length > 0, // si plus de créneau, désactive le jour
      };
      return copy;
    });
  };

  // Modifier horaire d'un créneau
  const updateSlotTime = (dayIndex: number, slotIndex: number, field: 'startTime' | 'endTime', value: string) => {
    setDays(prev => {
      const copy = [...prev];
      const target = copy[dayIndex];
      const newSlots = [...target.slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
      copy[dayIndex] = { ...target, slots: newSlots };
      return copy;
    });
  };

  // Dupliquer les créneaux d'un jour sur tous les jours activés
  const duplicateSlotsToAllActiveDays = (sourceDayIndex: number) => {
    const sourceSlots = days[sourceDayIndex].slots;
    if (sourceSlots.length === 0) return;

    setDays(prev =>
      prev.map(d => (d.active ? { ...d, slots: sourceSlots.map(s => ({ ...s })) } : d))
    );
  };

  // Date et heure limites de réponse (clôture)
  // Par défaut : la veille du premier créneau ou le dimanche soir avant la semaine
  const defaultDeadlineDate = formatISODate(addDays(selectedMonday, -1));
  const [deadlineDate, setDeadlineDate] = useState(defaultDeadlineDate);
  const [deadlineTime, setDeadlineTime] = useState('20:00');

  // Participants & Limites
  const [minParticipants, setMinParticipants] = useState(4);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['Joueur ASTT']);
  const [excludedUsers, setExcludedUsers] = useState<string[]>([]);

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleExcluded = (userId: string) => {
    setExcludedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // Membres éligibles
  const eligibleUsers = MOCK_USERS.filter(u => {
    const hasRole = u.discordRoles.some(r => selectedRoles.includes(r));
    const isExcluded = excludedUsers.includes(u.id);
    return hasRole && !isExcluded;
  });

  // Calcul du nombre total de créneaux créés
  const totalSlotsCount = days.reduce((acc, d) => acc + (d.active ? d.slots.length : 0), 0);

  const handleFinish = () => {
    // Génération des créneaux finaux
    const finalSlots: any[] = [];
    days.forEach(d => {
      if (d.active) {
        d.slots.forEach((s, idx) => {
          finalSlots.push({
            id: `slot-${d.dateStr}-${s.startTime.replace(':', '')}-${idx}`,
            dateStr: d.dateStr,
            dayName: d.dayName,
            startTime: s.startTime,
            endTime: s.endTime,
            disponibles: [],
            incertains: [],
            indisponibles: [],
            selectedIds: [],
            waitlistIds: [],
          });
        });
      }
    });

    onPublish({
      title,
      trainingType,
      startDate: formatISODate(selectedMonday),
      endDate: formatISODate(sundayDate),
      deadline: `${deadlineDate}T${deadlineTime}:00`,
      minParticipants,
      maxParticipants,
      slots: finalSlots,
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      
      {/* Top Breadcrumb & Step Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au tableau de bord
          </button>
          <h2 className="text-xl font-bold text-white">Créer un sondage hebdomadaire</h2>
        </div>

        {/* Shortcut to step 4 */}
        {step < 4 && (
          <button
            onClick={() => setStep(4)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Récapitulatif</span>
          </button>
        )}
      </div>

      {/* Steps Indicator */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { num: 1, title: 'Semaine & Type', icon: Settings2 },
          { num: 2, title: 'Créneaux par jour', icon: Calendar },
          { num: 3, title: 'Participants', icon: Users },
          { num: 4, title: 'Validation', icon: Check },
        ].map(s => {
          const IconComponent = s.icon;
          const isActive = step === s.num;
          const isPassed = step > s.num;

          return (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                isActive
                  ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md shadow-indigo-950/30'
                  : isPassed
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                  : 'bg-slate-950 border-slate-800/80 text-slate-400'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isPassed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isPassed ? <Check className="w-3.5 h-3.5" /> : <IconComponent className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold leading-tight">{s.title}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        
        {/* STEP 1: SEMAINE & TYPE */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Étape 1 : Choix de la semaine & Informations
            </h3>

            {/* Sélecteur de Semaine (1 sondage = 1 semaine) */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Semaine concernée :</span>
                <span className="text-[11px] text-slate-400">1 sondage = 1 semaine</span>
              </label>

              <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 p-2 rounded-xl">
                <button
                  type="button"
                  onClick={() => changeWeek(-1)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 transition"
                  title="Semaine précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="text-center">
                  <p className="text-sm font-bold text-white">
                    Semaine {weekNum}
                  </p>
                  <p className="text-xs text-indigo-400 font-mono">
                    du {formatFRDate(selectedMonday)} au {formatFRDate(sundayDate)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => changeWeek(1)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 transition"
                  title="Semaine suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Raccourcis de semaine */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const thisWeekMonday = getMonday(new Date());
                    setSelectedMonday(thisWeekMonday);
                    const wNum = getWeekNumber(thisWeekMonday);
                    const wSun = addDays(thisWeekMonday, 6);
                    setTitle(`Entraînements Semaine ${wNum} (du ${formatFRDate(thisWeekMonday)} au ${formatFRDate(wSun)})`);
                  }}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-300 py-1.5 px-2 rounded-lg text-xs border border-slate-800 transition"
                >
                  Cette semaine
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextWeekMonday = addDays(getMonday(new Date()), 7);
                    setSelectedMonday(nextWeekMonday);
                    const wNum = getWeekNumber(nextWeekMonday);
                    const wSun = addDays(nextWeekMonday, 6);
                    setTitle(`Entraînements Semaine ${wNum} (du ${formatFRDate(nextWeekMonday)} au ${formatFRDate(wSun)})`);
                  }}
                  className="flex-1 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 py-1.5 px-2 rounded-lg text-xs border border-indigo-800/60 transition"
                >
                  Semaine prochaine
                </button>
              </div>
            </div>

            {/* Titre du sondage */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Titre du sondage</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Type de session */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Type de session</label>
              <div className="grid grid-cols-3 gap-3">
                {(['MIX', 'SCRIM', 'ASTT'] as TrainingType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrainingType(t)}
                    className={`py-3 px-4 rounded-xl border text-sm font-semibold transition ${
                      trainingType === t
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Min & Max participants */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Min. participants requis</label>
                <input
                  type="number"
                  min="2"
                  max="16"
                  value={minParticipants}
                  onChange={(e) => setMinParticipants(parseInt(e.target.value) || 4)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Capacité maximale</label>
                <input
                  type="number"
                  min="2"
                  max="16"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(parseInt(e.target.value) || 8)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: CRÉNEAUX PAR JOUR (MULTI-CRÉNEAUX ET HORAIRES DIFFÉRENTS) */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  Étape 2 : Créneaux horaires de la semaine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chaque jour peut avoir des horaires différents et plusieurs créneaux (ex: 18h-19h20 et 20h-21h20).
                </p>
              </div>

              <span className="text-xs font-semibold text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-800/60 self-start sm:self-auto">
                {totalSlotsCount} créneau(x) configuré(s)
              </span>
            </div>

            {/* Liste des jours de la semaine */}
            <div className="space-y-3">
              {days.map((day, dayIdx) => {
                const dayDateFormatted = formatFRDate(day.date);

                return (
                  <div
                    key={day.dayName}
                    className={`border rounded-2xl p-4 transition ${
                      day.active
                        ? 'bg-slate-950/80 border-slate-700/80'
                        : 'bg-slate-950/30 border-slate-850 opacity-60'
                    }`}
                  >
                    {/* Header du jour */}
                    <div className="flex items-center justify-between gap-2 pb-2">
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

                      <div className="flex items-center gap-2">
                        {day.active && (
                          <>
                            {day.slots.length > 0 && (
                              <button
                                type="button"
                                onClick={() => duplicateSlotsToAllActiveDays(dayIdx)}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 transition"
                                title="Copier ces horaires sur tous les autres jours cochés"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copier sur les autres jours</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => addSlotToDay(dayIdx)}
                              className="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-2.5 py-1 rounded-lg transition flex items-center gap-1 shadow-sm"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Ajouter créneau</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Créneaux du jour */}
                    {day.active && (
                      <div className="space-y-2 pt-2 border-t border-slate-800/60">
                        {day.slots.map((slot, slotIdx) => (
                          <div
                            key={slotIdx}
                            className="flex flex-wrap items-center gap-2 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl text-xs"
                          >
                            <span className="text-slate-400 font-medium shrink-0">
                              Créneau {slotIdx + 1} :
                            </span>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400">De</span>
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) =>
                                  updateSlotTime(dayIdx, slotIdx, 'startTime', e.target.value)
                                }
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
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
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                              />
                            </div>

                            <span className="text-[10px] text-slate-400">
                              (2 matchs de 40 min = 1h20)
                            </span>

                            <div className="ml-auto flex items-center">
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

            {/* Date & Heure limites de réponse (Clôture) */}
            <div className="space-y-2 pt-4 border-t border-slate-800">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Date et heure limites de réponse (clôture automatique) :
              </label>

              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: PARTICIPANTS */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Étape 3 : Qui peut participer ?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Toutes les personnes possédant les rôles Discord sélectionnés (ou recevant leur lien direct) pourront voter. L'identification Discord garantit qu'aucune usurpation n'est possible.
              </p>
            </div>

            {/* Rôles ciblés */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Rôles autorisés :</label>
              <div className="flex flex-wrap gap-2">
                {['Joueur ASTT', 'Remplaçant', 'Capitaine', 'Coach'].map(role => {
                  const isSelected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      <span>{role}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Liste des membres résultants & Exclusion manuelle facultative */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Membres éligibles ({eligibleUsers.length} au total)
                </label>
                <span className="text-[11px] text-slate-400">Doublons éliminés automatiquement</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {MOCK_USERS.map(user => {
                  const isExcluded = excludedUsers.includes(user.id);
                  const isTargeted = user.discordRoles.some(r => selectedRoles.includes(r));

                  if (!isTargeted) return null;

                  return (
                    <div
                      key={user.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition ${
                        isExcluded
                          ? 'bg-slate-950/40 border-slate-800/50 text-slate-400 line-through'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{user.avatar}</span>
                        <span className="font-medium">{user.name}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExcluded(user.id)}
                        className={`text-[10px] px-2 py-0.5 rounded transition ${
                          isExcluded
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-850 text-slate-400 hover:text-red-300'
                        }`}
                        title={isExcluded ? 'Réintégrer le membre' : 'Exclure pour ce sondage'}
                      >
                        {isExcluded ? 'Réintégrer' : 'Exclure'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: RÉCAPITULATIF */}
        {step === 4 && (
          <div className="space-y-5">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Étape 4 : Récapitulatif avant publication
            </h3>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Titre :</span>
                <span className="font-semibold text-white">{title}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Période :</span>
                <span className="font-semibold text-white">{weekLabel}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Type de match :</span>
                <span className="font-semibold text-indigo-400">{trainingType}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Créneaux configurés :</span>
                <span className="font-semibold text-emerald-400">{totalSlotsCount} créneaux</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Participants ciblés :</span>
                <span className="font-semibold text-white">{eligibleUsers.length} membres</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Min / Max :</span>
                <span className="font-semibold text-white">{minParticipants} min / {maxParticipants} max</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Clôture des votes :</span>
                <span className="font-semibold text-amber-400">{deadlineDate} à {deadlineTime}</span>
              </div>
            </div>

            {/* Aperçu des créneaux configurés */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">Détail des créneaux retenus :</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {days.filter(d => d.active).map(d => (
                  <div key={d.dayName} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <span className="font-bold text-white">{d.dayName} {formatFRDate(d.date)}</span>
                    <div className="mt-1 space-y-0.5">
                      {d.slots.map((s, idx) => (
                        <div key={idx} className="text-indigo-300 font-mono text-[11px]">
                          • {s.startTime} à {s.endTime}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl transition"
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
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              <Check className="w-4 h-4" />
              Publier le sondage
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
