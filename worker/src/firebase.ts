// Génération de Firebase Custom Tokens et vérification des Firebase ID Tokens via Web Crypto API

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

/** Convertit une clé PEM en CryptoKey pour Web Crypto API */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const normalizedPem = pemKey.replace(/\\n/g, '\n');
  const keyBody = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(keyBody), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Encode en base64url (UTF-8 safe pour les caractères accentués et emojis) */
function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Décode une chaîne base64url vers Uint8Array */
function decodeBase64UrlBytes(b64u: string): Uint8Array {
  const normalized = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T = Record<string, any>>(b64u: string): T {
  const bytes = decodeBase64UrlBytes(b64u);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface GoogleJwk extends JsonWebKey {
  kid: string;
}

let cachedJwks: GoogleJwk[] | null = null;
let cachedJwksFetchedAt = 0;
const JWKS_TTL_MS = 3600 * 1000;

async function fetchFirebaseJwks(forceRefresh = false): Promise<GoogleJwk[]> {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && now - cachedJwksFetchedAt < JWKS_TTL_MS) {
    return cachedJwks;
  }

  const res = await fetch(FIREBASE_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase JWKS (${res.status})`);
  }
  const body = (await res.json()) as { keys?: GoogleJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('Firebase JWKS response contained no keys');
  }
  cachedJwks = body.keys;
  cachedJwksFetchedAt = now;
  return cachedJwks;
}

/**
 * Vérifie la signature et les claims d'un Firebase ID Token côté Worker.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<{ uid: string; claims: Record<string, any> }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unsupported JWT header');
  }

  const payload = decodeBase64UrlJson<Record<string, any>>(payloadB64);
  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  if (payload.aud !== projectId) {
    throw new Error('Invalid JWT audience');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Invalid JWT issuer');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Invalid JWT subject');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('JWT expired');
  }
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 300) {
    throw new Error('JWT issued in the future');
  }

  let keys = await fetchFirebaseJwks(false);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk && Date.now() - cachedJwksFetchedAt > 60_000) {
    keys = await fetchFirebaseJwks(true);
    jwk = keys.find(k => k.kid === header.kid);
  }
  if (!jwk) {
    throw new Error('Matching JWKS key not found');
  }

  const verifyKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = decodeBase64UrlBytes(signatureB64);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    verifyKey,
    signatureBytes,
    signedData
  );

  if (!isValid) {
    throw new Error('Invalid JWT signature');
  }

  return { uid: payload.sub, claims: payload };
}

/**
 * Génère un Firebase Custom Token signé avec la clé RSA du compte de service.
 */
export async function createFirebaseCustomToken(
  serviceAccount: ServiceAccount,
  uid: string,
  claims: Record<string, any>
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.private_key_id || 'key',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600, // 1 heure
    uid,
    claims,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = base64url(signatureBuffer);
  return `${signingInput}.${signature}`;
}

// ─── Google OAuth2 Access Token & Firestore REST Reader ────────────────────

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

export async function getFirestoreAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const nowMs = Date.now();
  if (cachedAccessToken && nowMs < cachedAccessTokenExpiresAt - 120_000) {
    return cachedAccessToken;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.private_key_id || 'key',
  };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const assertion = `${signingInput}.${base64url(sigBuf)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google OAuth2 token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Google OAuth2 response missing access_token');
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('stringValue' in val) return String(val.stringValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const vals = val.arrayValue?.values;
    return Array.isArray(vals) ? vals.map(fromFirestoreValue) : [];
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue?.fields);
  }
  return undefined;
}

function fromFirestoreFields(fields?: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const [key, raw] of Object.entries(fields)) {
    out[key] = fromFirestoreValue(raw);
  }
  return out;
}

export interface FirestorePollDoc {
  id: string;
  title: string;
  trainingType: string;
  startDate: string;
  endDate: string;
  deadline: string;
  createdBy: string;
  createdByName: string;
  status: string;
  targetUserIds: string[];
}

export interface FirestoreSlotDoc {
  id: string;
  dateStr: string;
  dayName: string;
  startTime: string;
  endTime: string;
  trainingType: string;
  minParticipants: number;
  maxParticipants: number;
  selectedIds: string[];
  waitlistIds: string[];
  teamAssignments: Record<string, 'A' | 'B'>;
  cancelled: boolean;
  cancelReason: string;
}

export interface FirestoreResponseDoc {
  userId: string;
  displayName: string;
  desiredGames: number | null;
  slotResponses: Record<string, 'DISPONIBLE' | 'INCERTAIN' | 'INDISPONIBLE'>;
}

export interface FirestorePollBundle {
  poll: FirestorePollDoc;
  slots: FirestoreSlotDoc[];
  responses: FirestoreResponseDoc[];
}

interface FirestoreRawDoc {
  name?: string;
  fields?: Record<string, any>;
}

function extractDocId(name?: string): string {
  if (!name) return '';
  const idx = name.lastIndexOf('/');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

export async function fetchFirestorePollBundle(
  serviceAccount: ServiceAccount,
  projectId: string,
  pollId: string
): Promise<FirestorePollBundle> {
  const accessToken = await getFirestoreAccessToken(serviceAccount);
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/polls/${encodeURIComponent(pollId)}`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  let pollRes = await fetch(baseUrl, { headers });
  if (pollRes.status === 404) {
    await new Promise(resolve => setTimeout(resolve, 400));
    pollRes = await fetch(baseUrl, { headers });
  }

  if (pollRes.status === 404) {
    throw new Error(`POLL_NOT_FOUND:${pollId}`);
  }
  if (!pollRes.ok) {
    const errText = await pollRes.text().catch(() => '');
    throw new Error(`Firestore poll read failed (${pollRes.status}): ${errText}`);
  }

  const pollRaw = (await pollRes.json()) as FirestoreRawDoc;
  const pData = fromFirestoreFields(pollRaw.fields);

  const [slotsRes, responsesRes] = await Promise.all([
    fetch(`${baseUrl}/slots?pageSize=100`, { headers }),
    fetch(`${baseUrl}/responses?pageSize=300`, { headers }),
  ]);

  if (!slotsRes.ok) {
    throw new Error(`Firestore slots read failed (${slotsRes.status})`);
  }
  if (!responsesRes.ok) {
    throw new Error(`Firestore responses read failed (${responsesRes.status})`);
  }

  const slotsJson = (await slotsRes.json()) as { documents?: FirestoreRawDoc[] };
  const responsesJson = (await responsesRes.json()) as { documents?: FirestoreRawDoc[] };

  const defaultType = String(pData.training_type || 'ASTT');
  const defaultMin = Number(pData.min_participants) || 4;
  const defaultMax = Number(pData.max_participants) || 8;

  const poll: FirestorePollDoc = {
    id: extractDocId(pollRaw.name) || pollId,
    title: String(pData.title || 'Sondage sans titre'),
    trainingType: defaultType,
    startDate: String(pData.start_date || ''),
    endDate: String(pData.end_date || ''),
    deadline: String(pData.deadline || ''),
    createdBy: String(pData.created_by || ''),
    createdByName: String(pData.created_by_name || ''),
    status: String(pData.status || 'OPEN'),
    targetUserIds: Array.isArray(pData.target_user_ids)
      ? pData.target_user_ids.map(String)
      : [],
  };

  const slots: FirestoreSlotDoc[] = (slotsJson.documents || []).map(doc => {
    const d = fromFirestoreFields(doc.fields);
    return {
      id: extractDocId(doc.name),
      dateStr: String(d.date_str || ''),
      dayName: String(d.day_name || ''),
      startTime: String(d.start_time || ''),
      endTime: String(d.end_time || ''),
      trainingType: String(d.training_type || defaultType),
      minParticipants:
        typeof d.min_participants === 'number' ? d.min_participants : defaultMin,
      maxParticipants:
        typeof d.max_participants === 'number' ? d.max_participants : defaultMax,
      selectedIds: Array.isArray(d.selected_user_ids)
        ? d.selected_user_ids.map(String)
        : [],
      waitlistIds: Array.isArray(d.waitlist_user_ids)
        ? d.waitlist_user_ids.map(String)
        : [],
      teamAssignments:
        d.team_assignments && typeof d.team_assignments === 'object'
          ? (d.team_assignments as Record<string, 'A' | 'B'>)
          : {},
      cancelled: Boolean(d.cancelled),
      cancelReason: typeof d.cancel_reason === 'string' ? d.cancel_reason : '',
    };
  });

  const responses: FirestoreResponseDoc[] = (responsesJson.documents || []).map(doc => {
    const d = fromFirestoreFields(doc.fields);
    const docId = extractDocId(doc.name);
    const rawSlotResp =
      d.slot_responses && typeof d.slot_responses === 'object' ? d.slot_responses : {};
    const slotResponses: Record<string, 'DISPONIBLE' | 'INCERTAIN' | 'INDISPONIBLE'> = {};
    for (const [sid, status] of Object.entries(rawSlotResp)) {
      if (status === 'DISPONIBLE' || status === 'INCERTAIN' || status === 'INDISPONIBLE') {
        slotResponses[sid] = status;
      }
    }
    return {
      userId: String(d.discord_id || docId),
      displayName: String(d.display_name || ''),
      desiredGames:
        typeof d.desired_games === 'number' && Number.isFinite(d.desired_games)
          ? d.desired_games
          : null,
      slotResponses,
    };
  });

  return { poll, slots, responses };
}
