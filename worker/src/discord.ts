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

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
}

export interface DiscordDmPayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

export type DirectMessageResult =
  | { ok: true }
  | { ok: false; code?: number; reason: string };

const dmChannelCache = new Map<string, string>();

async function discordBotFetchWithRetry(
  url: string,
  botToken: string,
  init: RequestInit
): Promise<Response> {
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: {
        ...DISCORD_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
        ...(init.headers || {}),
      },
    });

  let res = await doFetch();
  if (res.status === 429) {
    let waitMs = 1500;
    try {
      const body = (await res.json()) as { retry_after?: number };
      if (typeof body.retry_after === 'number' && Number.isFinite(body.retry_after)) {
        waitMs = Math.min(4000, Math.max(250, Math.ceil(body.retry_after * 1000) + 100));
      }
    } catch {
      // default waitMs
    }
    await new Promise(resolve => setTimeout(resolve, waitMs));
    res = await doFetch();
  }
  return res;
}

async function parseDiscordError(res: Response): Promise<{ code?: number; message?: string }> {
  try {
    const data = (await res.json()) as { code?: number; message?: string };
    return data;
  } catch {
    return {};
  }
}

/** Envoie un message privé Discord à un utilisateur via le Bot Token (avec cache de salon DM) */
export async function sendDirectMessage(
  botToken: string,
  discordId: string,
  payload: DiscordDmPayload
): Promise<DirectMessageResult> {
  try {
    let channelId = dmChannelCache.get(discordId);

    const openDmChannel = async (): Promise<string | DirectMessageResult> => {
      const chRes = await discordBotFetchWithRetry(
        'https://discord.com/api/v10/users/@me/channels',
        botToken,
        {
          method: 'POST',
          body: JSON.stringify({ recipient_id: discordId }),
        }
      );

      if (!chRes.ok) {
        const err = await parseDiscordError(chRes);
        if (chRes.status === 403 || err.code === 50007) {
          return {
            ok: false,
            code: err.code || 50007,
            reason: 'MP Discord désactivés par ce membre',
          };
        }
        return {
          ok: false,
          code: err.code,
          reason: `Impossible d'ouvrir le MP (HTTP ${chRes.status})`,
        };
      }

      const chData = (await chRes.json()) as { id?: string };
      if (!chData.id) {
        return { ok: false, reason: 'Canal DM Discord introuvable' };
      }
      dmChannelCache.set(discordId, chData.id);
      return chData.id;
    };

    const usedCache = Boolean(channelId);
    if (!channelId) {
      const opened = await openDmChannel();
      if (typeof opened !== 'string') return opened;
      channelId = opened;
    }

    let msgRes = await discordBotFetchWithRetry(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      botToken,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    // Si le canal en cache est obsolète, on le rouvre une fois
    if (!msgRes.ok && usedCache && (msgRes.status === 404 || msgRes.status === 403)) {
      dmChannelCache.delete(discordId);
      const errFirst = await parseDiscordError(msgRes);
      if (errFirst.code === 50007) {
        return {
          ok: false,
          code: 50007,
          reason: 'MP Discord désactivés par ce membre',
        };
      }
      const reopened = await openDmChannel();
      if (typeof reopened !== 'string') return reopened;
      channelId = reopened;
      msgRes = await discordBotFetchWithRetry(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        botToken,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
    }

    if (!msgRes.ok) {
      const err = await parseDiscordError(msgRes);
      if (msgRes.status === 403 || err.code === 50007) {
        return {
          ok: false,
          code: err.code || 50007,
          reason: 'MP Discord désactivés par ce membre',
        };
      }
      return {
        ok: false,
        code: err.code,
        reason: `Erreur Discord (HTTP ${msgRes.status})`,
      };
    }

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      reason: String(err?.message || 'Erreur réseau Discord'),
    };
  }
}
