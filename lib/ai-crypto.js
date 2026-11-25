import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKeyBuffer() {
  const rawSecret = (process.env.AI_KEY_ENCRYPTION_SECRET || process.env.SETTINGS_ENC_KEY || '').trim();
  if (rawSecret.length < 16) {
    throw Object.assign(
      new Error('AI_KEY_ENCRYPTION_SECRET belum dikonfigurasi di environment server (minimal 16 karakter).'),
      { status: 500 }
    );
  }
  return createHash('sha256').update(rawSecret, 'utf8').digest();
}

/**
 * Mengubah plaintext API key menjadi format tersamarkan untuk ditampilkan di UI.
 */
export function maskApiKey(plainKey) {
  const clean = String(plainKey || '').trim();
  if (clean.length >= 10) return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
  if (clean.length >= 6) return `${clean.slice(0, 2)}...${clean.slice(-2)}`;
  return '****';
}

/**
 * Mengenkripsi API key menggunakan AES-256-GCM sebelum disimpan ke database.
 */
export function encryptApiKey(plainKey, aadContext = null) {
  const clean = String(plainKey || '').trim();
  if (!clean) {
    throw Object.assign(new Error('API Key tidak boleh kosong.'), { status: 400 });
  }
  const key = getEncryptionKeyBuffer();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aadContext) {
    cipher.setAAD(Buffer.from(String(aadContext), 'utf8'));
  }
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted_api_key: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    masked_key: maskApiKey(clean),
  };
}

/**
 * Mendekripsi API key di memori server hanya saat diperlukan memanggil LLM.
 */
export function decryptApiKey({ encrypted_api_key, iv, auth_tag }, aadContext = null) {
  if (!encrypted_api_key || !iv || !auth_tag) {
    throw Object.assign(new Error('Data API Key terenkripsi tidak lengkap.'), { status: 500 });
  }
  try {
    const key = getEncryptionKeyBuffer();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
    if (aadContext) {
      decipher.setAAD(Buffer.from(String(aadContext), 'utf8'));
    }
    decipher.setAuthTag(Buffer.from(auth_tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted_api_key, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw Object.assign(new Error('Gagal mendekripsi API Key. Silakan simpan ulang API Key Anda.'), { status: 500 });
  }
}

/**
 * Menghapus jejak API key dari pesan error eksternal sebelum dicatat atau dikembalikan ke klien.
 */
export function sanitizeAiErrorMessage(message) {
  return String(message || 'Terjadi kesalahan pada layanan AI.')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, 'AIza...[REDACTED]')
    .replace(/sk-(?:proj-|ant-)?[0-9A-Za-z_-]{10,}/g, 'sk-...[REDACTED]');
}
