import React from 'react';
import type { UserProfile } from '../types';
import { Home, PlusCircle, LogOut, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from './UserAvatar';

export type AppScreen = 'login' | 'dashboard' | 'create' | 'vote' | 'cockpit';

interface NavbarProps {
  currentScreen: AppScreen;
  setScreen: (screen: AppScreen) => void;
  currentUser: UserProfile;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  setScreen,
  currentUser,
  onLogout,
}) => {
  const { logout } = useAuth();
  const handleLogoutClick = onLogout || logout;

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Brand - Clique pour revenir à l'accueil */}
          <div
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group min-w-0"
            onClick={() => setScreen('dashboard')}
            title="Retour à l'accueil"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition shrink-0">
              A
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-base leading-tight tracking-wide text-white group-hover:text-indigo-300 transition truncate">
                ASTT Planning
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                Disponibilités d'équipe
              </p>
            </div>
          </div>

          {/* Actions droite */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Boutons Desktop (cachés sur très petit écran, remplacés par barre basse mobile) */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScreen('dashboard')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition border active:scale-95 ${
                  currentScreen === 'dashboard'
                    ? 'bg-slate-700 border-slate-500 text-white shadow'
                    : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                title="Retour à l'accueil"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Accueil</span>
              </button>

              <button
                type="button"
                onClick={() => setScreen('cockpit')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition border active:scale-95 ${
                  currentScreen === 'cockpit'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                title="Vue d'ensemble et pilotage des sessions"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Pilotage</span>
              </button>

              <button
                type="button"
                onClick={() => setScreen('create')}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition shadow-md active:scale-95 ${
                  currentScreen === 'create'
                    ? 'bg-indigo-500 text-white shadow-indigo-500/30 ring-2 ring-indigo-400/40'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Créer sondage</span>
              </button>
            </div>

            {/* Profil utilisateur connecté */}
            <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs">
              <UserAvatar avatar={currentUser.avatar} name={currentUser.name} size="sm" />
              <span className="font-medium text-white max-w-[120px] truncate hidden md:inline">
                {currentUser.name}
              </span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  currentUser.isAdmin
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {currentUser.isAdmin ? 'Admin' : 'Membre'}
              </span>
            </div>

            {/* Bouton Déconnexion */}
            <button
              type="button"
              onClick={handleLogoutClick}
              title="Se déconnecter"
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-red-950/50 hover:text-red-400 hover:border-red-800/60 border border-slate-700 flex items-center justify-center text-slate-400 transition active:scale-95 shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Barre de navigation basse mobile (< 640px) */}
      <nav
        aria-label="Navigation principale mobile"
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe shadow-2xl"
      >
        <div className="grid grid-cols-3 h-16 px-2 gap-1">
          <button
            type="button"
            onClick={() => setScreen('dashboard')}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95 ${
              currentScreen === 'dashboard'
                ? 'text-white bg-slate-800/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home
              className={`w-5 h-5 transition-transform duration-200 ${
                currentScreen === 'dashboard' ? '-translate-y-0.5 text-indigo-400' : ''
              }`}
            />
            <span className="text-[11px] font-semibold leading-none">Accueil</span>
          </button>

          <button
            type="button"
            onClick={() => setScreen('cockpit')}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95 ${
              currentScreen === 'cockpit'
                ? 'text-white bg-emerald-950/70'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal
              className={`w-5 h-5 transition-transform duration-200 ${
                currentScreen === 'cockpit' ? '-translate-y-0.5 text-emerald-400' : ''
              }`}
            />
            <span className="text-[11px] font-semibold leading-none">Pilotage</span>
          </button>

          <button
            type="button"
            onClick={() => setScreen('create')}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl transition active:scale-95 ${
              currentScreen === 'create'
                ? 'text-white bg-indigo-950/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusCircle
              className={`w-5 h-5 transition-transform duration-200 ${
                currentScreen === 'create' ? '-translate-y-0.5 text-indigo-400' : ''
              }`}
            />
            <span className="text-[11px] font-semibold leading-none">Créer</span>
          </button>
        </div>
      </nav>
    </>
  );
};
