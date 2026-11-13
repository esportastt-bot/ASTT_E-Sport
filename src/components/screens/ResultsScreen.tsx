import React, { useState } from 'react';
import type { Poll, UserProfile, TimeSlot } from '../../types';
import { 
  Trophy, AlertTriangle, CheckCircle, Clock, 
  ChevronDown, ChevronUp, UserMinus, UserCheck, Shield
} from 'lucide-react';
import { MOCK_USERS } from '../../mock/data';

interface ResultsScreenProps {
  poll: Poll;
  currentUser: UserProfile;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  poll,
  currentUser,
}) => {
  const isCaptain = currentUser.role === 'CAPTAIN';

  // State to hold manual slot selections (for capacity overflow & waitlists)
  const [slotsState, setSlotsState] = useState<TimeSlot[]>(poll.slots);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(poll.slots[0]?.id || null);

  // 6.1 Classement des créneaux : 1) nb_dispo, 2) nb_incertains
  const rankedSlots = [...slotsState].sort((a, b) => {
    if (b.disponibles.length !== a.disponibles.length) {
      return b.disponibles.length - a.disponibles.length;
    }
    return b.incertains.length - a.incertains.length;
  });

  const getUserName = (userId: string) => {
    const user = MOCK_USERS.find((u) => u.id === userId);
    return user ? `${user.avatar} ${user.name}` : userId;
  };

  const toggleSlotExpand = (slotId: string) => {
    setExpandedSlotId((prev) => (prev === slotId ? null : slotId));
  };

  // Capitaine actions for manual selection & waitlist
  const togglePlayerSelection = (slotId: string, userId: string) => {
    if (!isCaptain) return;
    setSlotsState((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;

        const isCurrentlySelected = slot.selectedIds.includes(userId);
        let newSelected = [...slot.selectedIds];
        let newWaitlist = [...slot.waitlistIds];

        if (isCurrentlySelected) {
          // Move from Selected to Waitlist
          newSelected = newSelected.filter((id) => id !== userId);
          if (!newWaitlist.includes(userId)) newWaitlist.push(userId);
        } else {
          // Move from Waitlist to Selected (if under max or manual decision)
          newWaitlist = newWaitlist.filter((id) => id !== userId);
          if (!newSelected.includes(userId)) newSelected.push(userId);
        }

        return {
          ...slot,
          selectedIds: newSelected,
          waitlistIds: newWaitlist,
        };
      })
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Classement des créneaux
            </span>
            <span className="text-xs text-slate-400">
              {poll.slots.length} créneaux analysés
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
            Les créneaux sont automatiquement ordonnés par popularité décroissante (disponibles, puis incertains).
            {isCaptain && ' En tant que capitaine, vous pouvez ajuster manuellement la composition et la liste d\'attente.'}
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
                {/* Left: Rank & Title */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
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
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <span>{slot.dayName} {slot.dateStr}</span>
                      <span className="text-xs text-indigo-300 font-mono font-medium">
                        ({slot.startTime} - {slot.endTime})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{nbDispo} disponible(s)</span>
                      <span>•</span>
                      <span>{nbIncertain} incertain(s)</span>
                      <span>•</span>
                      <span>{nbIndispo} indisponible(s)</span>
                    </p>
                  </div>
                </div>

                {/* Right: Status Pill & Toggle */}
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
                        <p className="font-semibold text-amber-300">Capacité maximale dépassée ({nbDispo}/{poll.maxParticipants})</p>
                        <p className="text-amber-200/80 mt-0.5">
                          Toutes les personnes disponibles sont affichées. Conformément au cahier des charges, aucune sélection n'est imposée : le capitaine décide manuellement qui est titulaire et qui est en liste d'attente.
                        </p>
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
                        {isCaptain && <span className="text-[10px] text-slate-400">Cliquez pour déplacer</span>}
                      </div>

                      <div className="space-y-1.5">
                        {slot.selectedIds.map((userId) => (
                          <div
                            key={userId}
                            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between"
                          >
                            <span>{getUserName(userId)}</span>
                            {isCaptain && (
                              <button
                                type="button"
                                onClick={() => togglePlayerSelection(slot.id, userId)}
                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-0.5 rounded transition flex items-center gap-1"
                                title="Basculer vers la liste d'attente"
                              >
                                <UserMinus className="w-3 h-3" />
                                Mettre en attente
                              </button>
                            )}
                          </div>
                        ))}

                        {slot.selectedIds.length === 0 && (
                          <p className="text-xs text-slate-400 italic py-2 text-center">
                            Aucun titulaire sélectionné pour le moment
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Colonne Liste d'attente & Remplaçants */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Liste d'attente ({slot.waitlistIds.length})
                        </span>
                        {isCaptain && <span className="text-[10px] text-slate-400">Manuel capitaine</span>}
                      </div>

                      <div className="space-y-1.5">
                        {slot.waitlistIds.map((userId) => (
                          <div
                            key={userId}
                            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 flex items-center justify-between"
                          >
                            <span>{getUserName(userId)}</span>
                            {isCaptain && (
                              <button
                                type="button"
                                onClick={() => togglePlayerSelection(slot.id, userId)}
                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-0.5 rounded transition flex items-center gap-1"
                                title="Passer titulaire"
                              >
                                <UserCheck className="w-3 h-3" />
                                Passer titulaire
                              </button>
                            )}
                          </div>
                        ))}

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
                        <div className="space-y-1 text-slate-300">
                          {slot.disponibles.map((id) => (
                            <div key={id}>{getUserName(id)}</div>
                          ))}
                        </div>
                      </div>

                      {/* Incertains */}
                      <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                        <p className="font-semibold text-amber-400 mb-1.5">
                          🟡 Incertains ({slot.incertains.length})
                        </p>
                        <div className="space-y-1 text-slate-300">
                          {slot.incertains.length > 0 ? (
                            slot.incertains.map((id) => <div key={id}>{getUserName(id)}</div>)
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
                        <div className="space-y-1 text-slate-300">
                          {slot.indisponibles.length > 0 ? (
                            slot.indisponibles.map((id) => <div key={id}>{getUserName(id)}</div>)
                          ) : (
                            <span className="text-slate-400 italic">Aucun</span>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Validation du capitaine */}
                  {isCaptain && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2 px-4 rounded-xl transition flex items-center gap-1.5 shadow"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Valider la composition pour ce créneau</span>
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
