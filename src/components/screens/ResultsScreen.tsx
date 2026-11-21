import React, { useState } from 'react';
import type { Poll, UserProfile } from '../../types';
import type { MemberProfile } from '../../firebase/members';
import {
  Trophy, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, UserMinus, UserCheck, Shield, ArrowLeft,
  Sparkles, Loader2, X
} from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import { formatShortFRDate } from '../../utils/dateUtils';

interface ResultsScreenProps {
  poll: Poll;
  currentUser: UserProfile;
  membersMap?: Record<string, MemberProfile>;
  voterNames?: Record<string, string>;
  onUpdateSelection?: (
    pollId: string,
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ) => Promise<void> | void;
  onBack?: () => void;
}

interface SlotDraft {
  selectedIds: string[];
  waitlistIds: string[];
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  poll,
  currentUser,
  membersMap = {},
  voterNames = {},
  onUpdateSelection,
  onBack,
}) => {
  const isCaptain = currentUser.role === 'CAPTAIN';

  const [draftSelections, setDraftSelections] = useState<Record<string, SlotDraft>>({});
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(poll.slots[0]?.id || null);
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null);
  const [savedSlotId, setSavedSlotId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getUserInfo = (userId: string) => {
    const member = membersMap[userId];
    if (member) {
      return {
        name: member.displayName,
        avatar: member.avatarUrl,
      };
    }
    if (userId === currentUser.id) {
      return {
        name: currentUser.name,
        avatar: currentUser.avatar,
      };
    }
    return {
      name: voterNames[userId] || `Joueur ${userId.slice(-4)}`,
      avatar: '',
    };
  };

  // Fusion temps réel Firestore + brouillons locaux en cours d'édition par le capitaine
  const resolvedSlots = poll.slots.map((slot) => {
    const draft = draftSelections[slot.id];
    return {
      ...slot,
      selectedIds: draft ? draft.selectedIds : slot.selectedIds,
      waitlistIds: draft ? draft.waitlistIds : slot.waitlistIds,
    };
  });

  // 6.1 Classement des créneaux : 1) nb_dispo, 2) nb_incertains
  const rankedSlots = [...resolvedSlots].sort((a, b) => {
    if (b.disponibles.length !== a.disponibles.length) {
      return b.disponibles.length - a.disponibles.length;
    }
    return b.incertains.length - a.incertains.length;
  });

  const toggleSlotExpand = (slotId: string) => {
    setExpandedSlotId((prev) => (prev === slotId ? null : slotId));
  };

  const setSlotDraft = (slotId: string, updater: (cur: SlotDraft) => SlotDraft) => {
    if (!isCaptain) return;
    const baseSlot = poll.slots.find((s) => s.id === slotId);
    const current = draftSelections[slotId] || {
      selectedIds: baseSlot?.selectedIds || [],
      waitlistIds: baseSlot?.waitlistIds || [],
    };
    setDraftSelections((prev) => ({
      ...prev,
      [slotId]: updater(current),
    }));
    setSavedSlotId((prev) => (prev === slotId ? null : prev));
    setSaveError(null);
  };

  const moveToSelected = (slotId: string, userId: string) => {
    setSlotDraft(slotId, (cur) => ({
      selectedIds: cur.selectedIds.includes(userId) ? cur.selectedIds : [...cur.selectedIds, userId],
      waitlistIds: cur.waitlistIds.filter((id) => id !== userId),
    }));
  };

  const moveToWaitlist = (slotId: string, userId: string) => {
    setSlotDraft(slotId, (cur) => ({
      selectedIds: cur.selectedIds.filter((id) => id !== userId),
      waitlistIds: cur.waitlistIds.includes(userId) ? cur.waitlistIds : [...cur.waitlistIds, userId],
    }));
  };

  const removeFromAssignment = (slotId: string, userId: string) => {
    setSlotDraft(slotId, (cur) => ({
      selectedIds: cur.selectedIds.filter((id) => id !== userId),
      waitlistIds: cur.waitlistIds.filter((id) => id !== userId),
    }));
  };

  const applyIndicativePreFill = (slotId: string, disponibles: string[]) => {
    setSlotDraft(slotId, (cur) => {
      const nextSelected = [...cur.selectedIds];
      const nextWaitlist = [...cur.waitlistIds];

      for (const uid of disponibles) {
        if (nextSelected.includes(uid) || nextWaitlist.includes(uid)) continue;
        if (nextSelected.length < poll.maxParticipants) {
          nextSelected.push(uid);
        } else {
          nextWaitlist.push(uid);
        }
      }
      return { selectedIds: nextSelected, waitlistIds: nextWaitlist };
    });
  };

  const handleSaveSlotSelection = async (
    slotId: string,
    selectedIds: string[],
    waitlistIds: string[]
  ) => {
    if (!isCaptain || !onUpdateSelection || savingSlotId) return;
    setSavingSlotId(slotId);
    setSaveError(null);
    setSavedSlotId(null);

    try {
      await onUpdateSelection(poll.id, slotId, selectedIds, waitlistIds);
      setDraftSelections((prev) => {
        const next = { ...prev };
        delete next[slotId];
        return next;
      });
      setSavedSlotId(slotId);
      setTimeout(() => {
        setSavedSlotId((prev) => (prev === slotId ? null : prev));
      }, 3000);
    } catch (err: any) {
      console.error('Erreur validation composition:', err);
      setSaveError(err?.message || "Impossible d'enregistrer la composition sur Firestore.");
    } finally {
      setSavingSlotId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Back to dashboard button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition group mb-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
          <span>Retour aux sondages</span>
        </button>
      )}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Classement des créneaux
            </span>
            <span className="text-xs text-slate-400">
              {poll.slots.length} créneau(x) analysé(s)
            </span>
          </div>

          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Min : {poll.minParticipants} | Max : {poll.maxParticipants} joueurs
          </span>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white">{poll.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Les créneaux sont ordonnés par popularité décroissante (disponibles, puis incertains).
            {isCaptain && " En tant que capitaine, composez manuellement les titulaires et la liste d'attente puis validez."}
          </p>
        </div>
      </div>

      {/* Ranked Slots List */}
      <div className="space-y-4">
        {rankedSlots.map((slot, index) => {
          const isExpanded = expandedSlotId === slot.id;
          const nbDispo = slot.disponibles.length;
          const nbIncertain = slot.incertains.length;
          const nbIndispo = slot.indisponibles.length;
          const isExceeded = nbDispo > poll.maxParticipants;
          const isMinReached = nbDispo >= poll.minParticipants;
          const placesRestantes = Math.max(0, poll.maxParticipants - nbDispo);

          const unassignedDisponibles = slot.disponibles.filter(
            (id) => !slot.selectedIds.includes(id) && !slot.waitlistIds.includes(id)
          );
          const hasDraftChanges = Boolean(draftSelections[slot.id]);
          const isSavingThis = savingSlotId === slot.id;
          const isSavedThis = savedSlotId === slot.id;

          return (
            <div
              key={slot.id}
              className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-lg transition ${
                isExceeded
                  ? 'border-amber-500/40'
                  : isMinReached
                  ? 'border-emerald-500/30'
                  : 'border-slate-800'
              }`}
            >
              {/* Summary Bar (Clickable) */}
              <div
                onClick={() => toggleSlotExpand(slot.id)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/40 transition select-none"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      index === 0
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : index === 1
                        ? 'bg-slate-300 text-slate-950'
                        : index === 2
                        ? 'bg-amber-700/80 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    #{index + 1}
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-white flex flex-wrap items-center gap-2">
                      <span>{slot.dayName} {formatShortFRDate(slot.dateStr)}</span>
                      <span className="text-xs text-indigo-300 font-mono font-medium">
                        ({slot.startTime} - {slot.endTime})
                      </span>
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
                  {isExceeded ? (
                    <span className="bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs px-2.5 py-1 rounded-xl font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      Dépassement (+{nbDispo - poll.maxParticipants})
                    </span>
                  ) : isMinReached ? (
                    <span className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs px-2.5 py-1 rounded-xl font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      {placesRestantes === 0 ? 'Complet' : `${placesRestantes} place(s) libre(s)`}
                    </span>
                  ) : (
                    <span className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-2.5 py-1 rounded-xl font-medium">
                      Manque {poll.minParticipants - nbDispo} joueur(s)
                    </span>
                  )}

                  <div className="text-slate-400 hover:text-white p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Expanded Detail Panel */}
              {isExpanded && (
                <div className="border-t border-slate-800 bg-slate-950/70 p-4 sm:p-5 space-y-4">

                  {/* Warning on Capacity Overflow */}
                  {isExceeded && (
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-300">
                          Capacité maximale dépassée ({nbDispo}/{poll.maxParticipants})
                        </p>
                        <p className="text-amber-200/80 mt-0.5">
                          Toutes les personnes disponibles sont affichées. Aucune sélection automatique n'est imposée : le capitaine répartit manuellement titulaires et liste d'attente.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Section Captain: Joueurs disponibles à répartir */}
                  {isCaptain && unassignedDisponibles.length > 0 && (
                    <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-indigo-300">
                          Disponibles à répartir ({unassignedDisponibles.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => applyIndicativePreFill(slot.id, slot.disponibles)}
                          className="text-[11px] bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/50 px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Pré-remplir (indicatif)</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

                  {/* Section: Titulaires sélectionnés & Liste d'attente */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Colonne Titulaires */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Titulaires retenus ({slot.selectedIds.length}/{poll.maxParticipants})
                        </span>
                        {isCaptain && <span className="text-[10px] text-slate-400">Choix capitaine</span>}
                      </div>

                      <div className="space-y-1.5">
                        {slot.selectedIds.map((userId) => {
                          const info = getUserInfo(userId);
                          return (
                            <div
                              key={userId}
                              className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <UserAvatar avatar={info.avatar} name={info.name} size="xs" />
                                <span className="truncate">{info.name}</span>
                              </div>
                              {isCaptain && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => moveToWaitlist(slot.id, userId)}
                                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-0.5 rounded transition flex items-center gap-1"
                                    title="Basculer vers la liste d'attente"
                                  >
                                    <UserMinus className="w-3 h-3" />
                                    Attente
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeFromAssignment(slot.id, userId)}
                                    className="text-slate-400 hover:text-red-400 p-0.5 rounded transition"
                                    title="Retirer de la composition"
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
                        {isCaptain && <span className="text-[10px] text-slate-400">Manuel capitaine</span>}
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
                              </div>
                              {isCaptain && (
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
                                    title="Retirer de la liste d'attente"
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

                  {/* Détail de tous les votes pour ce créneau */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <p className="text-xs font-medium text-slate-400 mb-2">
                      Détail de tous les participants :
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">

                      {/* Disponibles */}
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

                      {/* Incertains */}
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

                      {/* Indisponibles */}
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

                  {/* Validation du capitaine */}
                  {isCaptain && (
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs">
                        {saveError && (
                          <span className="text-red-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {saveError}
                          </span>
                        )}
                        {isSavedThis && (
                          <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Composition enregistrée !
                          </span>
                        )}
                        {!saveError && !isSavedThis && hasDraftChanges && (
                          <span className="text-amber-300">Modifications non enregistrées</span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isSavingThis}
                        onClick={() =>
                          handleSaveSlotSelection(slot.id, slot.selectedIds, slot.waitlistIds)
                        }
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-xs py-2 px-4 rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                      >
                        {isSavingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Enregistrement...</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-3.5 h-3.5" />
                            <span>Valider la composition pour ce créneau</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
