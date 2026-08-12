import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getConfig } from "../config.ts";

/** Longitud mínima de contraseña (Ctrl_users::MIN_PW_LENGTH). */
export const MIN_PW_LENGTH = 5;

/** Hash idéntico al PHP: md5(pw_salt + password). Solo para compat legacy. */
export function hashPassword(password: string): string {
  return createHash("md5").update(getConfig().pw_salt + password).digest("hex");
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_PREFIX = "scrypt";

/** Hash moderno autodescriptivo: scrypt$N$r$p$salt$hash (todo en base64). */
export function hashPasswordScrypt(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [SCRYPT_PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export function isScryptHash(stored: string): boolean {
  return stored.startsWith(`${SCRYPT_PREFIX}$`);
}

/** Verifica pw contra un hash almacenado: scrypt si es moderno, md5 si es legacy. */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || stored === "NONE") return false;
  if (isScryptHash(stored)) {
    const [prefix, n, r, p, saltB64, hashB64] = stored.split("$");
    if (prefix !== SCRYPT_PREFIX || !n || !r || !p || !saltB64 || !hashB64) return false;
    try {
      const salt = Buffer.from(saltB64, "base64");
      const expected = Buffer.from(hashB64, "base64");
      const hash = scryptSync(password, salt, expected.length, { N: +n, r: +r, p: +p });
      return timingSafeEqual(hash, expected);
    } catch {
      return false;
    }
  }
  return timingSafeEqual(Buffer.from(hashPassword(password)), Buffer.from(stored));
}

/** Clave de 32 caracteres hexadecimales (reset key / acceptance code, como mt_rand x4). */
export function generateHexKey(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Genera una contraseña de 8 caracteres aleatorios del juego de caracteres del
 * monólito (excluye deliberadamente I, l, 1, O y 0).
 */
const PW_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePw(): string {
  const bytes = randomBytes(8);
  let pw = "";
  for (const b of bytes) pw += PW_CHARS[b % PW_CHARS.length];
  return pw;
}
