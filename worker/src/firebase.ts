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
