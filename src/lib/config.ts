import { createHash } from "node:crypto";

/** Hash de contraseña idéntico al legacy PHP: md5(pw_salt + password). */
export function hashPassword(pwSalt: string, password: string): string {
  return createHash("md5").update(pwSalt + password).digest("hex");
}

export interface AppConfig {
  pw_salt: string;
  users_per_page: number;
  exams_per_page: number;
  lines_per_page: number;
  mql_driver: "native" | "extern";
  mail_sender_address: string;
  mail_sender_name: string;
  google_login_enabled: boolean;
  google_client_id: string;
  google_client_secret: string;
  facebook_login_enabled: boolean;
  facebook_client_id: string;
  facebook_client_secret: string;
  variants: string[];
}

let cached: AppConfig | null = null;

/** Configuración del monólito (equivalente a ol.php-dist + env). */
export function getConfig(): AppConfig {
  if (cached) return cached;
  const cfg: AppConfig = {
    pw_salt: process.env.BIBLEOL_PW_SALT ?? "xxxxxxx",
    users_per_page: 30,
    exams_per_page: 30,
    lines_per_page: 20,
    mql_driver: "native",
    mail_sender_address: process.env.BIBLEOL_MAIL_FROM ?? "noreply@bibleol.test",
    mail_sender_name: "Bible Online Learner",
    google_login_enabled: false,
    google_client_id: process.env.BIBLEOL_GOOGLE_CLIENT_ID ?? "",
    google_client_secret: process.env.BIBLEOL_GOOGLE_CLIENT_SECRET ?? "",
    facebook_login_enabled: false,
    facebook_client_id: process.env.BIBLEOL_FACEBOOK_CLIENT_ID ?? "",
    facebook_client_secret: process.env.BIBLEOL_FACEBOOK_CLIENT_SECRET ?? "",
    variants: [],
  };
  cached = cfg;
  return cfg;
}
