import React from 'react';
import type { Poll, UserProfile } from '../../types';
import { PlusCircle, Clock, Users, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface DashboardScreenProps {
  currentUser: UserProfile;
  polls: Poll[];
  onSelectPoll: (pollId: string, action: 'vote' | 'results' | 'edit') => void;
  onCreatePoll: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  polls,
  onSelectPoll,
  onCreatePoll,
}) => {
  const isCaptain = currentUser.role === 'CAPTAIN';

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
      
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 rounded-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentUser.avatar}</span>
            <h2 className="text-xl font-bold text-white">Bonjour, {currentUser.name}</h2>
            {isCaptain && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
                Capitaine
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            {isCaptain
              ? 'Gérez vos entraînements et configurez les disponibilités de votre équipe.'
              : 'Indiquez vos disponibilités pour les prochains entraînements.'}
          </p>
        </div>

        {isCaptain && (
          <button
            onClick={onCreatePoll}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20 transition active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nouveau sondage</span>
          </button>
        )}
      </div>

      {/* Polls List Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
          <span>Sondages en cours</span>
          <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">
            {polls.length}
          </span>
        </h3>
      </div>

      {/* Poll Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {polls.map((poll) => {
          const totalSlots = poll.slots.length;
          const userResponded = poll.slots.some((s) =>
            s.disponibles.includes(currentUser.id) ||
            s.incertains.includes(currentUser.id) ||
            s.indisponibles.includes(currentUser.id)
          );

          // Calculate respondents
          const allRespondedUserIds = new Set<string>();
          poll.slots.forEach(s => {
            s.disponibles.forEach(id => allRespondedUserIds.add(id));
            s.incertains.forEach(id => allRespondedUserIds.add(id));
            s.indisponibles.forEach(id => allRespondedUserIds.add(id));
          });
          const respondentsCount = allRespondedUserIds.size;

          return (
            <div
              key={poll.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-900/40 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-indigo-700/40">
                      {poll.type}
                    </span>
                    <span className="bg-emerald-900/30 text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-lg border border-emerald-700/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ouvert
                    </span>
                  </div>

                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Fin dimanche 20h
                  </span>
                </div>

                {/* Title */}
                <div>
                  <h4 className="font-bold text-lg text-white group-hover:text-indigo-400 transition">
                    {poll.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {totalSlots} créneaux proposés (2 matchs de 40 min = 1h20)
                  </p>
                </div>

                {/* Participation stats */}
                <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>Participation :</span>
                    <span className="font-semibold text-white">{respondentsCount} réponses</span>
                  </div>
                  
                  {userResponded ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Vous avez répondu
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      En attente de votre réponse
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => onSelectPoll(poll.id, 'vote')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
                >
                  <span>{userResponded ? 'Modifier mes réponses' : 'Répondre au sondage'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {isCaptain && (
                  <button
                    onClick={() => onSelectPoll(poll.id, 'results')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-2.5 px-3 rounded-xl transition border border-slate-700 flex items-center gap-1"
                  >
                    <span>Résultats</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
