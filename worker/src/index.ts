import { exchangeCode, getDiscordUser, getGuildMember, getAvatarUrl, DiscordExchangeError } from './discord';
import { createFirebaseCustomToken, type ServiceAccount } from './firebase';

export interface Env {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_OWNER_ID?: string;
  DISCORD_CAPTAIN_ROLE_IDS?: string;
  FRONTEND_URL: string;
}

const CAPTAIN_KEYWORD_ROLES = ['capitaine', 'captain', 'admin', 'staff', 'coach'];

const GUILD_ROLE_NAMES: Record<string, string> = {
  '1313253443770650696': 'Admin',
  '1402755374519423086': 'Membre',
  '1402755537862660106': 'Débutant',
  '1402755736068558980': 'Intermédiaire',
  '1402755810580500610': 'Pro',
  '1405630417377431622': 'Inter-entreprise',
  '1405921530906546247': 'Gamer ++',
  '1408922104585392298': 'Ayant droit',
  '1408922727611371560': 'Exterieur',
  '1481389828879683584': '>>KSG',
};

/** Décode un state base64url (ou base64 classique) et valide que l'URL cible est autorisée */
function decodeTargetUrl(state: string | null, fallbackUrl: string): URL {
  const safeFallback = new URL(fallbackUrl);
  safeFallback.searchParams.delete('fb_token');
  safeFallback.searchParams.delete('error');

  if (!state) return safeFallback;

  try {
    // Support base64url et base64 standard (+ possible espace si non encodé URL)
    const normalized = state.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    let decoded = new TextDecoder().decode(bytes);
    // Rétrocompatibilité avec d'anciens states encodés via encodeURIComponent
    if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
      decoded = decodeURIComponent(decoded);
    }

    const parsed = new URL(decoded);
    const isAllowedProd =
      parsed.origin === safeFallback.origin && parsed.pathname.startsWith('/ASTT_E-Sport');
    const isAllowedLocal =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

    if (!isAllowedProd && !isAllowedLocal) {
      return safeFallback;
    }

    parsed.searchParams.delete('fb_token');
    parsed.searchParams.delete('error');
    return parsed;
  } catch {
    return safeFallback;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const allowedOrigin = (() => {
      try {
        return new URL(env.FRONTEND_URL).origin;
      } catch {
        return '*';
      }
    })();

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    let targetUrl = new URL(env.FRONTEND_URL);

    try {
      // ── Santé du Worker ──────────────────────────────────────────────────
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            project: env.FIREBASE_PROJECT_ID,
            discordConfigured: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
            firebaseConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── Callback OAuth2 Discord ──────────────────────────────────────────
      if (url.pathname === '/auth/discord/callback') {
        const state = url.searchParams.get('state');
        targetUrl = decodeTargetUrl(state, env.FRONTEND_URL);

        const oauthError = url.searchParams.get('error');
        if (oauthError) {
          targetUrl.searchParams.set('error', 'discord_denied');
          return Response.redirect(targetUrl.toString(), 302);
        }

        const code = url.searchParams.get('code');
        if (!code) {
          targetUrl.searchParams.set('error', 'no_code');
          return Response.redirect(targetUrl.toString(), 302);
        }

        if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
          console.error('[Worker Config Error] Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET');
          targetUrl.searchParams.set('error', 'worker_misconfigured');
          return Response.redirect(targetUrl.toString(), 302);
        }

        const redirectUri = `${url.origin}/auth/discord/callback`;

        // 1. Échange du code contre le token Discord
        const accessToken = await exchangeCode(
          code,
          env.DISCORD_CLIENT_ID,
          env.DISCORD_CLIENT_SECRET,
          redirectUri
        );

        // 2. Récupération des informations utilisateur Discord
        const discordUser = await getDiscordUser(accessToken);

        // 3. Récupération du profil membre du serveur Discord
        const member = env.DISCORD_GUILD_ID
          ? await getGuildMember(accessToken, env.DISCORD_GUILD_ID)
          : null;

        if (env.DISCORD_GUILD_ID && !member) {
          targetUrl.searchParams.set('error', 'not_in_guild');
          return Response.redirect(targetUrl.toString(), 302);
        }

        // Déterminer le nom d'affichage, l'avatar et les rôles
        const displayName = member?.nick || discordUser.global_name || discordUser.username;
        const avatarUrl = getAvatarUrl(discordUser);
        const roles = member?.roles || [];

        const mappedRoles = roles.map(id => GUILD_ROLE_NAMES[id]).filter(Boolean);
        const roleNames = mappedRoles.length > 0 ? mappedRoles : ['Membre'];

        // 4. Déterminer si capitaine (Owner ou rôle Discord Admin/Capitaine, fallback mot-clé)
        const captainRoleIds = (env.DISCORD_CAPTAIN_ROLE_IDS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

        const isCaptain =
          (Boolean(env.DISCORD_OWNER_ID) && discordUser.id === env.DISCORD_OWNER_ID) ||
          roles.some(r => captainRoleIds.includes(r)) ||
          roleNames.some(name => CAPTAIN_KEYWORD_ROLES.some(kw => name.toLowerCase().includes(kw))) ||
          CAPTAIN_KEYWORD_ROLES.some(kw =>
            (member?.nick || discordUser.global_name || discordUser.username).toLowerCase().includes(kw)
          );

        // 5. Création du custom token Firebase
        let customToken: string;
        try {
          const serviceAccount: ServiceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
          customToken = await createFirebaseCustomToken(
            serviceAccount,
            discordUser.id,
            {
              is_captain: isCaptain,
              role: isCaptain ? 'CAPTAIN' : 'MEMBER',
              display_name: displayName,
              avatar_url: avatarUrl,
              discord_roles: roleNames.slice(0, 12),
              discord_username: discordUser.username,
            }
          );
        } catch (tokenErr) {
          console.error('[Firebase Token Error]', tokenErr);
          targetUrl.searchParams.set('error', 'firebase_token_failed');
          return Response.redirect(targetUrl.toString(), 302);
        }

        // 6. Redirection vers le frontend
        targetUrl.searchParams.set('fb_token', customToken);
        return Response.redirect(targetUrl.toString(), 302);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err: any) {
      console.error('[Worker Error]', err);
      const errCode = err instanceof DiscordExchangeError ? 'discord_exchange_failed' : 'server_error';
      targetUrl.searchParams.set('error', errCode);
      return Response.redirect(targetUrl.toString(), 302);
    }
  },

  // Cron trigger (exécuté toutes les 5 minutes)
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[Cron] Tâche de réconciliation planifiée');
  },
};
