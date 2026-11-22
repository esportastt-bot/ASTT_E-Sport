import React from 'react';
import type { Poll, UserProfile } from '../../types';
import {
  ArrowRight,
  CalendarCheck2,
  Gamepad2,
  PlusCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { UserAvatar } from '../UserAvatar';

interface HomeHubScreenProps {
  currentUser: UserProfile;
  polls: Poll[];
  loadingPolls?: boolean;
  onOpenPolls: () => void;
  onCreatePoll: () => void;
  onOpenCockpit: () => void;
  onOpenMatchmaking: () => void;
}

export const HomeHubScreen: React.FC<HomeHubScreenProps> = ({
  currentUser,
  polls,
  loadingPolls = false,
  onOpenPolls,
  onCreatePoll,
  onOpenCockpit,
  onOpenMatchmaking,
}) => {
  const openPollsCount = polls.filter((p) => p.status === 'OPEN').length;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {/* En-tête de bienvenue */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <UserAvatar avatar={currentUser.avatar} name={currentUser.name} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
                Bonjour, {currentUser.name}
              </h2>
              {currentUser.isAdmin && (
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Choisissez un espace : organiser vos sondages de disponibilités ou publier un post Matchmaking sur Discord.
            </p>
          </div>
        </div>
      </div>

      {/* 2 Modules principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Module 1 : Sondages & Pilotage */}
        <div className="bg-slate-900/95 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between gap-5 transition duration-200 hover:-translate-y-0.5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
                <CalendarCheck2 className="w-6 h-6 text-indigo-400" />
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                  openPollsCount > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {openPollsCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {loadingPolls
                  ? 'Chargement...'
                  : openPollsCount > 0
                    ? `${openPollsCount} sondage(s) ouvert(s)`
                    : 'Aucun sondage actif'}
              </span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Sondages &amp; Pilotage
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Consultez vos sondages ciblés, indiquez vos disponibilités, créez un nouveau sondage hebdomadaire ou pilotez les créneaux retenus.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onOpenPolls}
              className="w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-[0.99]"
            >
              <span>Ouvrir les sondages</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCreatePoll}
                className="min-h-[40px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Nouveau sondage</span>
              </button>
              <button
                type="button"
                onClick={onOpenCockpit}
                className="min-h-[40px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Pilotage</span>
              </button>
            </div>
          </div>
        </div>

        {/* Module 2 : Post Matchmaking Forum Discord */}
        <div className="bg-slate-900/95 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between gap-5 transition duration-200 hover:-translate-y-0.5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-700/40">
                Forum Discord
              </span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Post Matchmaking
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Créez en quelques secondes un post de session de jeu directement dans le forum Matchmaking Discord, avec le lien EVA.gg et l&apos;annonce optionnelle dans le général.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onOpenMatchmaking}
              className="w-full min-h-[44px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.99]"
            >
              <span>Créer un post Matchmaking</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
