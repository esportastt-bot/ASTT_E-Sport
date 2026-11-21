import React, { useState } from 'react';
import type { Poll, UserProfile } from '../../types';
import { 
  PlusCircle, Clock, Users, ArrowRight, CheckCircle2, 
  AlertCircle, Trash2, Ban, MoreVertical, Calendar, Loader2 
} from 'lucide-react';

interface DashboardScreenProps {
  currentUser: UserProfile;
  polls: Poll[];
  loading?: boolean;
  onSelectPoll: (pollId: string, action: 'vote' | 'results' | 'edit') => void;
  onCreatePoll: () => void;
  onDeletePoll?: (pollId: string) => Promise<void> | void;
  onCancelPoll?: (pollId: string) => Promise<void> | void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  polls,
  loading = false,
  onSelectPoll,
  onCreatePoll,
  onDeletePoll,
  onCancelPoll,
}) => {
  const isCaptain = currentUser.role === 'CAPTAIN';
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pollToDelete, setPollToDelete] = useState<Poll | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pollToDelete || !onDeletePoll) return;
    setIsDeleting(true);
    try {
      await onDeletePoll(pollToDelete.id);
      setPollToDelete(null);
    } catch (err) {
      console.error('Erreur suppression:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = async (pollId: string) => {
    if (!onCancelPoll) return;
    setOpenMenuId(null);
    await onCancelPoll(pollId);
  };

  const openPolls = polls.filter(p => p.status === 'OPEN');
  const closedPolls = polls.filter(p => p.status === 'CLOSED' || p.status === 'CANCELLED');

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6" onClick={() => setOpenMenuId(null)}>
      
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
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

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Chargement des sondages...</p>
          </div>
        </div>
      )}

      {/* Polls List Header */}
      {!loading && (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <span>Sondages actifs</span>
            <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">
              {openPolls.length}
            </span>
          </h3>
        </div>
      )}

      {/* Poll Cards */}
      {!loading && openPolls.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {openPolls.map((poll) => {
            const totalSlots = poll.slots.length;
            const allRespondedUserIds = new Set<string>();
            poll.slots.forEach(s => {
              s.disponibles.forEach(id => allRespondedUserIds.add(id));
              s.incertains.forEach(id => allRespondedUserIds.add(id));
              s.indisponibles.forEach(id => allRespondedUserIds.add(id));
            });
            const respondentsCount = allRespondedUserIds.size;
            const userResponded = allRespondedUserIds.has(currentUser.id);
            const isMenuOpen = openMenuId === poll.id;

            return (
              <div
                key={poll.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition flex flex-col justify-between relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Captain Action Menu (Supprimer / Annuler) */}
                {isCaptain && (
                  <div className="absolute top-4 right-4 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(isMenuOpen ? null : poll.id);
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Options du sondage"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-9 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 min-w-[200px] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleCancel(poll.id)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-amber-300 hover:bg-amber-950/40 transition text-left"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Annuler (clôturer)</span>
                        </button>
                        
                        <div className="border-t border-slate-800" />

                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setPollToDelete(poll);
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:bg-red-950/40 transition text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer définitivement</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {/* Badges */}
                  <div className="flex items-center gap-2 pr-8">
                    <span className="bg-indigo-900/40 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-indigo-700/40">
                      {poll.type}
                    </span>
                    <span className="bg-emerald-900/30 text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-lg border border-emerald-700/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ouvert
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <h4 className="font-bold text-lg text-white group-hover:text-indigo-400 transition leading-snug pr-6">
                      {poll.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{totalSlots} créneau(x) configuré(s)</span>
                    </p>
                  </div>

                  {/* Participation stats */}
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{respondentsCount} réponse(s)</span>
                    </div>
                    
                    {userResponded ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Répondu
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        À compléter
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
                    <span>{userResponded ? 'Modifier mes réponses' : 'Répondre'}</span>
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
      )}

      {/* Sondages archivés / fermés / annulés */}
      {!loading && closedPolls.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-800/60">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Sondages terminés ou annulés ({closedPolls.length})
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 opacity-75">
            {closedPolls.map(poll => (
              <div
                key={poll.id}
                className="bg-slate-900/50 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      poll.status === 'CANCELLED'
                        ? 'bg-red-950/60 text-red-400 border-red-800/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {poll.status === 'CANCELLED' ? 'Annulé' : 'Clôturé'}
                    </span>
                    <span className="font-semibold text-slate-200">{poll.title}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCaptain && (
                    <button
                      onClick={() => onSelectPoll(poll.id, 'results')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700"
                    >
                      Résultats
                    </button>
                  )}
                  {isCaptain && (
                    <button
                      onClick={() => setPollToDelete(poll)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition"
                      title="Supprimer définitivement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && polls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/50 border border-slate-800/60 rounded-2xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center mb-3">
            <Calendar className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">Aucun sondage en cours</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">
            {isCaptain
              ? 'Vous n\'avez aucun sondage actif pour le moment. Cliquez ci-dessous pour créer le sondage de la semaine prochaine.'
              : 'Votre capitaine n\'a pas encore publié de sondage.'}
          </p>
          {isCaptain && (
            <button
              onClick={onCreatePoll}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/25"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Créer un sondage</span>
            </button>
          )}
        </div>
      )}

      {/* Modal Confirmation Suppression */}
      {pollToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-white">Supprimer ce sondage ?</h4>
                <p className="text-xs text-slate-400">Cette action est irréversible.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              Le sondage <strong>« {pollToDelete.title} »</strong> ainsi que toutes les disponibilités et réponses associées seront définitivement effacés.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPollToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition flex items-center gap-2 shadow-lg shadow-red-600/30"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Supprimer</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
