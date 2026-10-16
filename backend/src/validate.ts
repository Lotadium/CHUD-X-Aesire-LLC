import { HttpError, type FieldErrors } from "./errors.ts";

export type Rule =
  | { type: "string"; max: number; required?: boolean; format?: "email" | "url" }
  | { type: "int"; required?: boolean }
  | { type: "bool"; required?: boolean };

export type Schema = Record<string, Rule>;
export type Value = string | number | boolean | null;
export type Parsed = Record<string, Value>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Checked = { value: Value } | { error: string };

function checkValue(raw: unknown, rule: Rule): Checked {
  const blank = raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");

  if (blank) {
    return rule.required ? { error: "is required" } : { value: null };
  }

  switch (rule.type) {
    case "int": {
      if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 2147483647) {
        return { error: "must be a positive whole number" };
      }
      return { value: raw };
    }
    case "bool": {
      if (typeof raw !== "boolean") return { error: "must be true or false" };
      return { value: raw };
    }
    case "string": {
      if (typeof raw !== "string") return { error: "must be text" };
      let value = raw.trim();
      if (value.length > rule.max) return { error: `must be at most ${rule.max} characters` };
      if (rule.format === "email") {
        value = value.toLowerCase();
        if (!EMAIL_RE.test(value)) return { error: "must be a valid email address" };
      }
      if (rule.format === "url") {
        try {
          const url = new URL(value);
          if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        } catch {
          return { error: "must be a valid http(s) URL" };
        }
      }
      return { value };
    }
  }
}

/**
 * Validate one object against a schema, adding any problems to `errors`
 * (keyed by `prefix + field`). Unknown keys are ignored.
 * `create` enforces required fields; `update` only checks fields that were sent.
 */
export function collectFields(
  input: unknown,
  schema: Schema,
  mode: "create" | "update",
  errors: FieldErrors,
  prefix = "",
): Parsed {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors[prefix.replace(/\.$/, "") || "body"] = "must be an object";
    return {};
  }
  const source = input as Record<string, unknown>;
  const out: Parsed = {};

  for (const [name, rule] of Object.entries(schema)) {
    const sent = Object.prototype.hasOwnProperty.call(source, name);
    if (!sent) {
      if (mode === "create" && rule.required) errors[prefix + name] = "is required";
      continue;
    }
    const result = checkValue(source[name], rule);
    if ("error" in result) errors[prefix + name] = result.error;
    else out[name] = result.value;
  }
  return out;
}

export function failIfInvalid(errors: FieldErrors): void {
  if (Object.keys(errors).length > 0) throw new HttpError(400, "Validation failed", errors);
}

/** Validate a flat body. Throws a 400 listing every bad field. */
export function parseFields(body: unknown, schema: Schema, mode: "create" | "update"): Parsed {
  const errors: FieldErrors = {};
  const out = collectFields(body, schema, mode, errors);
  failIfInvalid(errors);
  if (mode === "update" && Object.keys(out).length === 0) {
    throw new HttpError(400, "No updatable fields were provided");
  }
  return out;
}

export function parseId(raw: string | undefined, label = "id"): number {
  const n = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1 || n > 2147483647) {
    throw new HttpError(400, `${label} must be a positive whole number`);
  }
  return n;
}

export type Page = { limit: number; offset: number };

export function parsePage(query: (name: string) => string | undefined): Page {
  const limitRaw = query("limit");
  const offsetRaw = query("offset");
  const limit = limitRaw === undefined ? 50 : Number(limitRaw);
  const offset = offsetRaw === undefined ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new HttpError(400, "limit must be a whole number from 1 to 200");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, "offset must be a whole number of 0 or more");
  }
  return { limit, offset };
}
