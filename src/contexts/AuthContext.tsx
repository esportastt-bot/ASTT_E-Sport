import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthChange, getUserClaims, loginWithDiscord, logout as firebaseLogout, signInWithFirebaseToken } from '../firebase/auth';
import { upsertMember } from '../firebase/members';
import type { UserProfile } from '../types';
import { MOCK_USERS } from '../mock/data';

interface AuthContextType {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithDiscord: () => void;
  logout: () => Promise<void>;
  loginAsDemoUser: (asCaptain: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  loginWithDiscord,
  logout: async () => {},
  loginAsDemoUser: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    // Check local storage for demo user
    const saved = localStorage.getItem('astt_demo_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return MOCK_USERS[0];
      }
    }
    return MOCK_USERS[0]; // Default to Alex (Capitaine) for local testing
  });
  const [loading, setLoading] = useState(true);

  // Gérer le retour depuis Discord OAuth2 : token dans l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const firebaseToken = params.get('fb_token');
    if (firebaseToken) {
      signInWithFirebaseToken(firebaseToken)
        .then(() => {
          localStorage.removeItem('astt_demo_user');
        })
        .catch(console.error);
      // Nettoyer l'URL
      const url = new URL(window.location.href);
      url.searchParams.delete('fb_token');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  // Écouter l'état d'authentification Firebase
  useEffect(() => {
    // Si pas d'API Key configurée (mode dev sans Firebase), on garde le profil local
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = onAuthChange(async (user) => {
        setFirebaseUser(user);
        if (user) {
          try {
            const claims = await getUserClaims();
            const profile: UserProfile = {
              id: user.uid,
              name: claims.display_name || user.displayName || 'Membre ASTT',
              avatar: claims.avatar_url || '🎮',
              role: claims.is_captain ? 'CAPTAIN' : 'MEMBER',
              discordRoles: claims.discord_roles || ['Joueur ASTT'],
            };
            setUserProfile(profile);

            // Sync profil dans Firestore
            await upsertMember({
              discordId: user.uid,
              displayName: profile.name,
              avatarUrl: typeof profile.avatar === 'string' ? profile.avatar : '',
              isCaptain: profile.role === 'CAPTAIN',
              discordRoles: profile.discordRoles,
            }).catch(() => {});
          } catch (e) {
            console.error('Erreur claims utilisateur:', e);
          }
        }
        setLoading(false);
      });
      return unsubscribe;
    } catch {
      setLoading(false);
    }
  }, []);

  const logout = async () => {
    localStorage.removeItem('astt_demo_user');
    setUserProfile(null);
    if (firebaseUser) {
      await firebaseLogout().catch(console.error);
    }
  };

  const loginAsDemoUser = (asCaptain: boolean) => {
    const profile = asCaptain ? MOCK_USERS[0] : MOCK_USERS[1];
    setUserProfile(profile);
    localStorage.setItem('astt_demo_user', JSON.stringify(profile));
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, userProfile, loading, loginWithDiscord, logout, loginAsDemoUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
