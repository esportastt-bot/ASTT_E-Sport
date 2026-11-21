import { signInWithCustomToken, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './config';

// URL du Cloudflare Worker (sera remplacée par l'URL réelle)
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://astt-auth.YOUR_SUBDOMAIN.workers.dev';

/** Redirige vers Discord OAuth2 */
export function loginWithDiscord(): void {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '1398678314713092228';
  const redirectUri = encodeURIComponent(`${WORKER_URL}/auth/discord/callback`);
  const scope = encodeURIComponent('identify guilds.members.read');
  const state = btoa(window.location.href); // Pour retourner à la bonne page après login
  window.location.href = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
}

/** Sign in Firebase avec le custom token reçu du Worker */
export async function signInWithFirebaseToken(token: string): Promise<User> {
  const { user } = await signInWithCustomToken(auth, token);
  return user;
}

/** Déconnexion */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/** Observer l'état de connexion */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/** Récupère les custom claims du token (isCaptain, discordId, etc.) */
export async function getUserClaims(): Promise<Record<string, any>> {
  const user = auth.currentUser;
  if (!user) return {};
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims;
}
