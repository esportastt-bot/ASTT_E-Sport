import { auth } from './config';
import { WORKER_URL } from './auth';

export type MatchmakingLevel = 'Débutant' | 'Intermédiaire' | 'Confirmé';

export interface CreateMatchmakingPayload {
  equipe: string;
  level: MatchmakingLevel;
  arena: string;
  date: string; // YYYY-MM-DD
  times: string[]; // 1 ou 2 créneaux HH:MM
  announceGeneral: boolean;
}

export interface CreateMatchmakingResult {
  ok: boolean;
  threadId: string;
  threadUrl: string;
  title: string;
  announcedGeneral: boolean;
  announceError?: string;
}

export async function createMatchmakingForumPost(
  payload: CreateMatchmakingPayload
): Promise<CreateMatchmakingResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Connexion Discord requise pour publier un post Matchmaking.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(`${WORKER_URL}/api/discord/matchmaking/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<
    CreateMatchmakingResult & { error?: string; message?: string }
  >;

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Impossible de créer le post Matchmaking (HTTP ${response.status})`
    );
  }

  return {
    ok: Boolean(data.ok),
    threadId: String(data.threadId || ''),
    threadUrl: String(data.threadUrl || ''),
    title: String(data.title || ''),
    announcedGeneral: Boolean(data.announcedGeneral),
    announceError: data.announceError,
  };
}
