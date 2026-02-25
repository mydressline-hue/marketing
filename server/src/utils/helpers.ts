import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// ID Generation
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random UUID v4 string.
 */
export function generateId(): string {
  return uuidv4();
}

// ---------------------------------------------------------------------------
// Password Hashing
// ---------------------------------------------------------------------------

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt with a secure salt round count.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 * Returns `true` if they match, `false` otherwise.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// AES-256-GCM Encryption / Decryption
// ---------------------------------------------------------------------------

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * The key must be a 32-byte (256-bit) hex-encoded string or a raw 32-byte
 * string. The output format is:  `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encrypt(text: string, key: string): string {
  const keyBuffer = normalizeKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(AES_ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with {@link encrypt}.
 *
 * Expects the format `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function decrypt(encrypted: string, key: string): string {
  const keyBuffer = normalizeKey(key);

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted string format. Expected <iv>:<authTag>:<ciphertext>.',
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Normalises the encryption key to a 32-byte Buffer.
 * Accepts either a 64-character hex string or a raw 32-byte string.
 */
function normalizeKey(key: string): Buffer {
  // If it looks like a hex-encoded 32-byte key (64 hex chars)
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }

  // If it's exactly 32 bytes raw
  if (Buffer.byteLength(key, 'utf8') === 32) {
    return Buffer.from(key, 'utf8');
  }

  // Derive a 32-byte key from arbitrary input using SHA-256
  return crypto.createHash('sha256').update(key).digest();
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Paginates an in-memory array of items.
 *
 * @param items  - The full array to paginate.
 * @param page   - The 1-based page number.
 * @param limit  - The maximum number of items per page.
 */
export function paginate<T>(
  items: T[],
  page: number,
  limit: number,
): PaginationResult<T> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));

  const total = items.length;
  const totalPages = Math.ceil(total / safeLimit);
  const offset = (safePage - 1) * safeLimit;
  const data = items.slice(offset, offset + safeLimit);

  return {
    data,
    total,
    page: safePage,
    totalPages,
  };
}

// ---------------------------------------------------------------------------
// Async Utilities
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves after the given number of milliseconds.
 * Useful for retry delays and rate-limit back-off.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential back-off.
 *
 * @param fn         - The async function to execute.
 * @param maxRetries - Maximum number of retry attempts (excluding the initial call).
 * @param baseDelay  - The base delay in milliseconds (doubled on each retry).
 *
 * @throws The last error encountered after all retries are exhausted.
 *
 * @example
 * const result = await retryWithBackoff(() => callExternalAPI(), 3, 1000);
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * baseDelay;
      await sleep(delay);
    }
  }

  throw lastError;
}
