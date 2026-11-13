import React, { useState } from 'react';
import type { Poll, UserProfile, ResponseStatus } from '../../types';
import { 
  CheckCircle2, HelpCircle, XCircle, Clock, Calendar, 
  Sparkles, AlertCircle, Save 
} from 'lucide-react';

interface MemberVoteScreenProps {
  poll: Poll;
  currentUser: UserProfile;
  onSaveVotes: (votes: Record<string, ResponseStatus>) => void;
}

export const MemberVoteScreen: React.FC<MemberVoteScreenProps> = ({
  poll,
  currentUser,
  onSaveVotes,
}) => {
  // Initialize local votes from poll slots
  const [votes, setVotes] = useState<Record<string, ResponseStatus>>(() => {
    const initial: Record<string, ResponseStatus> = {};
    poll.slots.forEach((s) => {
      if (s.disponibles.includes(currentUser.id)) initial[s.id] = 'DISPONIBLE';
      else if (s.incertains.includes(currentUser.id)) initial[s.id] = 'INCERTAIN';
      else if (s.indisponibles.includes(currentUser.id)) initial[s.id] = 'INDISPONIBLE';
    });
    return initial;
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleVoteChange = (slotId: string, status: ResponseStatus) => {
    setVotes((prev) => ({
      ...prev,
      [slotId]: status,
    }));
    setSavedSuccess(false);
  };

  const handleSave = () => {
    onSaveVotes(votes);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Mock habitual availability indicator
  const habitualStatus: Record<string, string> = {
    Lundi: 'Habituellement dispo 20h-23h',
    Mardi: 'Habituellement dispo 20h-22h',
    Mercredi: 'Pas disponible d’habitude',
    Jeudi: 'Habituellement dispo',
    Vendredi: 'Habituellement dispo',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-900/40 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-indigo-700/40">
              {poll.type}
            </span>
            <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-800/40 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Sondage ouvert
            </span>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Clôture : dimanche 20:00
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-white">{poll.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Indiquez votre disponibilité pour chaque créneau (2 matchs de 40 min = 1h20). Vous pouvez revenir modifier vos réponses jusqu'à la clôture.
          </p>
        </div>

        {/* Habitual availability reminder box */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium text-white">Disponibilités habituelles & exceptions</p>
            <p className="text-slate-400">
              Vos préférences habituelles sont affichées ci-dessous à titre indicatif. Conformément aux règles, aucun choix n'est validé automatiquement à votre place.
            </p>
          </div>
        </div>
      </div>

      {/* Slots List */}
      <div className="space-y-3">
        {poll.slots.map((slot) => {
          const currentVote = votes[slot.id];
          const habit = habitualStatus[slot.dayName];

          return (
            <div
              key={slot.id}
              className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 transition shadow-lg space-y-4 ${
                currentVote === 'DISPONIBLE'
                  ? 'border-emerald-500/40 bg-emerald-950/10'
                  : currentVote === 'INCERTAIN'
                  ? 'border-amber-500/40 bg-amber-950/10'
                  : currentVote === 'INDISPONIBLE'
                  ? 'border-red-500/30 bg-red-950/10'
                  : 'border-slate-800'
              }`}
            >
              {/* Slot Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">
                      {slot.dayName} {slot.dateStr}
                    </h4>
                    <span className="text-xs text-indigo-300 font-mono font-medium">
                      {slot.startTime} – {slot.endTime}
                    </span>
                  </div>
                </div>

                {habit && (
                  <span className="text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800/80 self-start sm:self-auto">
                    💡 {habit}
                  </span>
                )}
              </div>

              {/* 3 Action Buttons (Responsive & Touch-friendly) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                
                {/* DISPONIBLE */}
                <button
                  type="button"
                  onClick={() => handleVoteChange(slot.id, 'DISPONIBLE')}
                  className={`py-3 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition border active:scale-[0.98] ${
                    currentVote === 'DISPONIBLE'
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${currentVote === 'DISPONIBLE' ? 'text-white' : 'text-emerald-400'}`} />
                  <span>Disponible</span>
                </button>

                {/* INCERTAIN */}
                <button
                  type="button"
                  onClick={() => handleVoteChange(slot.id, 'INCERTAIN')}
                  className={`py-3 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition border active:scale-[0.98] ${
                    currentVote === 'INCERTAIN'
                      ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30 ring-2 ring-amber-500/30'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
                  }`}
                >
                  <HelpCircle className={`w-4 h-4 ${currentVote === 'INCERTAIN' ? 'text-white' : 'text-amber-400'}`} />
                  <span>Incertain</span>
                </button>

                {/* INDISPONIBLE */}
                <button
                  type="button"
                  onClick={() => handleVoteChange(slot.id, 'INDISPONIBLE')}
                  className={`py-3 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 transition border active:scale-[0.98] ${
                    currentVote === 'INDISPONIBLE'
                      ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-600/30 ring-2 ring-red-500/30'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-red-500/40 hover:text-red-300'
                  }`}
                >
                  <XCircle className={`w-4 h-4 ${currentVote === 'INDISPONIBLE' ? 'text-white' : 'text-red-400'}`} />
                  <span>Indisponible</span>
                </button>

              </div>
            </div>
          );
        })}
      </div>

      {/* Save Button Floating or Bottom */}
      <div className="sticky bottom-20 md:bottom-6 bg-slate-950/90 backdrop-blur-md p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-2">
          {savedSuccess ? (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Réponses enregistrées avec succès !
            </span>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-indigo-400" />
              N'oubliez pas d'enregistrer vos choix
            </span>
          )}
        </div>

        <button
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-6 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>Enregistrer</span>
        </button>
      </div>

    </div>
  );
};
