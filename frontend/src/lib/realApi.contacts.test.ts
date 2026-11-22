// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
// Tests for listContactsForOrganization in realApi.ts (CHUD-64) with a stubbed server, so no backend is needed.
import { afterEach, expect, test, vi } from "vitest";
import { listContactsForOrganization } from "./realApi";

function person(id: number, positions: { position_id: number; organization_id: number; title: string; phone: string }[]) {
  return {
    person_id: id,
    first_name: `First${id}`,
    middle_name: null,
    last_name: `Last${id}`,
    is_flagged: false,
    flag_reason: null,
    positions: positions.map((p) => ({ ...p, phone_ext: null, mobile_phone: null })),
    emails: [{ email_id: id, address: `p${id}@example.gov`, is_flagged: false }],
  };
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

afterEach(() => vi.unstubAllGlobals());

test("keeps loading pages until every contact has arrived", async () => {
  const everyone = Array.from({ length: 250 }, (_, i) => person(i + 1, [{ position_id: i + 1, organization_id: 7, title: "Clerk", phone: "(916) 555-0100" }]));
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    urls.push(url);
    const offset = Number(new URL(url).searchParams.get("offset"));
    return jsonResponse({ data: everyone.slice(offset, offset + 200), total: 250, limit: 200, offset });
  }));

  const contacts = await listContactsForOrganization("7");

  expect(contacts).toHaveLength(250);
  expect(urls).toHaveLength(2); // 200 + 50
  expect(urls[0]).toContain("organization_id=7");
  expect(urls[1]).toContain("offset=200");
});

test("shows the title and phone from the position at THIS organization", async () => {
  const both = person(1, [
    { position_id: 10, organization_id: 3, title: "Board Clerk", phone: "(916) 111-1111" },
    { position_id: 11, organization_id: 7, title: "General Manager", phone: "(916) 222-2222" },
  ]);
  vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ data: [both], total: 1, limit: 200, offset: 0 })));

  const [forSeven] = await listContactsForOrganization("7");
  expect(forSeven.organizationId).toBe("7");
  expect(forSeven.title).toBe("General Manager");
  expect(forSeven.phone).toBe("(916) 222-2222");

  const [forThree] = await listContactsForOrganization("3");
  expect(forThree.organizationId).toBe("3");
  expect(forThree.title).toBe("Board Clerk");
});

test("returns an empty list for an organization with no contacts", async () => {
  vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ data: [], total: 0, limit: 200, offset: 0 })));
  expect(await listContactsForOrganization("9")).toEqual([]);
});
