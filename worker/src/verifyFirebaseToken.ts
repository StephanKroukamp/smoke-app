/**
 * Verifies a Firebase ID token using Google's public x509 certs.
 * Returns the claims on success, null on failure.
 *
 * Firebase ID tokens are RS256-signed JWTs. We fetch Google's current signing certs,
 * find the matching kid, import the cert's public key, and verify the signature.
 * The certs endpoint returns JSON mapping kid → PEM cert.
 *
 * Cache the certs in memory for the Worker isolate lifetime (plus the max-age hint)
 * so we don't refetch on every request.
 */

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

type Claims = {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  email?: string;
  name?: string;
};

type CertCache = { fetchedAt: number; maxAge: number; certs: Record<string, string> };
let certCache: CertCache | null = null;

async function getGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && now - certCache.fetchedAt < certCache.maxAge * 1000) {
    return certCache.certs;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Cert fetch failed: ${res.status}`);
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get("Cache-Control") || "";
  const m = cacheControl.match(/max-age=(\d+)/);
  const maxAge = m ? Number(m[1]) : 3600;
  certCache = { fetchedAt: now, maxAge, certs };
  return certs;
}

function base64UrlToArrayBuffer(b64u: string): ArrayBuffer {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64u.length / 4) * 4, "=");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function pemCertToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * Extract the SubjectPublicKeyInfo (SPKI) from an X.509 certificate DER.
 * Minimal ASN.1 walker: Certificate → TBSCertificate → (skip fields) → SPKI.
 * Workers don't ship a full x509 parser; this does just enough.
 */
function extractSpkiFromCert(der: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(der);
  let offset = 0;

  function readLen(pos: number): { length: number; after: number } {
    const first = bytes[pos];
    if (first < 0x80) return { length: first, after: pos + 1 };
    const n = first & 0x7f;
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[pos + 1 + i];
    return { length: len, after: pos + 1 + n };
  }

  // outer Certificate SEQUENCE
  if (bytes[offset++] !== 0x30) throw new Error("bad cert");
  offset = readLen(offset).after;

  // TBSCertificate SEQUENCE
  if (bytes[offset++] !== 0x30) throw new Error("bad tbs");
  const tbsLen = readLen(offset);
  offset = tbsLen.after;
  const tbsEnd = offset + tbsLen.length;

  // Optional [0] version
  if (bytes[offset] === 0xa0) {
    offset += 1;
    const { length, after } = readLen(offset);
    offset = after + length;
  }
  // serialNumber INTEGER, signature AlgId SEQ, issuer SEQ, validity SEQ, subject SEQ
  for (let i = 0; i < 5; i++) {
    const tag = bytes[offset++];
    if (tag === undefined) throw new Error("truncated tbs");
    const { length, after } = readLen(offset);
    offset = after + length;
  }
  // Now at SubjectPublicKeyInfo SEQUENCE
  if (offset >= tbsEnd) throw new Error("no spki");
  const spkiStart = offset;
  if (bytes[offset++] !== 0x30) throw new Error("bad spki");
  const { length: spkiLen, after: spkiAfter } = readLen(offset);
  const spkiEnd = spkiAfter + spkiLen;
  return bytes.slice(spkiStart, spkiEnd).buffer;
}

async function importRsaPublicKeyFromCert(pem: string): Promise<CryptoKey> {
  const der = pemCertToDer(pem);
  const spki = extractSpkiFromCert(der);
  return crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
}

export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<Claims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(base64UrlToArrayBuffer(headerB64))) as {
    alg: string;
    kid: string;
  };
  if (header.alg !== "RS256" || !header.kid) return null;

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) return null;

  const key = await importRsaPublicKeyFromCert(cert);
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = base64UrlToArrayBuffer(sigB64);

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed);
  if (!valid) return null;

  const claims = JSON.parse(new TextDecoder().decode(base64UrlToArrayBuffer(payloadB64))) as Claims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return null;
  if (claims.iat > now + 60) return null;
  if (claims.aud !== projectId) return null;
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;

  return claims;
}
