/** Error de datos de dominio (equivalente a DataException del monólito PHP). */
export class DataException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataException";
  }
}

/** Mensajes de error del monólito (lang lines comunes). */
export const MSG = {
  mustBeAdmin: "must_be_admin",
  mustBeTeacher: "must_be_teacher",
  mustBeTranslator: "must_be_translator",
  mustBeLoggedIn: "must_be_logged_in",
  illegalUserId: "illegal_user_id",
} as const;
