export type FieldErrors = Record<string, string>;

/** An error that is safe to show the client: becomes `{ error, fields? }` with `status`. */
export class HttpError extends Error {
  status: number;
  fields?: FieldErrors;

  constructor(status: number, message: string, fields?: FieldErrors) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type PgError = {
  code?: string;
  constraint?: string;
  detail?: string;
  column?: string;
};

const UNIQUE_MESSAGES: Record<string, string> = {
  domain_name_idx: "A domain with that name already exists",
  department_name_idx: "A department with that name already exists",
  email_address_key: "That email address is already in use",
  person_linkedin_url_key: "That LinkedIn URL is already in use",
};

/** Turn a database error into something the client can act on. */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  const pg = err as PgError;
  switch (pg?.code) {
    case "23505": // unique_violation
      return new HttpError(
        409,
        UNIQUE_MESSAGES[pg.constraint ?? ""] ?? "A record with the same value already exists",
      );
    case "23503": {
      // foreign_key_violation
      const missing = pg.detail?.includes("is not present in table");
      if (missing) {
        const field = pg.constraint?.match(/^[a-z]+_(.+)_fkey$/)?.[1];
        const message = "Referenced record does not exist";
        return new HttpError(400, message, field ? { [field]: message } : undefined);
      }
      return new HttpError(409, "Record is still referenced by other records");
    }
    case "23514": // check_violation
      return new HttpError(400, `A value is not allowed${pg.constraint ? ` (${pg.constraint})` : ""}`);
    case "23502": // not_null_violation
      return new HttpError(400, `${pg.column ?? "A required field"} is required`);
    case "22001": // string_data_right_truncation
      return new HttpError(400, "A value is too long");
    case "22P02": // invalid_text_representation
    case "22003": // numeric_value_out_of_range
      return new HttpError(400, "A value has the wrong format");
    default:
      return new HttpError(500, "Internal server error");
  }
}
