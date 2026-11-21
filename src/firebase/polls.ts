import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';
import type { Poll, TimeSlot, ResponseStatus, TrainingType } from '../types';

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
  minParticipants?: number;
  maxParticipants?: number;
  trainingType?: TrainingType;
  selectedIds: string[];
  waitlistIds: string[];
  teamAssignments: Record<string, 'A' | 'B'>;
  cancelled: boolean;
  cancelReason: string;
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
    createdBy: data.created_by || '',
    createdByName: data.created_by_name || '',
    createdAt: data.created_at?.toMillis?.() || 0,
    desiredGamesByUser: {},
    status: data.status || 'OPEN',
    slots: [],
  };
}

function parseResponsesDocs(
  docs: Array<{ id: string; data: () => any }>
): {
  slotVotes: SlotVotesMap;
  voterNames: Record<string, string>;
  desiredGamesByUser: Record<string, number | null>;
} {
  const slotVotes: SlotVotesMap = {};
  const voterNames: Record<string, string> = {};
  const desiredGamesByUser: Record<string, number | null> = {};

  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = data.discord_id || docSnap.id;
    if (data.display_name) {
      voterNames[uid] = data.display_name;
    }

    if (typeof data.desired_games === 'number' && Number.isFinite(data.desired_games)) {
      desiredGamesByUser[uid] = data.desired_games;
    } else if (data.desired_games === null) {
      desiredGamesByUser[uid] = null;
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

  return { slotVotes, voterNames, desiredGamesByUser };
}

function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort(
    (a, b) => a.dateStr.localeCompare(b.dateStr) || a.startTime.localeCompare(b.startTime)
  );
}

async function hydratePollDocuments(
  docs: QueryDocumentSnapshot<DocumentData>[]
): Promise<{ polls: Poll[]; voterNames: Record<string, string> }> {
  const allVoterNames: Record<string, string> = {};

  const polls = await Promise.all(
    docs.map(async (docSnap) => {
      const poll = docToPoll(docSnap.id, docSnap.data());

      const [slotsSnap, responsesSnap] = await Promise.all([
        getDocs(collection(db, POLLS_COL, docSnap.id, 'slots')),
        getDocs(collection(db, POLLS_COL, docSnap.id, 'responses')),
      ]);

      const { slotVotes, voterNames, desiredGamesByUser } = parseResponsesDocs(
        responsesSnap.docs
      );
      Object.assign(allVoterNames, voterNames);
      poll.desiredGamesByUser = desiredGamesByUser;

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
          minParticipants:
            typeof d.min_participants === 'number' ? d.min_participants : undefined,
          maxParticipants:
            typeof d.max_participants === 'number' ? d.max_participants : undefined,
          trainingType:
            typeof d.training_type === 'string'
              ? (d.training_type as TrainingType)
              : undefined,
          disponibles: votes.disponibles,
          incertains: votes.incertains,
          indisponibles: votes.indisponibles,
          selectedIds: Array.isArray(d.selected_user_ids) ? d.selected_user_ids : [],
          waitlistIds: Array.isArray(d.waitlist_user_ids) ? d.waitlist_user_ids : [],
          teamAssignments:
            d.team_assignments && typeof d.team_assignments === 'object'
              ? d.team_assignments
              : {},
          cancelled: Boolean(d.cancelled),
          cancelReason: typeof d.cancel_reason === 'string' ? d.cancel_reason : '',
        };
      });

      poll.slots = sortSlots(mappedSlots);
      return poll;
    })
  );

  polls.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { polls, voterNames: allVoterNames };
}

// ─── POLLS CRUD ────────────────────────────────────────────────────────────

/** Créer un sondage avec ses créneaux */
export async function createPoll(
  pollData: Omit<Poll, 'id' | 'slots' | 'desiredGamesByUser' | 'createdAt'>,
  slots: Omit<
    TimeSlot,
    'id' | 'disponibles' | 'incertains' | 'indisponibles' | 'selectedIds' | 'waitlistIds'
  >[]
): Promise<string> {
  const batch = writeBatch(db);

  const parsedDeadline = new Date(pollData.deadline);
  if (Number.isNaN(parsedDeadline.getTime())) {
    throw new Error('Date limite invalide.');
  }

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
    created_by: pollData.createdBy,
    created_by_name: pollData.createdByName,
    status: 'OPEN',
    reminder_sent: false,
    closed_notified: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  for (const slot of slots) {
    const slotRef = doc(collection(db, POLLS_COL, pollRef.id, 'slots'));
    batch.set(slotRef, {
      date_str: slot.dateStr,
      day_name: slot.dayName,
      start_time: slot.startTime,
      end_time: slot.endTime,
      min_participants: slot.minParticipants ?? pollData.minParticipants,
      max_participants: slot.maxParticipants ?? pollData.maxParticipants,
      training_type: slot.trainingType ?? pollData.type,
      min_notified: false,
      sub_min_notified: false,
      selected_user_ids: [],
      waitlist_user_ids: [],
      team_assignments: {},
      cancelled: false,
      cancel_reason: '',
    });
  }

  await batch.commit();
  return pollRef.id;
}

/** Écoute en temps réel les sondages accessibles à l'utilisateur (Admin = tous ; Membre = ciblés ou créés) */
export function subscribeToPollsList(
  userId: string,
  isAdmin: boolean,
  callback: (polls: Poll[], voterNames: Record<string, string>) => void,
  onError?: (err: Error) => void
): () => void {
  if (isAdmin) {
    const q = query(collection(db, POLLS_COL), orderBy('created_at', 'desc'));
    return onSnapshot(
      q,
      async (snapshot) => {
        try {
          const { polls, voterNames } = await hydratePollDocuments(snapshot.docs);
          callback(polls, voterNames);
        } catch (err: any) {
          console.error('Erreur traitement documents Firestore:', err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      },
      (err) => {
        console.warn('Firestore snapshot admin error:', err.message);
        onError?.(err);
      }
    );
  }

  const targetedDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  const createdDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  let hasTargetedSnap = false;
  let hasCreatedSnap = false;

  const emitMerged = async () => {
    if (!hasTargetedSnap && !hasCreatedSnap) return;
    try {
      const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>();
      targetedDocs.forEach((d, id) => merged.set(id, d));
      createdDocs.forEach((d, id) => merged.set(id, d));
      const { polls, voterNames } = await hydratePollDocuments(Array.from(merged.values()));
      callback(polls, voterNames);
    } catch (err: any) {
      console.error('Erreur fusion sondages Firestore:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const qTargeted = query(
    collection(db, POLLS_COL),
    where('target_user_ids', 'array-contains', userId)
  );
  const qCreated = query(collection(db, POLLS_COL), where('created_by', '==', userId));

  const unsubTargeted = onSnapshot(
    qTargeted,
    (snap) => {
      targetedDocs.clear();
      snap.docs.forEach((d) => targetedDocs.set(d.id, d));
      hasTargetedSnap = true;
      void emitMerged();
    },
    (err) => {
      console.warn('Firestore snapshot target_user_ids error:', err.message);
      hasTargetedSnap = true;
      onError?.(err);
    }
  );

  const unsubCreated = onSnapshot(
    qCreated,
    (snap) => {
      createdDocs.clear();
      snap.docs.forEach((d) => createdDocs.set(d.id, d));
      hasCreatedSnap = true;
      void emitMerged();
    },
    (err) => {
      console.warn('Firestore snapshot created_by error:', err.message);
      hasCreatedSnap = true;
      onError?.(err);
    }
  );

  return () => {
    unsubTargeted();
    unsubCreated();
  };
}

/** Écoute en temps réel les réponses d'un sondage */
export function subscribeToResponses(
  pollId: string,
  callback: (
    slotResponses: SlotVotesMap,
    voterNames: Record<string, string>,
    desiredGamesByUser: Record<string, number | null>
  ) => void
): () => void {
  return onSnapshot(
    collection(db, POLLS_COL, pollId, 'responses'),
    (snapshot) => {
      const { slotVotes, voterNames, desiredGamesByUser } = parseResponsesDocs(
        snapshot.docs
      );
      callback(slotVotes, voterNames, desiredGamesByUser);
    },
    (err) => {
      console.warn(`Erreur snapshot réponses (${pollId}):`, err.message);
    }
  );
}

/** Écoute en temps réel les créneaux d'un sondage */
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
          minParticipants:
            typeof d.min_participants === 'number' ? d.min_participants : undefined,
          maxParticipants:
            typeof d.max_participants === 'number' ? d.max_participants : undefined,
          trainingType:
            typeof d.training_type === 'string'
              ? (d.training_type as TrainingType)
              : undefined,
          selectedIds: Array.isArray(d.selected_user_ids) ? d.selected_user_ids : [],
          waitlistIds: Array.isArray(d.waitlist_user_ids) ? d.waitlist_user_ids : [],
          teamAssignments:
            d.team_assignments && typeof d.team_assignments === 'object'
              ? d.team_assignments
              : {},
          cancelled: Boolean(d.cancelled),
          cancelReason: typeof d.cancel_reason === 'string' ? d.cancel_reason : '',
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

/** Soumettre ou mettre à jour les réponses et le souhait de parties d'un membre */
export async function submitResponses(
  pollId: string,
  userId: string,
  displayName: string,
  votes: Record<string, ResponseStatus>,
  desiredGames: number | null
): Promise<void> {
  const responseRef = doc(db, POLLS_COL, pollId, 'responses', userId);
  await setDoc(
    responseRef,
    {
      discord_id: userId,
      display_name: displayName,
      slot_responses: votes,
      desired_games: desiredGames,
      submitted_at: serverTimestamp(),
    },
    { merge: true }
  );

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

/** Mettre à jour la sélection manuelle d'un créneau */
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

/** Mettre à jour les détails complets d'un créneau (équipes, annulation, min/max, horaires, sélections) */
export async function updateSlotDetails(
  pollId: string,
  slotId: string,
  changes: Partial<{
    selectedIds: string[];
    waitlistIds: string[];
    teamAssignments: Record<string, 'A' | 'B'>;
    cancelled: boolean;
    cancelReason: string;
    startTime: string;
    endTime: string;
    minParticipants: number;
    maxParticipants: number;
    trainingType: TrainingType;
  }>
): Promise<void> {
  const payload: Record<string, any> = {};
  if (changes.selectedIds !== undefined) payload.selected_user_ids = changes.selectedIds;
  if (changes.waitlistIds !== undefined) payload.waitlist_user_ids = changes.waitlistIds;
  if (changes.teamAssignments !== undefined) payload.team_assignments = changes.teamAssignments;
  if (changes.cancelled !== undefined) payload.cancelled = changes.cancelled;
  if (changes.cancelReason !== undefined) payload.cancel_reason = changes.cancelReason;
  if (changes.startTime !== undefined) payload.start_time = changes.startTime;
  if (changes.endTime !== undefined) payload.end_time = changes.endTime;
  if (changes.minParticipants !== undefined) payload.min_participants = changes.minParticipants;
  if (changes.maxParticipants !== undefined) payload.max_participants = changes.maxParticipants;
  if (changes.trainingType !== undefined) payload.training_type = changes.trainingType;

  await updateDoc(doc(db, POLLS_COL, pollId, 'slots', slotId), payload);
}

/** Enregistrer plusieurs créneaux en une seule transaction batch */
export async function batchSavePollSlots(
  pollId: string,
  updates: Array<{
    slotId: string;
    selectedIds: string[];
    waitlistIds: string[];
    teamAssignments?: Record<string, 'A' | 'B'>;
    cancelled?: boolean;
    cancelReason?: string;
    minParticipants?: number;
    maxParticipants?: number;
    trainingType?: TrainingType;
  }>
): Promise<void> {
  if (updates.length === 0) return;
  const batch = writeBatch(db);
  for (const item of updates) {
    const slotRef = doc(db, POLLS_COL, pollId, 'slots', item.slotId);
    const payload: Record<string, any> = {
      selected_user_ids: item.selectedIds,
      waitlist_user_ids: item.waitlistIds,
    };
    if (item.teamAssignments !== undefined) payload.team_assignments = item.teamAssignments;
    if (item.cancelled !== undefined) payload.cancelled = item.cancelled;
    if (item.cancelReason !== undefined) payload.cancel_reason = item.cancelReason;
    if (item.minParticipants !== undefined) payload.min_participants = item.minParticipants;
    if (item.maxParticipants !== undefined) payload.max_participants = item.maxParticipants;
    if (item.trainingType !== undefined) payload.training_type = item.trainingType;
    batch.update(slotRef, payload);
  }
  await batch.commit();
}

/** Ajouter un créneau de secours à un sondage existant */
export async function addSlotToPoll(
  pollId: string,
  slot: {
    dateStr: string;
    dayName: string;
    startTime: string;
    endTime: string;
    minParticipants?: number;
    maxParticipants?: number;
    trainingType?: TrainingType;
  }
): Promise<string> {
  const created = await addDoc(collection(db, POLLS_COL, pollId, 'slots'), {
    date_str: slot.dateStr,
    day_name: slot.dayName,
    start_time: slot.startTime,
    end_time: slot.endTime,
    ...(typeof slot.minParticipants === 'number'
      ? { min_participants: slot.minParticipants }
      : {}),
    ...(typeof slot.maxParticipants === 'number'
      ? { max_participants: slot.maxParticipants }
      : {}),
    ...(slot.trainingType ? { training_type: slot.trainingType } : {}),
    min_notified: false,
    sub_min_notified: false,
    selected_user_ids: [],
    waitlist_user_ids: [],
    team_assignments: {},
    cancelled: false,
    cancel_reason: '',
  });
  return created.id;
}

/** Supprimer définitivement un créneau d'un sondage */
export async function deleteSlotFromPoll(pollId: string, slotId: string): Promise<void> {
  await deleteDoc(doc(db, POLLS_COL, pollId, 'slots', slotId));
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
