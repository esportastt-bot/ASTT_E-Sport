export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
}

export interface DiscordMember {
  user: DiscordUser;
  roles: string[];
  nick: string | null;
}

export interface DiscordGuildRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface DiscordGuildMemberRaw {
  user?: DiscordUser;
  nick: string | null;
  roles: string[];
}

export class DiscordExchangeError extends Error {
  public readonly status: number;

  constructor(status: number, details: string) {
    super(`Discord token exchange failed (${status}): ${details}`);
    this.name = 'DiscordExchangeError';
    this.status = status;
  }
}

const DISCORD_HEADERS = {
  'User-Agent': 'DiscordBot (https://esportastt-bot.github.io/ASTT_E-Sport, 1.0)',
};

/** Échange le code OAuth2 contre un access token Discord */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      ...DISCORD_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
    throw new DiscordExchangeError(response.status, err);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/** Récupère l'utilisateur Discord depuis son access token */
export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      ...DISCORD_HEADERS,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch Discord user (${response.status}): ${err}`);
  }
  return response.json() as Promise<DiscordUser>;
}

/** Récupère les informations du membre sur le serveur Discord (rôles, surnom) */
export async function getGuildMember(
  accessToken: string,
  guildId: string
): Promise<DiscordMember | null> {
  if (!guildId) return null;

  const response = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: {
      ...DISCORD_HEADERS,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404 || response.status === 403) return null; // Pas membre du serveur
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch guild member (${response.status}): ${err}`);
  }
  return response.json() as Promise<DiscordMember>;
}

/** Récupère tous les rôles du serveur Discord via le Bot Token */
export async function getGuildRoles(
  botToken: string,
  guildId: string
): Promise<DiscordGuildRole[]> {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: {
      ...DISCORD_HEADERS,
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to fetch guild roles (${response.status}): ${err}`);
  }

  return response.json() as Promise<DiscordGuildRole[]>;
}

/** Récupère tous les membres du serveur Discord via le Bot Token (avec pagination) */
export async function getAllGuildMembers(
  botToken: string,
  guildId: string
): Promise<DiscordGuildMemberRaw[]> {
  const all: DiscordGuildMemberRaw[] = [];
  let after = '0';

  for (let page = 0; page < 10; page++) {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
      {
        headers: {
          ...DISCORD_HEADERS,
          Authorization: `Bot ${botToken}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to fetch guild members (${response.status}): ${err}`);
    }

    const batch = (await response.json()) as DiscordGuildMemberRaw[];
    all.push(...batch);

    if (batch.length < 1000) break;
    const lastId = batch[batch.length - 1]?.user?.id;
    if (!lastId || lastId === after) break;
    after = lastId;
  }

  return all;
}

/** Génère l'URL d'avatar Discord (BigInt safe pour snowflakes 64 bits) */
export function getAvatarUrl(user: DiscordUser): string {
  if (!user.avatar) {
    try {
      const idx = Number((BigInt(user.id) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128`;
}
