import React from 'react';
import type { Poll } from '../../types';
import { ArrowRight, CalendarCheck2, Gamepad2 } from 'lucide-react';

interface HomeHubScreenProps {
  polls: Poll[];
  loadingPolls?: boolean;
  onOpenPolls: () => void;
  onOpenMatchmaking: () => void;
}

export const HomeHubScreen: React.FC<HomeHubScreenProps> = ({
  polls,
  loadingPolls = false,
  onOpenPolls,
  onOpenMatchmaking,
}) => {
  const openPollsCount = polls.filter((p) => p.status === 'OPEN').length;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {/* Bouton Sondages */}
        <button
          type="button"
          onClick={onOpenPolls}
          className="group text-left bg-slate-900/95 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-2xl p-6 shadow-xl transition duration-200 hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between gap-6"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
                <CalendarCheck2 className="w-6 h-6 text-indigo-400" />
              </div>
              {!loadingPolls && openPollsCount > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {openPollsCount} ouvert(s)
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-indigo-300 transition">
                Sondages
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Accéder à l&apos;interface des sondages et disponibilités.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 group-hover:translate-x-0.5 transition">
            <span>Ouvrir</span>
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>

        {/* Bouton Matchmaking */}
        <button
          type="button"
          onClick={onOpenMatchmaking}
          className="group text-left bg-slate-900/95 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-2xl p-6 shadow-xl transition duration-200 hover:-translate-y-0.5 active:scale-[0.99] flex flex-col justify-between gap-6"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Gamepad2 className="w-6 h-6 text-emerald-400" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-emerald-300 transition">
                Matchmaking
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Créer un post de session dans le forum Discord.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 group-hover:translate-x-0.5 transition">
            <span>Créer un post</span>
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </div>
    </div>
  );
};
