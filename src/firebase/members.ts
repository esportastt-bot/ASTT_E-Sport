import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

export interface MemberProfile {
  discordId: string;
  displayName: string;
  avatarUrl: string;
  isCaptain: boolean;
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
      is_captain: profile.isCaptain,
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
  return onSnapshot(doc(db, 'members', discordId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const d = snap.data();
    callback({
      discordId: d.discord_id,
      displayName: d.display_name,
      avatarUrl: d.avatar_url || '',
      isCaptain: d.is_captain || false,
      discordRoles: d.discord_roles || [],
    });
  });
}
