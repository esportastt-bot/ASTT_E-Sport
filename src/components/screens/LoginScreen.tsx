import React from 'react';
import { MessageSquare, Link2, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface LoginScreenProps {
  onLogin: (asCaptain: boolean) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { loginWithDiscord } = useAuth();

  const handleDiscordClick = () => {
    if (import.meta.env.VITE_DISCORD_CLIENT_ID) {
      loginWithDiscord();
    } else {
      // Si pas encore configuré dans .env, simuler connexion capitaine
      onLogin(true);
    }
  };

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
            Gestion simplifiée des présences et des créneaux d'entraînement
          </p>
        </div>

        {/* Discord OAuth2 Button */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleDiscordClick}
            className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752c4] text-white py-3.5 px-4 rounded-xl font-medium transition shadow-lg shadow-[#5865F2]/20 active:scale-[0.99]"
          >
            <MessageSquare className="w-5 h-5 fill-current" />
            <span>Se connecter avec Discord</span>
          </button>
          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Vérification automatique de vos rôles et accès Discord
          </p>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-xs text-slate-400 uppercase tracking-wider">
            Ou accès direct
          </span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        {/* Secondary Access (Direct link) */}
        <div className="space-y-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Link2 className="w-4 h-4 text-indigo-400" />
              Lien personnel d'invitation
            </div>
            <p>
              Vous avez reçu un lien personnel sur Discord ? Cliquez dessus directement pour accéder au sondage sans ressaisir vos identifiants.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onLogin(false)}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-2.5 px-3 rounded-xl text-xs font-medium transition border border-slate-700"
            >
              Tester comme Membre (Thomas)
            </button>
            <button
              onClick={() => onLogin(true)}
              className="flex-1 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 py-2.5 px-3 rounded-xl text-xs font-medium transition border border-indigo-700/50"
            >
              Tester comme Capitaine (Alex)
            </button>
          </div>
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
