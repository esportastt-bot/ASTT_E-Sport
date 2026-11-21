export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordMember {
  user: DiscordUser;
  roles: string[];
  nick: string | null;
}

/** Échange le code OAuth2 contre un access token Discord */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Discord token exchange failed: ${err}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/** Récupère l'utilisateur Discord depuis son access token */
export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error('Failed to fetch Discord user');
  return response.json() as Promise<DiscordUser>;
}

/** Récupère les informations du membre sur le serveur Discord (rôles, surnom) */
export async function getGuildMember(
  accessToken: string,
  guildId: string
): Promise<DiscordMember | null> {
  if (!guildId) return null;

  const response = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404 || response.status === 403) return null; // Pas membre du serveur
  if (!response.ok) throw new Error('Failed to fetch guild member');
  return response.json() as Promise<DiscordMember>;
}

/** Génère l'URL d'avatar Discord */
export function getAvatarUrl(user: DiscordUser): string {
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id, 10) % 5}.png`;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`;
}
