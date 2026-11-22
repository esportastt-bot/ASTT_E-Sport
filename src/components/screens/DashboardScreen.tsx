import React, { useState } from 'react';
import type { Poll, UserProfile } from '../../types';
import {
  PlusCircle, Clock, Users, ArrowRight, CheckCircle2,
  AlertCircle, Trash2, Ban, MoreVertical, Calendar, Loader2,
  Share2, Check, Lock, RotateCcw, AlertTriangle, SlidersHorizontal, Send
} from 'lucide-react';
import { UserAvatar } from '../UserAvatar';
import { formatFRDateTime, formatShortFRDate } from '../../utils/dateUtils';

export interface DashboardNotificationBanner {
  type: 'success' | 'warning';
  title: string;
  details?: string[];
}

interface DashboardScreenProps {
  currentUser: UserProfile;
  polls: Poll[];
  loading?: boolean;
  loadError?: string | null;
  notificationBanner?: DashboardNotificationBanner | null;
  onDismissNotification?: () => void;
  onSelectPoll: (pollId: string, action: 'vote' | 'cockpit') => void;
  onCreatePoll: () => void;
  onDeletePoll?: (pollId: string) => Promise<void> | void;
  onCancelPoll?: (pollId: string) => Promise<void> | void;
  onClosePoll?: (pollId: string) => Promise<void> | void;
  onReopenPoll?: (pollId: string) => Promise<void> | void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  polls,
  loading = false,
  loadError = null,
  notificationBanner = null,
  onDismissNotification,
  onSelectPoll,
  onCreatePoll,
  onDeletePoll,
  onCancelPoll,
  onClosePoll,
  onReopenPoll,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pollToDelete, setPollToDelete] = useState<Poll | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedPollId, setCopiedPollId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManagePoll = (poll: Poll) =>
    currentUser.isAdmin || poll.createdBy === currentUser.id;

  const confirmDelete = async () => {
    if (!pollToDelete || !onDeletePoll) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await onDeletePoll(pollToDelete.id);
      setPollToDelete(null);
    } catch (err: any) {
      console.error('Erreur suppression:', err);
      setActionError(err?.message || 'Impossible de supprimer ce sondage.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = async (pollId: string) => {
    if (!onCancelPoll) return;
    setOpenMenuId(null);
    setActionError(null);
    try {
      await onCancelPoll(pollId);
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'annuler ce sondage.");
    }
  };

  const handleClose = async (pollId: string) => {
    if (!onClosePoll) return;
    setOpenMenuId(null);
    setActionError(null);
    try {
      await onClosePoll(pollId);
    } catch (err: any) {
      setActionError(err?.message || 'Impossible de clôturer ce sondage.');
    }
  };

  const handleReopen = async (pollId: string) => {
    if (!onReopenPoll) return;
    setActionError(null);
    try {
      await onReopenPoll(pollId);
    } catch (err: any) {
      setActionError(err?.message || 'Impossible de rouvrir ce sondage.');
    }
  };

  const handleCopyLink = async (pollId: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?poll=${encodeURIComponent(pollId)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedPollId(pollId);
      setTimeout(() => {
        setCopiedPollId((prev) => (prev === pollId ? null : prev));
      }, 2000);
    } catch {
      window.prompt('Copiez ce lien pour partager le sondage :', shareUrl);
    }
  };

  const openPolls = polls.filter((p) => p.status === 'OPEN');
  const closedPolls = polls.filter((p) => p.status === 'CLOSED' || p.status === 'CANCELLED');

  return (
    <div
      className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-6"
      onClick={() => setOpenMenuId(null)}
    >

      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <UserAvatar avatar={currentUser.avatar} name={currentUser.name} size="md" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Bonjour, {currentUser.name}</h2>
            {currentUser.isAdmin && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
                Admin
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Consultez vos sondages ciblés, indiquez vos disponibilités ou créez un nouveau sondage.
          </p>
        </div>

        <button
          onClick={onCreatePoll}
          className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20 transition active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Nouveau sondage</span>
        </button>
      </div>

      {/* Notification MP Discord / Publication */}
      {notificationBanner && (
        <div
          className={`text-xs rounded-xl p-3.5 border flex items-start justify-between gap-3 animate-fade-slide-up ${
            notificationBanner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-100'
              : 'bg-amber-950/60 border-amber-700/60 text-amber-100'
          }`}
        >
          <div className="space-y-1 min-w-0">
            <p className="font-semibold flex items-center gap-2">
              <Send
                className={`w-4 h-4 shrink-0 ${
                  notificationBanner.type === 'success' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span>{notificationBanner.title}</span>
            </p>
            {notificationBanner.details && notificationBanner.details.length > 0 && (
              <ul className="list-disc pl-6 space-y-0.5 text-[11px] opacity-90">
                {notificationBanner.details.map((detail, idx) => (
                  <li key={idx}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
          {onDismissNotification && (
            <button
              type="button"
              onClick={onDismissNotification}
              className="px-2 py-0.5 rounded hover:bg-white/10 transition shrink-0"
            >
              Fermer
            </button>
          )}
        </div>
      )}

      {/* Erreur de chargement Firestore */}
      {loadError && (
        <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Impossible de charger certains sondages : {loadError}</span>
        </div>
      )}

      {/* Inline Action Error */}
      {actionError && (
        <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-300 hover:text-white px-2 py-0.5 rounded"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400">Chargement de vos sondages...</p>
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {openPolls.map((poll) => {
            const activeSlots = poll.slots.filter((s) => !s.cancelled);
            const totalSlots = activeSlots.length;
            const allRespondedUserIds = new Set<string>(
              Object.keys(poll.desiredGamesByUser || {})
            );
            poll.slots.forEach((s) => {
              s.disponibles.forEach((id) => allRespondedUserIds.add(id));
              s.incertains.forEach((id) => allRespondedUserIds.add(id));
              s.indisponibles.forEach((id) => allRespondedUserIds.add(id));
            });
            const respondentsCount = allRespondedUserIds.size;
            const targetCount = poll.targetUsers?.length || 0;
            const userResponded = allRespondedUserIds.has(currentUser.id);
            const isMenuOpen = openMenuId === poll.id;
            const isCopied = copiedPollId === poll.id;
            const canManage = canManagePoll(poll);

            return (
              <div
                key={poll.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 transition duration-200 hover:-translate-y-0.5 flex flex-col justify-between relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-3">
                  {/* Top row : Voyant statut uniquement + Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="bg-emerald-900/30 text-emerald-400 text-xs font-medium px-2 py-0.5 rounded-lg border border-emerald-700/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Ouvert
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(poll.id)}
                        className={`h-8 px-2.5 rounded-lg flex items-center gap-1 text-[11px] transition border active:scale-95 ${
                          isCopied
                            ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                        title="Copier le lien direct vers ce sondage"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                        <span>{isCopied ? 'Copié' : 'Lien'}</span>
                      </button>

                      {canManage && (
                        <div className="relative">
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
                            <div className="absolute right-0 top-9 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 min-w-[210px] overflow-hidden animate-modal-pop">
                              {onClosePoll && (
                                <button
                                  type="button"
                                  onClick={() => handleClose(poll.id)}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-800 transition text-left"
                                >
                                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Clôturer les votes</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleCancel(poll.id)}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-amber-300 hover:bg-amber-950/40 transition text-left"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>Annuler le sondage</span>
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
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div>
                    <h4 className="font-bold text-base sm:text-lg text-white leading-snug">
                      {poll.title}
                    </h4>
                    <div className="text-xs text-slate-400 mt-1.5 space-y-1">
                      {poll.createdByName && (
                        <p className="text-[11px] text-slate-400">
                          Créé par <span className="text-slate-200 font-medium">{poll.createdByName}</span>
                        </p>
                      )}
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>
                          {poll.startDate && poll.endDate
                            ? `Du ${formatShortFRDate(poll.startDate)} au ${formatShortFRDate(poll.endDate)}`
                            : `${totalSlots} créneau(x)`}
                          {' · '}
                          {totalSlots} créneau(x) actif(s)
                        </span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Clôture : {formatFRDateTime(poll.deadline)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Participation stats */}
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>
                        {targetCount > 0
                          ? `${respondentsCount} / ${targetCount} réponse(s)`
                          : `${respondentsCount} réponse(s)`}
                      </span>
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
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => onSelectPoll(poll.id, 'vote')}
                    className="flex-1 min-h-[42px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95"
                  >
                    <span>{userResponded ? 'Modifier mes réponses' : 'Répondre'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => onSelectPoll(poll.id, 'cockpit')}
                    className="min-h-[42px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium py-2.5 px-3.5 rounded-xl transition border border-slate-700 hover:border-slate-600 flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Pilotage & Résultats</span>
                  </button>
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {closedPolls.map((poll) => {
              const canManage = canManagePoll(poll);
              return (
                <div
                  key={poll.id}
                  className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                          poll.status === 'CANCELLED'
                            ? 'bg-red-950/60 text-red-400 border-red-800/50'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {poll.status === 'CANCELLED' ? 'Annulé' : 'Clôturé'}
                      </span>
                      <span className="font-semibold text-slate-200 truncate">{poll.title}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {canManage && onReopenPoll && (
                      <button
                        type="button"
                        onClick={() => handleReopen(poll.id)}
                        className="bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 px-2.5 py-1.5 rounded-lg border border-indigo-800/50 text-xs transition flex items-center gap-1"
                        title="Rouvrir ce sondage"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="hidden sm:inline">Rouvrir</span>
                      </button>
                    )}
                    <button
                      onClick={() => onSelectPoll(poll.id, 'cockpit')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs transition"
                    >
                      Pilotage
                    </button>
                    {canManage && (
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
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && polls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/50 border border-slate-800/60 rounded-2xl p-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center mb-3">
            <Calendar className="w-7 h-7 text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">Aucun sondage visible</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-md">
            Vous voyez ici uniquement les sondages où vous avez été sélectionné ou ceux que vous avez créés.
          </p>
          <button
            onClick={onCreatePoll}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/25 active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Créer un sondage</span>
          </button>
        </div>
      )}

      {/* Modal Confirmation Suppression */}
      {pollToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-modal-pop"
            onClick={(e) => e.stopPropagation()}
          >
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
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition flex items-center gap-2 shadow-lg shadow-red-600/30 disabled:opacity-60"
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
