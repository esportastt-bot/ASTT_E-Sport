import {
  collection, doc, updateDoc, getDocs, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './config';
import type { Poll, TimeSlot, ResponseStatus } from '../types';

const POLLS_COL = 'polls';

// ─── Conversion Firestore → Poll ───────────────────────────────────────────

function docToPoll(id: string, data: any): Poll {
  return {
    id,
    title: data.title,
    type: data.training_type,
    periodType: '1_week',
    startDate: data.start_date,
    endDate: data.end_date,
    deadline: data.deadline?.toDate?.()?.toISOString() || data.deadline,
    minParticipants: data.min_participants,
    maxParticipants: data.max_participants,
    discordChannel: data.discord_channel_id || '',
    targetRoles: data.target_role_ids || [],
    targetUsers: data.target_user_ids || [],
    excludedUsers: data.excluded_user_ids || [],
    status: data.status,
    slots: [], // chargés séparément
  };
}

// ─── POLLS CRUD ────────────────────────────────────────────────────────────

/** Créer un sondage avec ses créneaux */
export async function createPoll(
  pollData: Omit<Poll, 'id' | 'slots'>,
  slots: Omit<TimeSlot, 'id' | 'disponibles' | 'incertains' | 'indisponibles' | 'selectedIds' | 'waitlistIds'>[]
): Promise<string> {
  const batch = writeBatch(db);

  // Document principal
  const pollRef = doc(collection(db, POLLS_COL));
  batch.set(pollRef, {
    title: pollData.title,
    training_type: pollData.type,
    start_date: pollData.startDate,
    end_date: pollData.endDate,
    deadline: Timestamp.fromDate(new Date(pollData.deadline)),
    min_participants: pollData.minParticipants,
    max_participants: pollData.maxParticipants,
    discord_channel_id: pollData.discordChannel,
    target_role_ids: pollData.targetRoles,
    target_user_ids: pollData.targetUsers,
    excluded_user_ids: pollData.excludedUsers,
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

/** Écoute en temps réel la liste des sondages ouverts */
export function subscribeToPollsList(
  callback: (polls: Poll[]) => void
): () => void {
  const q = query(
    collection(db, POLLS_COL),
    where('status', 'in', ['OPEN', 'CLOSED']),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const polls: Poll[] = [];
    for (const docSnap of snapshot.docs) {
      const poll = docToPoll(docSnap.id, docSnap.data());
      // Charger les créneaux
      const slotsSnap = await getDocs(
        query(collection(db, POLLS_COL, docSnap.id, 'slots'), orderBy('date_str'), orderBy('start_time'))
      );
      poll.slots = slotsSnap.docs.map(s => ({
        id: s.id,
        dateStr: s.data().date_str,
        dayName: s.data().day_name,
        startTime: s.data().start_time,
        endTime: s.data().end_time,
        disponibles: [],
        incertains: [],
        indisponibles: [],
        selectedIds: s.data().selected_user_ids || [],
        waitlistIds: s.data().waitlist_user_ids || [],
      }));
      polls.push(poll);
    }
    callback(polls);
  });
}

/** Écoute en temps réel les réponses d'un sondage */
export function subscribeToResponses(
  pollId: string,
  callback: (slotResponses: Record<string, { disponibles: string[]; incertains: string[]; indisponibles: string[] }>) => void
): () => void {
  return onSnapshot(
    collection(db, POLLS_COL, pollId, 'responses'),
    (snapshot) => {
      const result: Record<string, { disponibles: string[]; incertains: string[]; indisponibles: string[] }> = {};

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const slotResponses: Record<string, ResponseStatus> = data.slot_responses || {};

        Object.entries(slotResponses).forEach(([slotId, status]) => {
          if (!result[slotId]) {
            result[slotId] = { disponibles: [], incertains: [], indisponibles: [] };
          }
          const uid = docSnap.id; // discord_id = auth uid
          if (status === 'DISPONIBLE') result[slotId].disponibles.push(uid);
          else if (status === 'INCERTAIN') result[slotId].incertains.push(uid);
          else if (status === 'INDISPONIBLE') result[slotId].indisponibles.push(uid);
        });
      });

      callback(result);
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
  await updateDoc(responseRef, {
    display_name: displayName,
    slot_responses: votes,
    submitted_at: serverTimestamp(),
  }).catch(async () => {
    // Document n'existe pas encore → créer
    await setDoc(responseRef, {
      discord_id: userId,
      display_name: displayName,
      slot_responses: votes,
      submitted_at: serverTimestamp(),
    });
  });

  // Marquer le membre comme ayant répondu
  const memberRef = doc(db, POLLS_COL, pollId, 'members', userId);
  await setDoc(memberRef, {
    discord_id: userId,
    display_name: displayName,
    has_submitted: true,
    last_viewed_at: serverTimestamp(),
  }, { merge: true });
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
  // Supprimer les sous-collections puis le document principal
  const subCols = ['slots', 'responses', 'members'];
  const batch = writeBatch(db);

  for (const col of subCols) {
    const snap = await getDocs(collection(db, POLLS_COL, pollId, col));
    snap.docs.forEach(d => batch.delete(d.ref));
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

/** Modifier les informations d'un sondage ouvert */
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
  if (changes.title) firestoreData.title = changes.title;
  if (changes.deadline) firestoreData.deadline = Timestamp.fromDate(new Date(changes.deadline));
  if (changes.minParticipants) firestoreData.min_participants = changes.minParticipants;
  if (changes.maxParticipants) firestoreData.max_participants = changes.maxParticipants;
  if (changes.status) firestoreData.status = changes.status;
  await updateDoc(doc(db, POLLS_COL, pollId), firestoreData);
}
