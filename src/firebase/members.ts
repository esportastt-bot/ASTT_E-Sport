import { collection, doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

export interface MemberProfile {
  discordId: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  discordRoles: string[];
  updatedAt?: any;
}

/** Créer ou mettre à jour le profil d'un membre */
export async function upsertMember(profile: MemberProfile): Promise<void> {
  await setDoc(
    doc(db, 'members', profile.discordId),
    {
      discord_id: profile.discordId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      is_admin: profile.isAdmin,
      discord_roles: profile.discordRoles,
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Écoute le profil d'un membre */
export function subscribeToMember(
  discordId: string,
  callback: (profile: MemberProfile | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'members', discordId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const d = snap.data();
      callback({
        discordId: d.discord_id || snap.id,
        displayName: d.display_name || 'Membre ASTT',
        avatarUrl: d.avatar_url || '',
        isAdmin: Boolean(d.is_admin || d.is_captain),
        discordRoles: Array.isArray(d.discord_roles) ? d.discord_roles : [],
      });
    },
    (err) => {
      console.warn('Erreur lecture membre Firestore:', err.message);
      callback(null);
    }
  );
}

/** Écoute la liste complète des membres enregistrés */
export function subscribeToAllMembers(
  callback: (members: Record<string, MemberProfile>) => void
): () => void {
  return onSnapshot(
    collection(db, 'members'),
    (snapshot) => {
      const map: Record<string, MemberProfile> = {};
      snapshot.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const discordId = d.discord_id || docSnap.id;
        map[discordId] = {
          discordId,
          displayName: d.display_name || 'Membre ASTT',
          avatarUrl: d.avatar_url || '',
          isAdmin: Boolean(d.is_admin || d.is_captain),
          discordRoles: Array.isArray(d.discord_roles) ? d.discord_roles : [],
        };
      });
      callback(map);
    },
    (err) => {
      console.warn('Erreur lecture liste membres Firestore:', err.message);
    }
  );
}
