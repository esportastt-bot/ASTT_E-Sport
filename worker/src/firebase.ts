// Génération de Firebase Custom Tokens via l'API Web Crypto native de Cloudflare Workers

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

/** Convertit une clé PEM en CryptoKey pour Web Crypto API */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const keyBody = pemKey
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

/** Encode en base64url */
function base64url(data: ArrayBuffer | string): string {
  let str: string;
  if (typeof data === 'string') {
    str = btoa(data);
  } else {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
