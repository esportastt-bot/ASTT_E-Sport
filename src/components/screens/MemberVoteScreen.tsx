import React, { useEffect, useMemo, useState } from 'react';
import {
  TRAINING_TYPE_LABELS,
  type Poll,
  type UserProfile,
  type ResponseStatus,
} from '../../types';
import {
  CheckCircle2, HelpCircle, XCircle, Clock, Calendar,
  Info, AlertCircle, Save, ArrowLeft, Loader2, Lock, AlertTriangle,
  Gamepad2, Ban, Minus, Plus, Users
} from 'lucide-react';
import { formatFRDateTime, formatShortFRDate } from '../../utils/dateUtils';

interface MemberVoteScreenProps {
  poll: Poll;
  currentUser: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveVotes: (
    votes: Record<string, ResponseStatus>,
    desiredGames: number | null
  ) => Promise<void> | void;
  onBack?: () => void;
}

export const MemberVoteScreen: React.FC<MemberVoteScreenProps> = ({
  poll,
  currentUser,
  onDirtyChange,
  onSaveVotes,
  onBack,
}) => {
  const isClosed = poll.status !== 'OPEN';

  const savedVotes = useMemo(() => {
    const map: Record<string, ResponseStatus> = {};
    poll.slots.forEach((s) => {
      if (s.disponibles.includes(currentUser.id)) map[s.id] = 'DISPONIBLE';
      else if (s.incertains.includes(currentUser.id)) map[s.id] = 'INCERTAIN';
      else if (s.indisponibles.includes(currentUser.id)) map[s.id] = 'INDISPONIBLE';
    });
    return map;
  }, [poll.slots, currentUser.id]);

  const hasSavedDesired = Object.prototype.hasOwnProperty.call(
    poll.desiredGamesByUser || {},
    currentUser.id
  );
  const savedDesiredGames = hasSavedDesired
    ? poll.desiredGamesByUser[currentUser.id]
    : 1;

  const [draftVotes, setDraftVotes] = useState<Record<string, ResponseStatus>>({});
  const [draftDesiredGames, setDraftDesiredGames] = useState<number | null | undefined>(
    undefined
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasUnsavedChanges =
    Object.keys(draftVotes).length > 0 || draftDesiredGames !== undefined;

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const effectiveVotes: Record<string, ResponseStatus> = {
    ...savedVotes,
    ...draftVotes,
  };
  const effectiveDesiredGames: number | null =
    draftDesiredGames !== undefined ? draftDesiredGames : savedDesiredGames;

  const handleVoteChange = (slotId: string, status: ResponseStatus) => {
    if (isClosed) return;
    setDraftVotes((prev) => ({
      ...prev,
      [slotId]: status,
    }));
    setSavedSuccess(false);
    setSaveError(null);
  };

  const handleDesiredChange = (value: number | null) => {
    if (isClosed) return;
    setDraftDesiredGames(value);
    setSavedSuccess(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (isClosed || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSavedSuccess(false);

    try {
      await onSaveVotes(effectiveVotes, effectiveDesiredGames);
      setDraftVotes({});
      setDraftDesiredGames(undefined);
      onDirtyChange?.(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erreur enregistrement votes:', err);
      setSaveError(
        err?.message || "Impossible d'enregistrer vos réponses. Vérifiez votre connexion."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">

      {/* Back to dashboard button */}
      {onBack && (
        <button
          onClick={onBack}
          className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition group mb-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition" />
          <span>Retour à l'accueil</span>
        </button>
      )}

      {/* Header Info */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-indigo-900/40 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-indigo-700/40">
              {TRAINING_TYPE_LABELS[poll.type] || poll.type}
            </span>
            {isClosed ? (
              <span className="text-xs text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700 flex items-center gap-1.5 font-medium">
                <Lock className="w-3 h-3 text-amber-400" />
                {poll.status === 'CANCELLED' ? 'Sondage annulé' : 'Sondage clôturé'}
              </span>
            ) : (
              <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-lg border border-emerald-800/40 flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Sondage ouvert
              </span>
            )}
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Clôture : {formatFRDateTime(poll.deadline)}</span>
          </div>
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">{poll.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Indiquez votre disponibilité pour chaque créneau (1 partie = 1 double session : 2 matchs de 40 min = 1h20).
          </p>
        </div>

        {isClosed ? (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Ce sondage est clôturé — les votes ne sont plus modifiables. Vous pouvez consulter le planning dans Pilotage.
            </p>
          </div>
        ) : (
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-slate-400">
              Vos choix sont enregistrés sous votre compte Discord <strong className="text-slate-200">{currentUser.name}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Objectif de parties sur la période */}
      <div className="bg-slate-900/95 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center shrink-0">
              <Gamepad2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Combien de parties souhaitez-vous faire sur cette période ?
              </h3>
              <p className="text-[11px] text-slate-400">
                1 partie = une double session de 1h20. Utile pour répartir équitablement les joueurs.
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold text-indigo-300 bg-indigo-950/80 px-3 py-1 rounded-lg border border-indigo-800/60 self-start sm:self-auto shrink-0">
            {effectiveDesiredGames === null
              ? 'Illimité'
              : effectiveDesiredGames === 0
              ? '0 partie (ne joue pas)'
              : `${effectiveDesiredGames} partie(s)`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((num) => {
            const active = effectiveDesiredGames === num;
            return (
              <button
                key={num}
                type="button"
                disabled={isClosed}
                onClick={() => handleDesiredChange(num)}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
                  active
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                {num}
              </button>
            );
          })}

          <button
            type="button"
            disabled={isClosed}
            onClick={() => handleDesiredChange(null)}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 ${
              effectiveDesiredGames === null
                ? 'bg-emerald-600 border-emerald-400 text-white shadow'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
            }`}
          >
            Illimité
          </button>

          <div className="w-full sm:w-auto sm:ml-auto flex items-center justify-center sm:justify-end gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              disabled={isClosed || (effectiveDesiredGames !== null && effectiveDesiredGames <= 0)}
              onClick={() =>
                handleDesiredChange(
                  effectiveDesiredGames === null ? 5 : Math.max(0, effectiveDesiredGames - 1)
                )
              }
              className="w-9 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-40 active:scale-95"
              title="Diminuer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-white w-9 text-center">
              {effectiveDesiredGames === null ? '∞' : effectiveDesiredGames}
            </span>
            <button
              type="button"
              disabled={isClosed || (effectiveDesiredGames !== null && effectiveDesiredGames >= 15)}
              onClick={() =>
                handleDesiredChange(
                  effectiveDesiredGames === null ? 1 : Math.min(15, effectiveDesiredGames + 1)
                )
              }
              className="w-9 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-40 active:scale-95"
              title="Augmenter"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slots List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {poll.slots.map((slot) => {
          const isSlotCancelled = Boolean(slot.cancelled);
          const currentVote = effectiveVotes[slot.id];
          const slotMin = slot.minParticipants ?? poll.minParticipants;
          const slotMax = slot.maxParticipants ?? poll.maxParticipants;

          return (
            <div
              key={slot.id}
              className={`bg-slate-900/95 border rounded-2xl p-4 sm:p-5 transition duration-200 shadow-lg space-y-4 ${
                isSlotCancelled
                  ? 'border-red-900/40 bg-slate-950/60 opacity-65'
                  : currentVote === 'DISPONIBLE'
                  ? 'border-emerald-500/40 bg-emerald-950/10'
                  : currentVote === 'INCERTAIN'
                  ? 'border-amber-500/40 bg-amber-950/10'
                  : currentVote === 'INDISPONIBLE'
                  ? 'border-red-500/30 bg-red-950/10'
                  : 'border-slate-800'
              }`}
            >
              {/* Slot Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                    {isSlotCancelled ? (
                      <Ban className="w-4 h-4 text-red-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-indigo-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className={`font-bold text-sm truncate ${isSlotCancelled ? 'text-slate-400 line-through' : 'text-white'}`}>
                      {slot.dayName} {formatShortFRDate(slot.dateStr)}
                    </h4>
                    <span className="text-xs text-indigo-300 font-mono font-medium">
                      {slot.startTime} – {slot.endTime}
                    </span>
                  </div>
                </div>

                {isSlotCancelled ? (
                  <span className="text-[11px] bg-red-950/70 border border-red-800/60 text-red-300 px-2.5 py-1 rounded-lg">
                    Annulé — {slot.cancelReason || 'Créneau indisponible'}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0">
                    <Users className="w-3 h-3 text-slate-400" />
                    {slotMin}–{slotMax} joueurs
                  </span>
                )}
              </div>

              {/* 3 Action Buttons (Touch-friendly) */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isClosed || isSlotCancelled}
                  onClick={() => handleVoteChange(slot.id, 'DISPONIBLE')}
                  className={`min-h-[48px] py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition border active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    currentVote === 'DISPONIBLE'
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500/30'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${currentVote === 'DISPONIBLE' ? 'text-white' : 'text-emerald-400'}`} />
                  <span>Disponible</span>
                </button>

                <button
                  type="button"
                  disabled={isClosed || isSlotCancelled}
                  onClick={() => handleVoteChange(slot.id, 'INCERTAIN')}
                  className={`min-h-[48px] py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition border active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    currentVote === 'INCERTAIN'
                      ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30 ring-2 ring-amber-500/30'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
                  }`}
                >
                  <HelpCircle className={`w-4 h-4 ${currentVote === 'INCERTAIN' ? 'text-white' : 'text-amber-400'}`} />
                  <span>Incertain</span>
                </button>

                <button
                  type="button"
                  disabled={isClosed || isSlotCancelled}
                  onClick={() => handleVoteChange(slot.id, 'INDISPONIBLE')}
                  className={`min-h-[48px] py-2.5 px-2 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition border active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {/* Save Bar (positionnée au-dessus de la barre mobile) */}
      <div className="sticky bottom-[72px] sm:bottom-6 z-30 bg-slate-950/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl">
        <div className="flex items-center gap-2">
          {saveError ? (
            <span className="text-xs text-red-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {saveError}
            </span>
          ) : savedSuccess ? (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Réponses et souhait de parties enregistrés !
            </span>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              {isClosed ? 'Votes verrouillés' : "Pensez à enregistrer vos choix"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isClosed || isSaving}
          className="w-full sm:w-auto min-h-[44px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs py-2.5 px-6 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Enregistrer</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
};
