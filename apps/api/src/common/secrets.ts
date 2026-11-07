import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const configured = process.env.APP_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('APP_ENCRYPTION_KEY is required to persist provider secrets.');
  }

  const key = /^[\da-f]{64}$/i.test(configured)
    ? Buffer.from(configured, 'hex')
    : /^[A-Za-z0-9+/]{43}=?$/.test(configured)
      ? Buffer.from(configured, 'base64')
      : Buffer.alloc(0);

  if (key.length !== 32) {
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex or 44 base64 characters.');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue, ...rest] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || rest.length) {
    throw new Error('Unsupported encrypted secret format.');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
