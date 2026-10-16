import type { Context } from "hono";
import { HttpError } from "./errors.ts";

/** Read the JSON body, turning malformed JSON into a clean 400. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what} not found`);
}
