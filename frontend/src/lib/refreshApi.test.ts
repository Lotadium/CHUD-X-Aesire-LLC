// AI use: written with help from Claude (Anthropic).
// Checks that the Refresh page talks to the CHUD-35 endpoint the way backend/README.md describes.
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const summary = (over: object = {}) => ({
  run_id: 7, status: "RUNNING", total: 40, processed: 12, percent_complete: 30,
  verified: 9, unverified: 3, updated: 5,
  unverified_records: [
    { organization_id: 5, name: "City of Alpha", reason_code: "CONTACT_NOT_LISTED",
      reason: "Sam Lee: Requested contact was not found on the crawled pages", changed: false },
    { organization_id: 6, name: "Beta District", reason_code: "SOMETHING_NEW", reason: "A new reason", changed: false },
  ],
  requested_by: "frontend", created_at: "2026-11-13T17:00:00Z", finished_at: null,
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_REAL_API", "true");
  vi.stubEnv("VITE_API_URL", "http://api.test/api");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

test("starts a run for all records and converts the summary", async () => {
  reply(201, summary({ processed: 0, verified: 0, unverified: 0, updated: 0, unverified_records: [] }));
  const { startRefresh } = await import("./refreshApi");

  const progress = await startRefresh();

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://api.test/api/refresh");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ all: true });
  expect(progress).toMatchObject({ run_id: "7", total: 40, processed: 0, done: false });
});

test("processes the next batch, with short reasons for the pop-up and the full reason kept", async () => {
  reply(200, summary({ status: "COMPLETE", processed: 40 }));
  const { nextRefreshBatch } = await import("./refreshApi");

  const progress = await nextRefreshBatch("7");

  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/refresh/7/process");
  expect(progress.done).toBe(true);
  expect(progress.updated).toBe(5);
  expect(progress.unverified[0]).toEqual({
    organization_id: 5, name: "City of Alpha", reason: "contact not found", reason_code: "CONTACT_NOT_LISTED",
    detail: "Sam Lee: Requested contact was not found on the crawled pages",
  });
  expect(progress.unverified[1].reason).toBe("couldn’t be verified"); // a code we don't know yet
});

test("turns API errors into readable messages", async () => {
  reply(404, { error: "Refresh run not found" });
  const { nextRefreshBatch } = await import("./refreshApi");
  await expect(nextRefreshBatch("99")).rejects.toThrow("Refresh run not found");

  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(nextRefreshBatch("7")).rejects.toThrow("Can't reach the server");
});
