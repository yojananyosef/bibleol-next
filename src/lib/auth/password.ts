import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "../config.ts";

/** Longitud mínima de contraseña (Ctrl_users::MIN_PW_LENGTH). */
export const MIN_PW_LENGTH = 5;

/** Hash idéntico al PHP: md5(pw_salt + password). */
export function hashPassword(password: string): string {
  return createHash("md5").update(getConfig().pw_salt + password).digest("hex");
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
