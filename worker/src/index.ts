import { exchangeCode, getDiscordUser, getGuildMember, getAvatarUrl } from './discord';
import { createFirebaseCustomToken, type ServiceAccount } from './firebase';

export interface Env {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID: string;
  DISCORD_GUILD_ID: string;
  FRONTEND_URL: string;
}

const CAPTAIN_KEYWORD_ROLES = ['capitaine', 'captain', 'admin', 'staff', 'coach'];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.FRONTEND_URL || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ── Santé du Worker ──────────────────────────────────────────────────
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({ status: 'ok', project: env.FIREBASE_PROJECT_ID }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ── Callback OAuth2 Discord ──────────────────────────────────────────
      if (url.pathname === '/auth/discord/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code) {
          return Response.redirect(`${env.FRONTEND_URL}?error=no_code`, 302);
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

        // Déterminer le nom d'affichage et l'avatar
        const displayName = member?.nick || discordUser.global_name || discordUser.username;
        const avatarUrl = getAvatarUrl(discordUser);
        const roles = member?.roles || [];

        // 4. Déterminer si capitaine
        const isCaptain =
          CAPTAIN_KEYWORD_ROLES.some(kw =>
            (member?.nick || discordUser.global_name || discordUser.username).toLowerCase().includes(kw)
          );

        // 5. Création du custom token Firebase
        const serviceAccount: ServiceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        const customToken = await createFirebaseCustomToken(
          serviceAccount,
          discordUser.id,
          {
            is_captain: isCaptain,
            display_name: displayName,
            avatar_url: avatarUrl,
            discord_roles: roles,
            discord_username: discordUser.username,
          }
        );

        // 6. Redirection vers le frontend
        const targetUrl = state ? decodeURIComponent(atob(state)) : env.FRONTEND_URL;
        const redirectUrl = new URL(targetUrl);
        redirectUrl.searchParams.set('fb_token', customToken);

        return Response.redirect(redirectUrl.toString(), 302);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err: any) {
      console.error('[Worker Error]', err);
      return Response.redirect(`${env.FRONTEND_URL}?error=server_error`, 302);
    }
  },

  // Cron trigger (exécuté toutes les 5 minutes)
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[Cron] Tâche de réconciliation planifiée');
  },
};
