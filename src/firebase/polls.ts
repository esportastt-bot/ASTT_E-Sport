import {
  collection, doc, updateDoc, getDocs, setDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';
import type { Poll, TimeSlot, ResponseStatus } from '../types';

const POLLS_COL = 'polls';

export type SlotVotesMap = Record<
  string,
  { disponibles: string[]; incertains: string[]; indisponibles: string[] }
>;

export interface PollSlotSelection {
  id: string;
  dateStr: string;
  dayName: string;
  startTime: string;
  endTime: string;
  selectedIds: string[];
  waitlistIds: string[];
}

// ─── Conversion Firestore → Poll ───────────────────────────────────────────

function docToPoll(id: string, data: any): Poll {
  return {
    id,
    title: data.title || 'Sondage sans titre',
    type: data.training_type || 'ASTT',
    periodType: '1_week',
    startDate: data.start_date || '',
    endDate: data.end_date || '',
    deadline: data.deadline?.toDate?.()?.toISOString() || data.deadline || '',
    minParticipants: Number(data.min_participants) || 4,
    maxParticipants: Number(data.max_participants) || 8,
    discordChannel: data.discord_channel_id || '',
    targetRoles: Array.isArray(data.target_role_ids) ? data.target_role_ids : [],
    targetUsers: Array.isArray(data.target_user_ids) ? data.target_user_ids : [],
    excludedUsers: Array.isArray(data.excluded_user_ids) ? data.excluded_user_ids : [],
    status: data.status || 'OPEN',
    slots: [], // chargés séparément
  };
}

function parseResponsesDocs(
  docs: Array<{ id: string; data: () => any }>
): { slotVotes: SlotVotesMap; voterNames: Record<string, string> } {
  const slotVotes: SlotVotesMap = {};
  const voterNames: Record<string, string> = {};

  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = data.discord_id || docSnap.id;
    if (data.display_name) {
      voterNames[uid] = data.display_name;
    }

    const slotResponses: Record<string, ResponseStatus> = data.slot_responses || {};
    Object.entries(slotResponses).forEach(([slotId, status]) => {
      if (!slotVotes[slotId]) {
        slotVotes[slotId] = { disponibles: [], incertains: [], indisponibles: [] };
      }
      if (status === 'DISPONIBLE') slotVotes[slotId].disponibles.push(uid);
      else if (status === 'INCERTAIN') slotVotes[slotId].incertains.push(uid);
      else if (status === 'INDISPONIBLE') slotVotes[slotId].indisponibles.push(uid);
    });
  });

  return { slotVotes, voterNames };
}

function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort(
    (a, b) => a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime)
  );
}

// ─── POLLS CRUD ────────────────────────────────────────────────────────────

/** Créer un sondage avec ses créneaux */
export async function createPoll(
  pollData: Omit<Poll, 'id' | 'slots'>,
  slots: Omit<TimeSlot, 'id' | 'disponibles' | 'incertains' | 'indisponibles' | 'selectedIds' | 'waitlistIds'>[]
): Promise<string> {
  const batch = writeBatch(db);

  const parsedDeadline = new Date(pollData.deadline);
  if (Number.isNaN(parsedDeadline.getTime())) {
    throw new Error('Date limite invalide.');
  }

  // Document principal
  const pollRef = doc(collection(db, POLLS_COL));
  batch.set(pollRef, {
    title: pollData.title,
    training_type: pollData.type,
    start_date: pollData.startDate,
    end_date: pollData.endDate,
    deadline: Timestamp.fromDate(parsedDeadline),
    min_participants: pollData.minParticipants,
    max_participants: pollData.maxParticipants,
    discord_channel_id: pollData.discordChannel || '',
    target_role_ids: pollData.targetRoles || [],
    target_user_ids: pollData.targetUsers || [],
    excluded_user_ids: pollData.excludedUsers || [],
    status: 'OPEN',
    reminder_sent: false,
    closed_notified: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  // Sous-collection slots
  for (const slot of slots) {
    const slotRef = doc(collection(db, POLLS_COL, pollRef.id, 'slots'));
    batch.set(slotRef, {
      date_str: slot.dateStr,
      day_name: slot.dayName,
      start_time: slot.startTime,
      end_time: slot.endTime,
      min_notified: false,
      sub_min_notified: false,
      selected_user_ids: [],
      waitlist_user_ids: [],
    });
  }

  await batch.commit();
  return pollRef.id;
}

/** Écoute en temps réel la liste complète des sondages (ouverts, clôturés, annulés) */
export function subscribeToPollsList(
  callback: (polls: Poll[], voterNames: Record<string, string>) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, POLLS_COL), orderBy('created_at', 'desc'));

  return onSnapshot(
    q,
    async (snapshot) => {
      try {
        const allVoterNames: Record<string, string> = {};

        const polls = await Promise.all(
          snapshot.docs.map(async (docSnap) => {
            const poll = docToPoll(docSnap.id, docSnap.data());

            const [slotsSnap, responsesSnap] = await Promise.all([
              getDocs(collection(db, POLLS_COL, docSnap.id, 'slots')),
              getDocs(collection(db, POLLS_COL, docSnap.id, 'responses')),
            ]);

            const { slotVotes, voterNames } = parseResponsesDocs(responsesSnap.docs);
            Object.assign(allVoterNames, voterNames);

            const mappedSlots: TimeSlot[] = slotsSnap.docs.map((s) => {
              const d = s.data();
              const votes = slotVotes[s.id] || {
                disponibles: [],
                incertains: [],
                indisponibles: [],
              };
              return {
                id: s.id,
                dateStr: d.date_str || '',
                dayName: d.day_name || '',
                startTime: d.start_time || '',
                endTime: d.end_time || '',
                disponibles: votes.disponibles,
                incertains: votes.incertains,
                indisponibles: votes.indisponibles,
                selectedIds: Array.isArray(d.selected_user_ids) ? d.selected_user_ids : [],
                waitlistIds: Array.isArray(d.waitlist_user_ids) ? d.waitlist_user_ids : [],
              };
            });

            poll.slots = sortSlots(mappedSlots);
            return poll;
          })
        );

        callback(polls, allVoterNames);
      } catch (err: any) {
        console.error('Erreur traitement documents Firestore:', err);
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    (err) => {
      console.warn('Firestore snapshot non autorisé ou hors-ligne:', err.message);
      onError?.(err);
    }
  );
}

/** Écoute en temps réel les réponses d'un sondage */
export function subscribeToResponses(
  pollId: string,
  callback: (slotResponses: SlotVotesMap, voterNames: Record<string, string>) => void
): () => void {
  return onSnapshot(
    collection(db, POLLS_COL, pollId, 'responses'),
    (snapshot) => {
      const { slotVotes, voterNames } = parseResponsesDocs(snapshot.docs);
      callback(slotVotes, voterNames);
    },
    (err) => {
      console.warn(`Erreur snapshot réponses (${pollId}):`, err.message);
    }
  );
}

/** Écoute en temps réel les créneaux d'un sondage (titulaires / liste d'attente) */
export function subscribeToPollSlots(
  pollId: string,
  callback: (slots: PollSlotSelection[]) => void
): () => void {
  return onSnapshot(
    collection(db, POLLS_COL, pollId, 'slots'),
    (snapshot) => {
      const slots: PollSlotSelection[] = snapshot.docs.map((s) => {
        const d = s.data();
        return {
          id: s.id,
          dateStr: d.date_str || '',
          dayName: d.day_name || '',
          startTime: d.start_time || '',
          endTime: d.end_time || '',
          selectedIds: Array.isArray(d.selected_user_ids) ? d.selected_user_ids : [],
          waitlistIds: Array.isArray(d.waitlist_user_ids) ? d.waitlist_user_ids : [],
        };
      });
      slots.sort(
        (a, b) => a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime)
      );
      callback(slots);
    },
    (err) => {
      console.warn(`Erreur snapshot créneaux (${pollId}):`, err.message);
    }
  );
}

/** Soumettre ou mettre à jour les réponses d'un membre */
export async function submitResponses(
  pollId: string,
  userId: string,
  displayName: string,
  votes: Record<string, ResponseStatus>
): Promise<void> {
  const responseRef = doc(db, POLLS_COL, pollId, 'responses', userId);
  await setDoc(
    responseRef,
    {
      discord_id: userId,
      display_name: displayName,
      slot_responses: votes,
      submitted_at: serverTimestamp(),
    },
    { merge: true }
  );

  // Marquer le membre comme ayant répondu
  const memberRef = doc(db, POLLS_COL, pollId, 'members', userId);
  await setDoc(
    memberRef,
    {
      discord_id: userId,
      display_name: displayName,
      has_submitted: true,
      last_viewed_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Annuler un sondage (status → CANCELLED) */
export async function cancelPoll(pollId: string): Promise<void> {
  await updateDoc(doc(db, POLLS_COL, pollId), {
    status: 'CANCELLED',
    updated_at: serverTimestamp(),
  });
}

/** Supprimer définitivement un sondage et toutes ses données */
export async function deletePoll(pollId: string): Promise<void> {
  const subCols = ['slots', 'responses', 'members'];
  const batch = writeBatch(db);

  for (const col of subCols) {
    const snap = await getDocs(collection(db, POLLS_COL, pollId, col));
    snap.docs.forEach((d) => batch.delete(d.ref));
  }

  batch.delete(doc(db, POLLS_COL, pollId));
  await batch.commit();
}

/** Mettre à jour la sélection manuelle du capitaine (titulaires + liste d'attente) */
export async function updateSlotSelection(
  pollId: string,
  slotId: string,
  selectedIds: string[],
  waitlistIds: string[]
): Promise<void> {
  await updateDoc(doc(db, POLLS_COL, pollId, 'slots', slotId), {
    selected_user_ids: selectedIds,
    waitlist_user_ids: waitlistIds,
  });
}

/** Modifier les informations d'un sondage */
export async function updatePoll(
  pollId: string,
  changes: Partial<{
    title: string;
    deadline: string;
    minParticipants: number;
    maxParticipants: number;
    status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  }>
): Promise<void> {
  const firestoreData: Record<string, any> = { updated_at: serverTimestamp() };
  if (changes.title !== undefined) firestoreData.title = changes.title;
  if (changes.deadline !== undefined) {
    const d = new Date(changes.deadline);
    if (Number.isNaN(d.getTime())) throw new Error('Date limite invalide.');
    firestoreData.deadline = Timestamp.fromDate(d);
  }
  if (changes.minParticipants !== undefined) firestoreData.min_participants = changes.minParticipants;
  if (changes.maxParticipants !== undefined) firestoreData.max_participants = changes.maxParticipants;
  if (changes.status !== undefined) firestoreData.status = changes.status;
  await updateDoc(doc(db, POLLS_COL, pollId), firestoreData);
}
