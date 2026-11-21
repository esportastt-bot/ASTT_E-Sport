import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { SlotProfile } from '../types';

const SLOT_PROFILES_COL = 'slot_profiles';

/** Écoute en temps réel la liste des profils de créneaux (ex: Profil HFGET) */
export function subscribeToSlotProfiles(
  callback: (profiles: SlotProfile[]) => void
): () => void {
  return onSnapshot(
    collection(db, SLOT_PROFILES_COL),
    (snapshot) => {
      const list: SlotProfile[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const rawDays = Array.isArray(d.days) ? d.days : [];
        const days = rawDays.map((day: any) => ({
          dayName: String(day?.dayName || ''),
          active: Boolean(day?.active),
          slots: Array.isArray(day?.slots)
            ? day.slots.map((s: any) => ({
                startTime: String(s?.startTime || '20:30'),
                endTime: String(s?.endTime || '21:50'),
                ...(typeof s?.minParticipants === 'number'
                  ? { minParticipants: s.minParticipants }
                  : {}),
                ...(typeof s?.maxParticipants === 'number'
                  ? { maxParticipants: s.maxParticipants }
                  : {}),
              }))
            : [],
        }));

        return {
          id: docSnap.id,
          name: d.name || 'Profil sans nom',
          createdBy: d.created_by || '',
          createdByName: d.created_by_name || '',
          days,
          trainingType: d.training_type || undefined,
          minParticipants:
            typeof d.min_participants === 'number' ? d.min_participants : undefined,
          maxParticipants:
            typeof d.max_participants === 'number' ? d.max_participants : undefined,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      callback(list);
    },
    (err) => {
      console.warn('Erreur lecture profils de créneaux Firestore:', err.message);
      callback([]);
    }
  );
}

/** Crée ou met à jour un profil de créneaux */
export async function saveSlotProfile(
  profile: Omit<SlotProfile, 'id'> & { id?: string }
): Promise<string> {
  const payload = {
    name: profile.name.trim(),
    created_by: profile.createdBy,
    created_by_name: profile.createdByName,
    days: profile.days.map((d) => ({
      dayName: d.dayName,
      active: Boolean(d.active),
      slots: d.slots.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        ...(typeof s.minParticipants === 'number'
          ? { minParticipants: s.minParticipants }
          : {}),
        ...(typeof s.maxParticipants === 'number'
          ? { maxParticipants: s.maxParticipants }
          : {}),
      })),
    })),
    training_type: profile.trainingType || null,
    min_participants: profile.minParticipants ?? null,
    max_participants: profile.maxParticipants ?? null,
    updated_at: serverTimestamp(),
  };

  if (profile.id) {
    await setDoc(doc(db, SLOT_PROFILES_COL, profile.id), payload, { merge: true });
    return profile.id;
  }

  const created = await addDoc(collection(db, SLOT_PROFILES_COL), {
    ...payload,
    created_at: serverTimestamp(),
  });
  return created.id;
}

/** Supprime un profil de créneaux */
export async function deleteSlotProfile(profileId: string): Promise<void> {
  await deleteDoc(doc(db, SLOT_PROFILES_COL, profileId));
}
