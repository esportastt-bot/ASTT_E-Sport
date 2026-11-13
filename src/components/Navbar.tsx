import React from 'react';
import type { UserProfile } from '../types';
import { Shield, User, Calendar, Vote, BarChart3, PlusCircle } from 'lucide-react';

interface NavbarProps {
  currentScreen: 'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile';
  setScreen: (screen: 'login' | 'dashboard' | 'create' | 'vote' | 'results' | 'profile') => void;
  currentUser: UserProfile;
  toggleUserRole: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  setScreen,
  currentUser,
  toggleUserRole,
}) => {
  const isCaptain = currentUser.role === 'CAPTAIN';

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setScreen('dashboard')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            A
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide text-white">ASTT Planning</h1>
            <p className="text-xs text-slate-400">Disponibilités d'équipe</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setScreen('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              currentScreen === 'dashboard'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Sondages
          </button>

          {isCaptain && (
            <button
              onClick={() => setScreen('create')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                currentScreen === 'create'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Créer sondage
            </button>
          )}

          <button
            onClick={() => setScreen('vote')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              currentScreen === 'vote'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Vote className="w-3.5 h-3.5" />
            Répondre
          </button>

          <button
            onClick={() => setScreen('results')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
              currentScreen === 'results'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Résultats
          </button>
        </nav>

        {/* Persona Switcher & Profile */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleUserRole}
            title="Cliquer pour changer de rôle de test (Capitaine / Membre)"
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition ${
              isCaptain
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {isCaptain ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            <span>{isCaptain ? 'Mode Capitaine' : 'Mode Membre'}</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Changer</span>
          </button>

          <button
            onClick={() => setScreen('login')}
            className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm hover:border-slate-600 transition"
            title="Simuler écran de connexion"
          >
            {currentUser.avatar}
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden flex items-center justify-around bg-slate-900 border-t border-slate-800 p-2 fixed bottom-0 left-0 right-0 z-50">
        <button
          onClick={() => setScreen('dashboard')}
          className={`flex flex-col items-center gap-1 text-[11px] ${
            currentScreen === 'dashboard' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-5 h-5" />
          <span>Sondages</span>
        </button>

        {isCaptain && (
          <button
            onClick={() => setScreen('create')}
            className={`flex flex-col items-center gap-1 text-[11px] ${
              currentScreen === 'create' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span>Créer</span>
          </button>
        )}

        <button
          onClick={() => setScreen('vote')}
          className={`flex flex-col items-center gap-1 text-[11px] ${
            currentScreen === 'vote' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <Vote className="w-5 h-5" />
          <span>Répondre</span>
        </button>

        <button
          onClick={() => setScreen('results')}
          className={`flex flex-col items-center gap-1 text-[11px] ${
            currentScreen === 'results' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span>Résultats</span>
        </button>
      </div>
    </header>
  );
};
