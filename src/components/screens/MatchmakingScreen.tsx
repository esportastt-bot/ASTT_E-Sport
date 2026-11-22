import React, { useMemo, useState } from 'react';
import type { UserProfile } from '../../types';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gamepad2,
  Loader2,
  MapPin,
  Megaphone,
  Plus,
  Send,
  Trash2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import {
  createMatchmakingForumPost,
  type CreateMatchmakingResult,
  type MatchmakingLevel,
} from '../../firebase/matchmaking';
import { formatISODate } from '../../utils/dateUtils';

interface MatchmakingScreenProps {
  currentUser: UserProfile;
  onBack: () => void;
}

const LEVELS: Array<{ value: MatchmakingLevel; emoji: string; badgeClass: string }> = [
  {
    value: 'Débutant',
    emoji: '🟢',
    badgeClass: 'border-emerald-500/60 bg-emerald-600/20 text-emerald-200',
  },
  {
    value: 'Intermédiaire',
    emoji: '🟡',
    badgeClass: 'border-amber-500/60 bg-amber-600/20 text-amber-200',
  },
  {
    value: 'Confirmé',
    emoji: '🔴',
    badgeClass: 'border-rose-500/60 bg-rose-600/20 text-rose-200',
  },
];

const ARENA_PRESETS = ['Arène 1', 'Arène 2'];

function detectDefaultLevel(roles: string[]): MatchmakingLevel {
  const lower = roles.map((r) => r.toLowerCase());
  if (lower.some((n) => n.includes('confirmé') || n.includes('pro'))) return 'Confirmé';
  if (lower.some((n) => n.includes('intermédiaire') || n.includes('intermediaire'))) {
    return 'Intermédiaire';
  }
  return 'Débutant';
}

function detectTeamRoles(roles: string[]): string[] {
  const teams = roles
    .filter((r) => r.startsWith('>>'))
    .map((r) => r.slice(2).trim())
    .filter(Boolean);
  return Array.from(new Set(['ASTT', ...teams]));
}

function formatDateFr(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({
  currentUser,
  onBack,
}) => {
  const teamPresets = useMemo(
    () => detectTeamRoles(currentUser.discordRoles || []),
    [currentUser.discordRoles]
  );
  const initialTeam = teamPresets.length > 1 ? teamPresets[1] : 'ASTT';

  const [todayIso] = useState(() => formatISODate(new Date()));
  const [equipe, setEquipe] = useState<string>(initialTeam);
  const [level, setLevel] = useState<MatchmakingLevel>(() =>
    detectDefaultLevel(currentUser.discordRoles || [])
  );
  const [arena, setArena] = useState<string>('Arène 1');
  const [date, setDate] = useState<string>(todayIso);
  const [time1, setTime1] = useState<string>('20:30');
  const [hasSecondTime, setHasSecondTime] = useState<boolean>(false);
  const [time2, setTime2] = useState<string>('21:10');
  const [announceGeneral, setAnnounceGeneral] = useState<boolean>(
    initialTeam.toUpperCase() === 'ASTT'
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<CreateMatchmakingResult | null>(null);

  const handleSelectTeamPreset = (teamName: string) => {
    setEquipe(teamName);
    setAnnounceGeneral(teamName.toUpperCase() === 'ASTT');
  };

  const handleEquipeChange = (val: string) => {
    setEquipe(val);
    const cleaned = (val.trim() || 'ASTT').toUpperCase();
    setAnnounceGeneral(cleaned === 'ASTT');
  };

  const previewTitle = useMemo(() => {
    const cleanEquipe = equipe.trim() || 'ASTT';
    const cleanArena = arena.trim() || 'Arène 1';
    const times = hasSecondTime && time2 ? [time1, time2] : [time1];
    return `» ${cleanEquipe} - ${cleanArena} - ${formatDateFr(date)} à ${times.filter(Boolean).join(' ou ')}`;
  }, [equipe, arena, date, time1, hasSecondTime, time2]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const cleanArena = arena.trim();
    if (!cleanArena) {
      setError('Veuillez indiquer une arène.');
      return;
    }
    if (!date) {
      setError('Veuillez choisir une date.');
      return;
    }
    const times = [time1, ...(hasSecondTime && time2 ? [time2] : [])].filter(Boolean);
    if (times.length === 0) {
      setError('Veuillez indiquer au moins un créneau horaire.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createMatchmakingForumPost({
        equipe: equipe.trim() || 'ASTT',
        level,
        arena: cleanArena,
        date,
        times,
        announceGeneral,
      });
      setCreatedResult(res);
    } catch (err: any) {
      setError(err?.message || 'Impossible de publier le post sur Discord.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setCreatedResult(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour au menu principal</span>
          </button>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <span>Créer un post Matchmaking</span>
          </h2>
        </div>
      </div>

      {/* Succès après création */}
      {createdResult ? (
        <div className="bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-6 shadow-xl space-y-5 animate-modal-pop">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white">
                Post publié dans le forum Discord !
              </h3>
              <p className="text-xs sm:text-sm text-emerald-300 font-medium break-words">
                {createdResult.title}
              </p>
              {createdResult.announcedGeneral && (
                <p className="text-xs text-slate-300">
                  L&apos;annonce a également été publiée dans le salon général.
                </p>
              )}
              {createdResult.announceError && (
                <p className="text-xs text-amber-300">
                  Post créé, mais annonce générale impossible : {createdResult.announceError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-slate-800">
            {createdResult.threadUrl && (
              <a
                href={createdResult.threadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <span>Ouvrir le post dans Discord</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium px-4 py-2.5 rounded-xl border border-slate-700 transition"
            >
              Créer un autre post
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5"
        >
          {/* Équipe */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Équipe (vide = ASTT)</span>
            </label>
            {teamPresets.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {teamPresets.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectTeamPreset(t)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                      equipe.trim().toLowerCase() === t.toLowerCase()
                        ? 'bg-indigo-600/25 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              maxLength={30}
              value={equipe}
              onChange={(e) => handleEquipeChange(e.target.value)}
              placeholder="ASTT"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Niveau */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">Niveau</label>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => setLevel(lvl.value)}
                  className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                    level === lvl.value
                      ? lvl.badgeClass
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span>{lvl.emoji}</span>
                  <span className="truncate">{lvl.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Arène */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Arène</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ARENA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setArena(preset)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                    arena.trim().toLowerCase() === preset.toLowerCase()
                      ? 'bg-emerald-600/25 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              maxLength={30}
              value={arena}
              onChange={(e) => setArena(e.target.value)}
              placeholder="Ex: Arène 1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Date & Horaires */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>Date</span>
              </label>
              <input
                type="date"
                required
                min={todayIso}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Créneau(x) horaire(s)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  value={time1}
                  onChange={(e) => setTime1(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                {!hasSecondTime && (
                  <button
                    type="button"
                    onClick={() => setHasSecondTime(true)}
                    className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 shrink-0 transition"
                    title="Ajouter un 2e horaire"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>2e heure</span>
                  </button>
                )}
              </div>
              {hasSecondTime && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={time2}
                    onChange={(e) => setTime2(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setHasSecondTime(false)}
                    className="min-h-[42px] px-3 rounded-xl bg-slate-950 hover:bg-red-950/50 border border-slate-800 hover:border-red-700/50 text-slate-400 hover:text-red-300 transition shrink-0"
                    title="Retirer le 2e horaire"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Option annonce salon général */}
          <label className="flex items-start gap-2.5 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 cursor-pointer text-xs text-slate-200">
            <input
              type="checkbox"
              checked={announceGeneral}
              onChange={(e) => setAnnounceGeneral(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
            />
            <span className="space-y-0.5">
              <span className="font-semibold flex items-center gap-1.5 text-white">
                <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                Annoncer dans le salon général (@everyone)
              </span>
              <span className="block text-[11px] text-slate-400">
                Coché automatiquement lorsque l&apos;équipe est ASTT.
              </span>
            </span>
          </label>

          {/* Aperçu du titre */}
          <div className="bg-indigo-950/25 border border-indigo-500/30 rounded-xl p-3 text-xs space-y-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-indigo-300">
              Aperçu du titre du post Discord
            </span>
            <p className="text-sm font-bold text-white break-words">{previewTitle}</p>
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-700/60 text-red-200 text-xs rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publication sur Discord...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Publier dans le forum Discord</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
