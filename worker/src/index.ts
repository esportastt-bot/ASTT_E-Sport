import {
  exchangeCode,
  getDiscordUser,
  getGuildMember,
  getGuildRoles,
  getAllGuildMembers,
  getAvatarUrl,
  sendDirectMessage,
  createForumThread,
  addMessageReaction,
  sendChannelMessage,
  DiscordExchangeError,
  type DiscordEmbed,
  type DiscordEmbedField,
} from './discord';
import {
  createFirebaseCustomToken,
  verifyFirebaseIdToken,
  fetchFirestorePollBundle,
  type FirestoreResponseDoc,
  type FirestoreSlotDoc,
  type ServiceAccount,
} from './firebase';

export interface Env {
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  FIREBASE_PROJECT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_OWNER_ID?: string;
  DISCORD_ADMIN_ROLE_IDS?: string;
  DISCORD_CAPTAIN_ROLE_IDS?: string;
  DISCORD_FORUM_CHANNEL_ID?: string;
  DISCORD_GENERAL_CHANNEL_ID?: string;
  FRONTEND_URL: string;
}

const FALLBACK_GUILD_ROLE_NAMES: Record<string, string> = {
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

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  let defaultOrigin = '*';
  try {
    defaultOrigin = new URL(env.FRONTEND_URL).origin;
  } catch {
    defaultOrigin = '*';
  }

  const reqOrigin = request.headers.get('Origin') || '';
  let allowedOrigin = defaultOrigin;

  if (reqOrigin) {
    try {
      const parsed = new URL(reqOrigin);
      const isLocal =
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      if (reqOrigin === defaultOrigin || isLocal) {
        allowedOrigin = reqOrigin;
      }
    } catch {
      // keep defaultOrigin
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const MAX_DM_BATCH = 15;

const TRAINING_TYPE_LABELS: Record<string, string> = {
  MIX: 'MIX',
  SCRIM: 'SCRIM',
  ASTT: 'ASTT',
  ENTRAINEMENT: 'Entraînement',
};

function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
}

async function authenticateCaller(
  request: Request,
  env: Env
): Promise<{ uid: string; isAdmin: boolean; displayName: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error('MISSING_TOKEN');
  }
  const verified = await verifyFirebaseIdToken(match[1], env.FIREBASE_PROJECT_ID);
  const claims = verified.claims || {};
  const isAdmin = Boolean(
    claims.is_admin === true ||
      claims.is_captain === true ||
      claims.role === 'ADMIN' ||
      (env.DISCORD_OWNER_ID && verified.uid === env.DISCORD_OWNER_ID)
  );
  return {
    uid: verified.uid,
    isAdmin,
    displayName: String(claims.display_name || ''),
  };
}

function formatFrDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatShortFrDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

function formatFrDateTime(iso: string): string {
  if (!iso) return 'Non précisée';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1))}…`;
}

function splitLinesIntoFields(
  baseTitle: string,
  lines: string[],
  maxLen = 960
): DiscordEmbedField[] {
  if (lines.length === 0) return [];
  const fields: DiscordEmbedField[] = [];
  let current = '';
  let chunkIndex = 0;

  for (const line of lines) {
    const safeLine = line.length > maxLen ? truncate(line, maxLen) : line;
    const candidate = current ? `${current}\n${safeLine}` : safeLine;
    if (candidate.length > maxLen) {
      if (current) {
        fields.push({
          name: chunkIndex === 0 ? baseTitle : `${baseTitle} (suite ${chunkIndex + 1})`,
          value: current,
        });
        chunkIndex++;
      }
      current = safeLine;
    } else {
      current = candidate;
    }
  }

  if (current) {
    fields.push({
      name: chunkIndex === 0 ? baseTitle : `${baseTitle} (suite ${chunkIndex + 1})`,
      value: current,
    });
  }
  return fields;
}

function selectRecipientChunk(authorizedIds: string[], rawSubset: unknown): string[] {
  const authorizedSet = new Set(authorizedIds);
  let targetList = authorizedIds;
  if (Array.isArray(rawSubset)) {
    targetList = Array.from(
      new Set(rawSubset.map(String).filter(uid => authorizedSet.has(uid)))
    );
  }
  return targetList.slice(0, MAX_DM_BATCH);
}

async function resolveMemberNamesMap(
  botToken: string,
  guildId: string | undefined,
  responses: FirestoreResponseDoc[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const r of responses) {
    if (r.displayName) names.set(r.userId, r.displayName);
  }
  if (guildId) {
    try {
      const members = await getAllGuildMembers(botToken, guildId);
      for (const m of members) {
        if (m.user?.id) {
          names.set(m.user.id, m.nick || m.user.global_name || m.user.username);
        }
      }
    } catch (err) {
      console.warn('[Worker Member Names Fallback]', err);
    }
  }
  return names;
}

function buildPollUrl(frontendUrl: string, pollId: string): string {
  const base = frontendUrl.replace(/\/+$/, '');
  return `${base}/?poll=${encodeURIComponent(pollId)}`;
}

function sortSlotsChronological(slots: FirestoreSlotDoc[]): FirestoreSlotDoc[] {
  return [...slots].sort(
    (a, b) => a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime)
  );
}

function getAdminRoleIds(env: Env): string[] {
  const raw = env.DISCORD_ADMIN_ROLE_IDS || env.DISCORD_CAPTAIN_ROLE_IDS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Décode un state base64url (ou base64 classique) et valide que l'URL cible est autorisée */
function decodeTargetUrl(state: string | null, fallbackUrl: string): URL {
  const safeFallback = new URL(fallbackUrl);
  safeFallback.searchParams.delete('fb_token');
  safeFallback.searchParams.delete('error');

  if (!state) return safeFallback;

  try {
    const normalized = state.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);

    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    let decoded = new TextDecoder().decode(bytes);
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
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    let targetUrl = new URL(env.FRONTEND_URL);

    try {
      // ── Santé du Worker ──────────────────────────────────────────────────
      if (url.pathname === '/health') {
        return jsonResponse(
          {
            status: 'ok',
            project: env.FIREBASE_PROJECT_ID,
            discordConfigured: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
            firebaseConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON),
            botDirectoryConfigured: Boolean(env.DISCORD_BOT_TOKEN),
            discordDmConfigured: Boolean(
              env.DISCORD_BOT_TOKEN && env.FIREBASE_SERVICE_ACCOUNT_JSON
            ),
            matchmakingConfigured: Boolean(
              env.DISCORD_BOT_TOKEN && env.DISCORD_FORUM_CHANNEL_ID
            ),
          },
          200,
          corsHeaders
        );
      }

      // ── Création d'un post Matchmaking dans le forum Discord ─────────────
      if (url.pathname === '/api/discord/matchmaking/create' && request.method === 'POST') {
        let caller: { uid: string; isAdmin: boolean; displayName: string };
        try {
          caller = await authenticateCaller(request, env);
        } catch (authErr) {
          console.warn('[Matchmaking Auth Error]', authErr);
          return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
        }

        if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_FORUM_CHANNEL_ID) {
          return jsonResponse({ error: 'matchmaking_unavailable' }, 503, corsHeaders);
        }

        let body: {
          equipe?: string;
          level?: string;
          arena?: string;
          date?: string;
          times?: string[];
          announceGeneral?: boolean;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
        }

        const equipe = String(body.equipe || '').trim().slice(0, 30) || 'ASTT';
        const rawLevel = String(body.level || '').trim();
        const LEVEL_EMOJIS: Record<string, string> = {
          'Débutant': '🟢',
          'Intermédiaire': '🟡',
          'Confirmé': '🔴',
        };
        const level = rawLevel in LEVEL_EMOJIS ? rawLevel : 'Débutant';
        const emoji = LEVEL_EMOJIS[level] || '❓';

        const arena = String(body.arena || '').trim().slice(0, 30);
        if (!arena) {
          return jsonResponse({ error: 'missing_arena', message: 'Veuillez préciser une arène.' }, 400, corsHeaders);
        }

        const dateIso = String(body.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
          return jsonResponse({ error: 'invalid_date', message: 'Date invalide.' }, 400, corsHeaders);
        }
        const dateFr = formatFrDate(dateIso);

        const rawTimes = Array.isArray(body.times) ? body.times : [];
        const times = rawTimes
          .map(t => String(t || '').trim())
          .filter(t => /^\d{2}:\d{2}$/.test(t))
          .slice(0, 2);
        if (times.length === 0) {
          return jsonResponse(
            { error: 'invalid_times', message: 'Indiquez au moins un créneau horaire (HH:MM).' },
            400,
            corsHeaders
          );
        }

        // Vérifier que la date n'est pas antérieure à aujourd'hui (heure de Paris)
        const todayParis = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        if (dateIso < todayParis) {
          return jsonResponse(
            { error: 'date_in_past', message: 'La date sélectionnée est dans le passé.' },
            400,
            corsHeaders
          );
        }

        const timesDisplay = times.join(' ou ');
        const threadTitle = `» ${equipe} - ${arena} - ${dateFr} à ${timesDisplay}`;
        const evaUrl = `https://app.eva.gg/fr-FR/booking?locationId=36&gameId=1&currentDate=${dateIso}`;

        let msg = `# 🎮 Session de Jeu — ${level} ${emoji}\n\n`;
        msg += `## 📋 Informations\n`;
        msg += `**Équipe** : ${equipe} | **Niveau** : ${level} ${emoji}\n`;
        msg += `**Arène** : ${arena} | **Date** : ${dateFr}\n`;
        msg += `**Organisateur** : <@${caller.uid}>\n\n`;
        if (times.length === 1) {
          msg += `**Heure** : ${times[0]}\n`;
        } else {
          msg +=
            `**Créneaux** :\n` +
            times.map((t, i) => `• Créneau ${i + 1} : ${t}`).join('\n') +
            `\n`;
        }
        msg +=
          `\n## 🔗 Réservation EVA\n` +
          `[➤ Vérifiez et réservez sur EVA.gg](${evaUrl})\n` +
          `*Pensez à réserver rapidement !*\n\n` +
          `## 💬 Comment participer ?\n` +
          `• ✅ **Je participe** — Confirmer\n` +
          `• ❌ **Je ne peux pas** — Signaler votre absence\n` +
          `• ❓ **Peut-être** — Vous hésitez\n\n` +
          `**Bonne session ! 🎯**`;

        const { threadId, messageId } = await createForumThread(
          env.DISCORD_BOT_TOKEN,
          env.DISCORD_FORUM_CHANNEL_ID,
          threadTitle,
          msg,
          4320
        );

        await addMessageReaction(env.DISCORD_BOT_TOKEN, threadId, messageId, '✅');

        const threadUrl = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${threadId}`;
        let announcedGeneral = false;
        let announceError: string | null = null;

        if (body.announceGeneral && env.DISCORD_GENERAL_CHANNEL_ID) {
          try {
            const generalText =
              `@everyone\n\n🎮 **Nouvelle session de jeu !**\n\n` +
              `**Équipe** : ${equipe} | **Niveau** : ${level} ${emoji}\n` +
              `**Arène** : ${arena} | **Date** : ${dateFr} à ${timesDisplay}\n` +
              `**Organisateur** : <@${caller.uid}>\n\n` +
              `[➤ Rejoindre la session](${threadUrl})`;
            await sendChannelMessage(
              env.DISCORD_BOT_TOKEN,
              env.DISCORD_GENERAL_CHANNEL_ID,
              generalText
            );
            announcedGeneral = true;
          } catch (gErr: any) {
            console.warn('[Matchmaking General Announce Error]', gErr);
            announceError = String(gErr?.message || 'Annonce générale impossible');
          }
        }

        return jsonResponse(
          {
            ok: true,
            threadId,
            threadUrl,
            title: threadTitle,
            announcedGeneral,
            ...(announceError ? { announceError } : {}),
          },
          200,
          corsHeaders
        );
      }

      // ── Notifications MP Discord (création, planning décidé, relances) ───
      if (url.pathname.startsWith('/api/discord/notify/') && request.method === 'POST') {
        let caller: { uid: string; isAdmin: boolean; displayName: string };
        try {
          caller = await authenticateCaller(request, env);
        } catch (authErr) {
          console.warn('[Notify Auth Error]', authErr);
          return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
        }

        if (!env.DISCORD_BOT_TOKEN || !env.FIREBASE_SERVICE_ACCOUNT_JSON) {
          return jsonResponse({ error: 'discord_dm_unavailable' }, 503, corsHeaders);
        }

        let body: { pollId?: string; recipientSubset?: string[] } = {};
        try {
          body = (await request.json()) as { pollId?: string; recipientSubset?: string[] };
        } catch {
          return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
        }

        const pollId = String(body.pollId || '').trim();
        if (!pollId) {
          return jsonResponse({ error: 'missing_poll_id' }, 400, corsHeaders);
        }

        const serviceAccount: ServiceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        let bundle;
        try {
          bundle = await fetchFirestorePollBundle(serviceAccount, env.FIREBASE_PROJECT_ID, pollId);
        } catch (fsErr: any) {
          const msg = String(fsErr?.message || fsErr);
          if (msg.startsWith('POLL_NOT_FOUND:')) {
            return jsonResponse({ error: 'poll_not_found' }, 404, corsHeaders);
          }
          throw fsErr;
        }

        if (!caller.isAdmin && bundle.poll.createdBy !== caller.uid) {
          return jsonResponse({ error: 'forbidden' }, 403, corsHeaders);
        }

        const pollUrl = buildPollUrl(env.FRONTEND_URL, pollId);
        const sortedSlots = sortSlotsChronological(bundle.slots);
        const namesMap = await resolveMemberNamesMap(
          env.DISCORD_BOT_TOKEN,
          env.DISCORD_GUILD_ID,
          bundle.responses
        );
        const getName = (uid: string) => namesMap.get(uid) || `Membre (${uid.slice(-4)})`;

        // 1. MP automatique à la création du sondage
        if (url.pathname === '/api/discord/notify/poll-created') {
          const authorizedIds = Array.from(
            new Set(bundle.poll.targetUserIds.filter(Boolean))
          );
          const batchIds = selectRecipientChunk(authorizedIds, body.recipientSubset);

          const activeSlots = sortedSlots.filter(s => !s.cancelled);
          const distinctTypes = Array.from(
            new Set(
              activeSlots.map(s => TRAINING_TYPE_LABELS[s.trainingType] || s.trainingType)
            )
          );
          const periodValue =
            bundle.poll.startDate && bundle.poll.endDate
              ? `Du ${formatFrDate(bundle.poll.startDate)} au ${formatFrDate(bundle.poll.endDate)}`
              : `${activeSlots.length} créneau(x)`;

          const embed: DiscordEmbed = {
            title: truncate(`📊 Nouveau sondage : ${bundle.poll.title}`, 250),
            url: pollUrl,
            color: 0x6366f1,
            description: `**${bundle.poll.createdByName || caller.displayName || 'Un organisateur'}** t'invite à indiquer tes disponibilités.`,
            fields: [
              { name: '📅 Période', value: periodValue, inline: true },
              {
                name: '⏰ Clôture des votes',
                value: formatFrDateTime(bundle.poll.deadline),
                inline: true,
              },
              {
                name: '🎮 Créneaux proposés',
                value:
                  activeSlots.length > 0
                    ? `${activeSlots.length} créneau(x)${distinctTypes.length > 0 ? ` (${distinctTypes.join(', ')})` : ''}`
                    : 'Voir sur le sondage',
                inline: false,
              },
            ],
            footer: {
              text: 'ASTT Planning • Ouvre le lien ci-dessus pour répondre',
            },
          };

          const content = truncate(
            `📊 **${bundle.poll.title}**\n👉 **Répondre au sondage :** ${pollUrl}`,
            1900
          );

          let sentCount = 0;
          const failed: Array<{ discordId: string; displayName: string; reason: string }> = [];

          for (const uid of batchIds) {
            const res = await sendDirectMessage(env.DISCORD_BOT_TOKEN, uid, {
              content,
              embeds: [embed],
            });
            if (res.ok) {
              sentCount++;
            } else {
              failed.push({ discordId: uid, displayName: getName(uid), reason: res.reason });
            }
          }

          return jsonResponse(
            {
              ok: true,
              totalAuthorized: authorizedIds.length,
              processedCount: batchIds.length,
              sentCount,
              failedCount: failed.length,
              failed,
            },
            200,
            corsHeaders
          );
        }

        // 2. MP du planning décidé (UNIQUEMENT Présent ou Indéterminé sur au moins 1 créneau)
        if (url.pathname === '/api/discord/notify/planning') {
          const authorizedIds = Array.from(
            new Set(
              bundle.responses
                .filter(r =>
                  Object.values(r.slotResponses).some(
                    st => st === 'DISPONIBLE' || st === 'INCERTAIN'
                  )
                )
                .map(r => r.userId)
            )
          );
          const batchIds = selectRecipientChunk(authorizedIds, body.recipientSubset);

          const activeSlots = sortedSlots.filter(s => !s.cancelled);
          const cancelledSlots = sortedSlots.filter(s => s.cancelled);
          const selectedSlots = activeSlots.filter(s => s.selectedIds.length > 0);
          const displaySlots = selectedSlots.length > 0 ? selectedSlots : activeSlots;

          const globalLines: string[] = [];
          for (const s of displaySlots) {
            const typeLabel = TRAINING_TYPE_LABELS[s.trainingType] || s.trainingType;
            const header = `• **[${typeLabel}] ${s.dayName} ${formatShortFrDate(s.dateStr)} (${s.startTime}–${s.endTime})**`;
            if (s.selectedIds.length > 0) {
              const teamA = s.selectedIds.filter(id => s.teamAssignments[id] === 'A');
              const teamB = s.selectedIds.filter(id => s.teamAssignments[id] === 'B');
              const unassigned = s.selectedIds.filter(id => !s.teamAssignments[id]);
              const detailParts: string[] = [];
              if (teamA.length > 0 || teamB.length > 0) {
                if (teamA.length > 0) detailParts.push(`🟦 Éq. A : ${teamA.map(getName).join(', ')}`);
                if (teamB.length > 0) detailParts.push(`🟥 Éq. B : ${teamB.map(getName).join(', ')}`);
                if (unassigned.length > 0) detailParts.push(`✅ Titulaires : ${unassigned.map(getName).join(', ')}`);
              } else {
                detailParts.push(`✅ Titulaires (${s.selectedIds.length}) : ${s.selectedIds.map(getName).join(', ')}`);
              }
              if (s.waitlistIds.length > 0) {
                detailParts.push(`⏳ Attente : ${s.waitlistIds.map(getName).join(', ')}`);
              }
              globalLines.push(`${header}\n  ${detailParts.join(' | ')}`);
            } else {
              globalLines.push(`${header}\n  Aucun titulaire sélectionné pour le moment`);
            }
          }

          const cancelledLines = cancelledSlots.map(
            s =>
              `• ~~${s.dayName} ${formatShortFrDate(s.dateStr)} (${s.startTime}–${s.endTime})~~${s.cancelReason ? ` — ${s.cancelReason}` : ' — Annulé'}`
          );

          const sharedFields: DiscordEmbedField[] = [
            ...splitLinesIntoFields('📋 Détail du planning', globalLines, 950),
            ...splitLinesIntoFields('🚫 Créneaux annulés', cancelledLines, 950),
          ];

          let sentCount = 0;
          const failed: Array<{ discordId: string; displayName: string; reason: string }> = [];

          for (const uid of batchIds) {
            const titulaireLines: string[] = [];
            const waitlistLines: string[] = [];

            for (const s of activeSlots) {
              const typeLabel = TRAINING_TYPE_LABELS[s.trainingType] || s.trainingType;
              const slotLabel = `[${typeLabel}] ${s.dayName} ${formatShortFrDate(s.dateStr)} (${s.startTime}–${s.endTime})`;
              if (s.selectedIds.includes(uid)) {
                const team = s.teamAssignments[uid];
                titulaireLines.push(
                  `✅ **Titulaire** — ${slotLabel}${team ? ` (**Équipe ${team}**)` : ''}`
                );
              } else if (s.waitlistIds.includes(uid)) {
                waitlistLines.push(`⏳ **Liste d'attente** — ${slotLabel}`);
              }
            }

            const personalLines = [...titulaireLines, ...waitlistLines];
            const personalSummary =
              personalLines.length > 0
                ? personalLines.join('\n')
                : "Tu n'es pas retenu(e) sur un créneau actif pour le moment (ou tes créneaux ont été annulés).";

            const color =
              titulaireLines.length > 0
                ? 0x10b981
                : waitlistLines.length > 0
                  ? 0xf59e0b
                  : 0x64748b;

            const embed: DiscordEmbed = {
              title: truncate(`📋 Décision planning : ${bundle.poll.title}`, 250),
              url: pollUrl,
              color,
              description: `Voici la répartition décidée par **${bundle.poll.createdByName || caller.displayName || "l'organisateur"}** suite à tes disponibilités.`,
              fields: [
                {
                  name: '📌 Ce qui est prévu pour toi',
                  value: truncate(personalSummary, 1000),
                },
                ...sharedFields.slice(0, 20),
              ],
              footer: {
                text: 'ASTT Planning • Consulte le sondage complet via le lien ci-dessus',
              },
            };

            const content = truncate(
              `📋 **Planning arrêté — ${bundle.poll.title}**\n🔗 Voir le détail sur l'app : ${pollUrl}`,
              1900
            );

            const res = await sendDirectMessage(env.DISCORD_BOT_TOKEN, uid, {
              content,
              embeds: [embed],
            });
            if (res.ok) {
              sentCount++;
            } else {
              failed.push({ discordId: uid, displayName: getName(uid), reason: res.reason });
            }
          }

          return jsonResponse(
            {
              ok: true,
              totalAuthorized: authorizedIds.length,
              processedCount: batchIds.length,
              sentCount,
              failedCount: failed.length,
              failed,
            },
            200,
            corsHeaders
          );
        }

        // 3. Relance des retardataires en MP Discord
        if (url.pathname === '/api/discord/notify/reminders') {
          const respondedSet = new Set(
            bundle.responses
              .filter(
                r => Object.keys(r.slotResponses).length > 0 || r.desiredGames !== null
              )
              .map(r => r.userId)
          );
          const authorizedIds = Array.from(
            new Set(bundle.poll.targetUserIds.filter(uid => uid && !respondedSet.has(uid)))
          );
          const batchIds = selectRecipientChunk(authorizedIds, body.recipientSubset);

          const embed: DiscordEmbed = {
            title: truncate(`⏰ Rappel : ${bundle.poll.title}`, 250),
            url: pollUrl,
            color: 0xf59e0b,
            description: `Merci d'indiquer tes disponibilités sur ce sondage avant la clôture !`,
            fields: [
              {
                name: '⏳ Clôture des votes',
                value: formatFrDateTime(bundle.poll.deadline),
                inline: true,
              },
            ],
            footer: {
              text: 'ASTT Planning • Clique sur le lien ci-dessus pour répondre',
            },
          };
          const content = truncate(
            `⏰ **Rappel disponibilités — ${bundle.poll.title}**\n👉 **Répondre ici :** ${pollUrl}`,
            1900
          );

          let sentCount = 0;
          const failed: Array<{ discordId: string; displayName: string; reason: string }> = [];

          for (const uid of batchIds) {
            const res = await sendDirectMessage(env.DISCORD_BOT_TOKEN, uid, {
              content,
              embeds: [embed],
            });
            if (res.ok) {
              sentCount++;
            } else {
              failed.push({ discordId: uid, displayName: getName(uid), reason: res.reason });
            }
          }

          return jsonResponse(
            {
              ok: true,
              totalAuthorized: authorizedIds.length,
              processedCount: batchIds.length,
              sentCount,
              failedCount: failed.length,
              failed,
            },
            200,
            corsHeaders
          );
        }

        return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
      }

      // ── Annuaire complet des rôles et membres du serveur Discord ASTT ────
      if (url.pathname === '/api/discord/guild-directory' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        try {
          await verifyFirebaseIdToken(match[1], env.FIREBASE_PROJECT_ID);
        } catch (authErr) {
          console.warn('[Directory Auth Error]', authErr);
          return new Response(JSON.stringify({ error: 'invalid_token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
          return new Response(JSON.stringify({ error: 'bot_directory_unavailable' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const [rawRoles, rawMembers] = await Promise.all([
          getGuildRoles(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID),
          getAllGuildMembers(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID),
        ]);

        const roles = rawRoles
          .filter(r => r.id !== env.DISCORD_GUILD_ID && !r.managed)
          .sort((a, b) => b.position - a.position)
          .map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            position: r.position,
          }));

        const roleMap: Record<string, string> = {};
        for (const r of roles) {
          roleMap[r.id] = r.name;
        }

        const adminRoleIds = getAdminRoleIds(env);

        const members = rawMembers
          .filter(m => m.user && !m.user.bot)
          .map(m => {
            const u = m.user!;
            const displayName = m.nick || u.global_name || u.username;
            const roleNames = m.roles.map(id => roleMap[id]).filter(Boolean);
            const isAdmin =
              (Boolean(env.DISCORD_OWNER_ID) && u.id === env.DISCORD_OWNER_ID) ||
              m.roles.some(id => adminRoleIds.includes(id));

            return {
              discordId: u.id,
              displayName,
              username: u.username,
              avatarUrl: getAvatarUrl(u),
              roleIds: m.roles,
              roleNames,
              isAdmin,
            };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

        return new Response(JSON.stringify({ roles, members }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=60',
          },
        });
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

        // 3. Récupération du profil membre du serveur Discord (obligatoire pour accéder)
        const member = env.DISCORD_GUILD_ID
          ? await getGuildMember(accessToken, env.DISCORD_GUILD_ID)
          : null;

        if (env.DISCORD_GUILD_ID && !member) {
          targetUrl.searchParams.set('error', 'not_in_guild');
          return Response.redirect(targetUrl.toString(), 302);
        }

        // Déterminer le nom d'affichage, l'avatar et les rôles réels Discord
        const displayName = member?.nick || discordUser.global_name || discordUser.username;
        const avatarUrl = getAvatarUrl(discordUser);
        const roles = member?.roles || [];

        let dynamicRoleMap: Record<string, string> = { ...FALLBACK_GUILD_ROLE_NAMES };
        if (env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID) {
          try {
            const guildRoles = await getGuildRoles(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
            dynamicRoleMap = {};
            for (const r of guildRoles) {
              if (r.id !== env.DISCORD_GUILD_ID && !r.managed) {
                dynamicRoleMap[r.id] = r.name;
              }
            }
          } catch (roleErr) {
            console.warn('[Worker Roles Fallback]', roleErr);
          }
        }

        const mappedRoles = roles.map(id => dynamicRoleMap[id]).filter(Boolean);
        const roleNames = mappedRoles.length > 0 ? mappedRoles : ['Membre'];

        // 4. Déterminer si Admin (Owner ou rôle Discord Admin uniquement)
        const adminRoleIds = getAdminRoleIds(env);
        const isAdmin =
          (Boolean(env.DISCORD_OWNER_ID) && discordUser.id === env.DISCORD_OWNER_ID) ||
          roles.some(r => adminRoleIds.includes(r)) ||
          roleNames.some(name => name.toLowerCase() === 'admin');

        // 5. Création du custom token Firebase
        let customToken: string;
        try {
          const serviceAccount: ServiceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
          customToken = await createFirebaseCustomToken(
            serviceAccount,
            discordUser.id,
            {
              is_admin: isAdmin,
              is_captain: isAdmin,
              role: isAdmin ? 'ADMIN' : 'MEMBER',
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
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'server_error', message: String(err?.message || err) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
