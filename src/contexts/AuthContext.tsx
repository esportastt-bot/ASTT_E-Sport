import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthChange,
  getUserClaims,
  loginWithDiscord,
  logout as firebaseLogout,
  signInWithFirebaseToken,
} from '../firebase/auth';
import { upsertMember } from '../firebase/members';
import type { UserProfile } from '../types';

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  loginWithDiscord: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  authError: null,
  clearAuthError: () => {},
  loginWithDiscord,
  logout: async () => {},
});

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  discord_denied: "Connexion Discord annulée. Vous pouvez réessayer quand vous êtes prêt.",
  no_code: "Code d'autorisation Discord manquant lors de la redirection.",
  not_in_guild: "Accès refusé : votre compte Discord n'est pas membre du serveur ASTT.",
  discord_exchange_failed: "Échec de la validation du code Discord (redirect_uri ou identifiants OAuth2 invalides).",
  worker_misconfigured: "Le serveur d'authentification Discord est incomplètement configuré.",
  firebase_token_failed: "Impossible de générer la session sécurisée Firebase.",
  server_error: "Une erreur serveur est survenue pendant la connexion Discord.",
};

function mapAuthError(err: unknown): string {
  const code = (err as any)?.code || '';
  const msg = (err as any)?.message || String(err);
  if (code === 'auth/configuration-not-found' || msg.includes('CONFIGURATION_NOT_FOUND')) {
    return "Firebase Authentication n'est pas encore activé sur le projet astt-sondages-app (erreur CONFIGURATION_NOT_FOUND). Activez Authentication dans la console Firebase puis réessayez.";
  }
  if (code === 'auth/invalid-custom-token') {
    return "Le jeton de session Firebase est invalide ou expiré. Veuillez vous reconnecter avec Discord.";
  }
  return `Impossible de finaliser la connexion : ${msg}`;
}

// Garde module pour éviter un double échange en React StrictMode
let consumedFbToken: string | null = null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hasFirebaseConfig = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get('error');
    if (!errParam) return null;
    return OAUTH_ERROR_MESSAGES[errParam] || `Erreur d'authentification : ${errParam}`;
  });
  const [loading, setLoading] = useState<boolean>(hasFirebaseConfig);

  const clearAuthError = () => setAuthError(null);

  // Gérer les paramètres URL OAuth2 (?fb_token=... ou ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const firebaseToken = params.get('fb_token');
    const urlError = params.get('error');

    if (firebaseToken || urlError) {
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete('fb_token');
      cleaned.searchParams.delete('error');
      window.history.replaceState({}, '', cleaned.pathname + cleaned.search);
    }

    if (firebaseToken && firebaseToken !== consumedFbToken) {
      consumedFbToken = firebaseToken;
      signInWithFirebaseToken(firebaseToken).catch((err) => {
        console.error('Erreur signInWithCustomToken:', err);
        setAuthError(mapAuthError(err));
        setLoading(false);
      });
    }
  }, []);

  // Écouter l'état d'authentification Firebase
  useEffect(() => {
    if (!hasFirebaseConfig) {
      return;
    }

    try {
      const unsubscribe = onAuthChange(async (user) => {
        setFirebaseUser(user);

        if (!user) {
          setUserProfile(null);
          setLoading(false);
          return;
        }

        try {
          let claims = await getUserClaims(false);
          if (!claims.display_name) {
            claims = await getUserClaims(true);
          }

          const isCaptain = claims.is_captain === true || claims.role === 'CAPTAIN';
          const roles: string[] =
            Array.isArray(claims.discord_roles) && claims.discord_roles.length > 0
              ? claims.discord_roles
              : ['Membre'];

          const profile: UserProfile = {
            id: user.uid,
            name: claims.display_name || user.displayName || 'Membre ASTT',
            avatar: claims.avatar_url || '🎮',
            role: isCaptain ? 'CAPTAIN' : 'MEMBER',
            discordRoles: roles,
          };

          setUserProfile(profile);
          setAuthError(null);

          upsertMember({
            discordId: user.uid,
            displayName: profile.name,
            avatarUrl: typeof profile.avatar === 'string' ? profile.avatar : '',
            isCaptain: profile.role === 'CAPTAIN',
            discordRoles: profile.discordRoles,
          }).catch((err) => {
            console.warn('Impossible de synchroniser le profil membre Firestore:', err);
          });
        } catch (err) {
          console.error('Erreur claims utilisateur:', err);
          setAuthError(mapAuthError(err));
        } finally {
          setLoading(false);
        }
      });

      return unsubscribe;
    } catch (err) {
      console.error('Erreur initialisation listener auth:', err);
      return;
    }
  }, [hasFirebaseConfig]);

  const logout = async () => {
    localStorage.removeItem('astt_demo_user');
    setUserProfile(null);
    setFirebaseUser(null);
    setAuthError(null);
    await firebaseLogout().catch(console.error);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        loading,
        authError,
        clearAuthError,
        loginWithDiscord,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
