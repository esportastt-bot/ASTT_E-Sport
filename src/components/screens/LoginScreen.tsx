import React from 'react';
import { MessageSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const LoginScreen: React.FC = () => {
  const { loginWithDiscord } = useAuth();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-emerald-400 mx-auto flex items-center justify-center text-3xl font-black text-white shadow-lg shadow-indigo-500/25">
            A
          </div>
          <h2 className="text-2xl font-bold text-white">ASTT Planning</h2>
          <p className="text-sm text-slate-400">
            Gestion des présences et des créneaux d'entraînement
          </p>
        </div>

        {/* Discord OAuth2 Button */}
        <div className="space-y-3 pt-2">
          <button
            onClick={loginWithDiscord}
            className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752c4] text-white py-3.5 px-4 rounded-xl font-medium transition shadow-lg shadow-[#5865F2]/20 active:scale-[0.99]"
          >
            <MessageSquare className="w-5 h-5 fill-current" />
            <span>Se connecter avec Discord</span>
          </button>
          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Vérification automatique de vos rôles sur le serveur ASTT</span>
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 space-y-1 text-center">
          <p className="text-slate-300 font-medium">Connexion requise</p>
          <p>
            Connectez-vous avec votre compte Discord pour accéder à vos entraînements et renseigner vos disponibilités.
          </p>
        </div>

        {/* PWA badge */}
        <div className="pt-2 text-center border-t border-slate-800/60">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
            Application installable sur iPhone, Android, Mac et PC
          </span>
        </div>

      </div>
    </div>
  );
};
