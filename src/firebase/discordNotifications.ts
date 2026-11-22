import { auth } from './config';
import { WORKER_URL } from './auth';

export interface DiscordNotifyFailure {
  discordId: string;
  displayName: string;
  reason: string;
}

export interface DiscordNotifyResult {
  totalAuthorized: number;
  sentCount: number;
  failedCount: number;
  failed: DiscordNotifyFailure[];
}

interface WorkerNotifyResponse {
  ok: boolean;
  totalAuthorized: number;
  processedCount: number;
  sentCount: number;
  failedCount: number;
  failed: DiscordNotifyFailure[];
  error?: string;
}

const CHUNK_SIZE = 15;

async function postNotifyChunk(
  endpoint: string,
  idToken: string,
  pollId: string,
  recipientSubset?: string[]
): Promise<WorkerNotifyResponse> {
  const response = await fetch(`${WORKER_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(
      recipientSubset ? { pollId, recipientSubset } : { pollId }
    ),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<WorkerNotifyResponse>;
  if (!response.ok) {
    throw new Error(
      data?.error
        ? `Erreur notifications Discord (${response.status}: ${data.error})`
        : `Erreur notifications Discord (${response.status})`
    );
  }

  return {
    ok: Boolean(data.ok),
    totalAuthorized: Number(data.totalAuthorized) || 0,
    processedCount: Number(data.processedCount) || 0,
    sentCount: Number(data.sentCount) || 0,
    failedCount: Number(data.failedCount) || 0,
    failed: Array.isArray(data.failed) ? data.failed : [],
  };
}

async function callNotifyEndpoint(
  endpoint: string,
  pollId: string,
  expectedRecipientIds?: string[],
  forceSubset = false
): Promise<DiscordNotifyResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Connexion requise pour envoyer des MP Discord.');
  }

  const idToken = await currentUser.getIdToken();
  const uniqueIds = expectedRecipientIds
    ? Array.from(new Set(expectedRecipientIds.filter(Boolean)))
    : undefined;

  if (forceSubset && (!uniqueIds || uniqueIds.length === 0)) {
    return { totalAuthorized: 0, sentCount: 0, failedCount: 0, failed: [] };
  }

  if (!uniqueIds || (!forceSubset && uniqueIds.length <= CHUNK_SIZE)) {
    const res = await postNotifyChunk(endpoint, idToken, pollId);
    return {
      totalAuthorized: res.totalAuthorized,
      sentCount: res.sentCount,
      failedCount: res.failedCount,
      failed: res.failed,
    };
  }

  let totalAuthorized = 0;
  let sentCount = 0;
  let failedCount = 0;
  const failed: DiscordNotifyFailure[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const res = await postNotifyChunk(endpoint, idToken, pollId, chunk);
    totalAuthorized = forceSubset
      ? uniqueIds.length
      : Math.max(totalAuthorized, res.totalAuthorized);
    sentCount += res.sentCount;
    failedCount += res.failedCount;
    failed.push(...res.failed);
  }

  return {
    totalAuthorized,
    sentCount,
    failedCount,
    failed,
  };
}

/** Envoie un MP Discord avec le lien direct du sondage à chaque membre concerné lors de la création */
export async function notifyPollCreatedByDiscord(
  pollId: string,
  targetUserIds: string[]
): Promise<DiscordNotifyResult> {
  return callNotifyEndpoint('/api/discord/notify/poll-created', pollId, targetUserIds);
}

/** Envoie un MP Discord avec le lien direct du sondage uniquement aux nouveaux membres ajoutés */
export async function notifyNewPollMembersByDiscord(
  pollId: string,
  addedUserIds: string[]
): Promise<DiscordNotifyResult> {
  return callNotifyEndpoint('/api/discord/notify/poll-created', pollId, addedUserIds, true);
}

/** Envoie en MP Discord le planning décidé uniquement aux membres ayant répondu Présent ou Indéterminé */
export async function notifyPlanningDecisionByDiscord(
  pollId: string,
  recipientIds: string[]
): Promise<DiscordNotifyResult> {
  return callNotifyEndpoint('/api/discord/notify/planning', pollId, recipientIds);
}

/** Envoie en MP Discord une relance aux membres ciblés qui n'ont pas encore répondu */
export async function notifyPollRemindersByDiscord(
  pollId: string,
  missingResponderIds: string[]
): Promise<DiscordNotifyResult> {
  return callNotifyEndpoint('/api/discord/notify/reminders', pollId, missingResponderIds);
}
