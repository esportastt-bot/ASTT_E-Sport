import React from 'react';
import type { UserProfile } from '../types';
import { PlusCircle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from './UserAvatar';

interface NavbarProps {
  currentScreen: 'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile';
  setScreen: (screen: 'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile') => void;
  currentUser: UserProfile;
}

export const Navbar: React.FC<NavbarProps> = ({
  setScreen,
  currentUser,
}) => {
  const { logout } = useAuth();
  const isCaptain = currentUser.role === 'CAPTAIN';

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand - Clique pour revenir au Tableau de bord */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => setScreen('dashboard')}
          title="Retour aux sondages"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition">
            A
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide text-white group-hover:text-indigo-300 transition">
              ASTT Planning
            </h1>
            <p className="text-xs text-slate-400">Disponibilités d'équipe</p>
          </div>
        </div>

        {/* Actions droite : Créer sondage (capitaine) + Profil + Déconnexion */}
        <div className="flex items-center gap-3">
          {isCaptain && (
            <button
              onClick={() => setScreen('create')}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Créer sondage</span>
            </button>
          )}

          {/* Profil utilisateur connecté */}
          <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 px-2.5 py-1.5 rounded-xl text-xs">
            <UserAvatar avatar={currentUser.avatar} name={currentUser.name} size="sm" />
            <span className="font-medium text-white max-w-[120px] truncate">{currentUser.name}</span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isCaptain
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {isCaptain ? 'Capitaine' : 'Joueur'}
            </span>
          </div>

          {/* Bouton Déconnexion */}
          <button
            onClick={logout}
            title="Se déconnecter"
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-red-950/50 hover:text-red-400 hover:border-red-800/60 border border-slate-700 flex items-center justify-center text-slate-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
