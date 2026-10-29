import "server-only";
import { GameError } from "@/engine/game";
import { ConflictError, NotFoundError } from "./store";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Turns known errors into friendly messages; hides anything unexpected. */
export function errorResponse(e: unknown) {
  if (e instanceof GameError) return json({ error: e.message }, 400);
  if (e instanceof NotFoundError) return json({ error: "That table doesn't exist (or has closed)" }, 404);
  if (e instanceof ConflictError) return json({ error: e.message }, 409);
  console.error(e);
  return json({ error: "Something went wrong, please try again" }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
