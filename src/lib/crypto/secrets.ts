import crypto from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = "v1";
const ALGO = "aes-256-gcm";

function decodeSecretsKey(raw?: string | null) {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length !== KEY_BYTES) return null;
    return decoded;
  } catch {
    return null;
  }
}

function loadSecretsKey() {
  return (
    decodeSecretsKey(process.env.ARCA_SECRETS_KEY) ??
    decodeSecretsKey(process.env.AFIP_SECRET_KEY)
  );
}

export function hasValidSecretsKey() {
  return Boolean(loadSecretsKey());
}

export function getSecretsKey() {
  const key = loadSecretsKey();
  if (!key) {
    throw new Error("ARCA_SECRETS_KEY_INVALID");
  }
  return key;
}

export function encryptSecret(value: string, key = getSecretsKey()) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string, key = getSecretsKey()) {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("ARCA_SECRET_FORMAT_INVALID");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
