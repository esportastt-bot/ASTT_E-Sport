import { signInWithCustomToken, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './config';
import type { GuildMember, GuildRole } from '../types';

export const WORKER_URL = (
  import.meta.env.VITE_WORKER_URL || 'https://astt-auth.esport-sondage.workers.dev'
).replace(/\/+$/, '');

const DISCORD_CLIENT_ID =
  import.meta.env.VITE_DISCORD_CLIENT_ID || '1573662733549707274';

/** Encode une chaîne UTF-8 en base64url sans caractères problématiques */
function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Retourne l'URL de callback OAuth2 Discord attendue par le Worker */
export function getDiscordOAuthRedirectUri(): string {
  return `${WORKER_URL}/auth/discord/callback`;
}

/** Redirige vers Discord OAuth2 */
export function loginWithDiscord(): void {
  const returnUrl = new URL(window.location.href);
  returnUrl.searchParams.delete('fb_token');
  returnUrl.searchParams.delete('error');

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: getDiscordOAuthRedirectUri(),
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state: encodeBase64Url(returnUrl.toString()),
  });

  window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
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

/** Récupère les custom claims du token (is_admin, discordRoles, etc.) */
export async function getUserClaims(forceRefresh = false): Promise<Record<string, any>> {
  const user = auth.currentUser;
  if (!user) return {};
  const tokenResult = await user.getIdTokenResult(forceRefresh);
  return tokenResult.claims;
}

/** Récupère l'annuaire complet des rôles et membres du serveur Discord ASTT via le Worker */
export async function fetchDiscordGuildDirectory(): Promise<{
  roles: GuildRole[];
  members: GuildMember[];
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Connexion requise pour charger les membres Discord.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(`${WORKER_URL}/api/discord/guild-directory`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Impossible de charger l'annuaire Discord (${response.status})${errText ? `: ${errText}` : ''}`
    );
  }

  const data = (await response.json()) as {
    roles?: GuildRole[];
    members?: GuildMember[];
  };

  return {
    roles: Array.isArray(data.roles) ? data.roles : [],
    members: Array.isArray(data.members) ? data.members : [],
  };
}
