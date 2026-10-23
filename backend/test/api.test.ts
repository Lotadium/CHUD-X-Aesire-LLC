// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
// Integration tests: they run the real API against a THROWAWAY Postgres database
// that is loaded with DataBase/database_schema.sql.
//
//   TEST_DATABASE_URL=postgres://localhost:5432/chud_test npm test
//
// The database is wiped on every run, so this refuses to run against Neon or any
// database whose name does not contain "test".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { createApp } from "../src/app.ts";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "set TEST_DATABASE_URL to run the API tests";

if (url) {
  const parsed = new URL(url);
  if (parsed.hostname.includes("neon.tech") || !parsed.pathname.toLowerCase().includes("test")) {
    throw new Error("Refusing to run tests: TEST_DATABASE_URL must be a local database with 'test' in its name");
  }
}

describe("CHUD API", { skip }, () => {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  const app = createApp(pool);

  async function call(method: string, path: string, body?: unknown, user = "tester") {
    const res = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json", "X-User": user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  let domainId: number;

  before(async () => {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    // Build the database the way the team does: the base schema, then each add-on file in order.
    for (const file of [
      "database_schema.sql",
      "database_add_flag_columns.sql", // is_flagged / flag_reason (CHUD-10)
      "database_add_website_discovery.sql", // website_status / website_source / candidates (CHUD-30)
    ]) {
      await pool.query(readFileSync(new URL(`../../DataBase/${file}`, import.meta.url), "utf8"));
    }
    const res = await call("POST", "/api/domains", { name: "Water" });
    domainId = res.body.domain_id;
  });

  after(() => pool.end());

  it("reports healthy when the database is reachable", async () => {
    const res = await call("GET", "/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });

  it("returns JSON errors for unknown routes and bad JSON", async () => {
    assert.deepEqual(await call("GET", "/api/nope"), { status: 404, body: { error: "Not found" } });
    const res = await app.request("/api/domains", { method: "POST", body: "{not json" });
    assert.equal(res.status, 400);
  });

  describe("domains and departments", () => {
    it("rejects a duplicate domain regardless of case", async () => {
      const res = await call("POST", "/api/domains", { name: "  water " });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /already exists/);
    });

    it("validates the name", async () => {
      const res = await call("POST", "/api/domains", { name: "" });
      assert.equal(res.status, 400);
      assert.equal(res.body.fields.name, "is required");
    });

    it("creates and lists departments", async () => {
      assert.equal((await call("POST", "/api/departments", { name: "Operations" })).status, 201);
      const list = await call("GET", "/api/departments");
      assert.deepEqual(list.body.data.map((d: { name: string }) => d.name), ["Operations"]);
    });
  });

  describe("organizations (entities)", () => {
    let orgId: number;

    it("validates input and reports every bad field", async () => {
      const res = await call("POST", "/api/organizations", { name: "", website_url: "not a url" });
      assert.equal(res.status, 400);
      assert.equal(res.body.fields.domain_id, "is required");
      assert.equal(res.body.fields.name, "is required");
      assert.match(res.body.fields.website_url, /valid http/);
    });

    it("rejects a domain that does not exist", async () => {
      const res = await call("POST", "/api/organizations", { domain_id: 99999, name: "Ghost Water District" });
      assert.equal(res.status, 400);
      assert.equal(res.body.fields.domain_id, "Referenced record does not exist");
    });

    it("creates an organization and records who did it", async () => {
      const res = await call("POST", "/api/organizations", {
        domain_id: domainId,
        name: "  Folsom Water District ",
        website_url: "https://folsomwater.example",
      });
      assert.equal(res.status, 201);
      orgId = res.body.organization_id;
      assert.equal(res.body.name, "Folsom Water District");
      assert.equal(res.body.domain_name, "Water");
      assert.equal(res.body.version, 1);
      assert.equal(res.body.updated_by, "tester");
      assert.equal(res.body.updated_by_type, "USER");
    });

    it("updates only the fields sent and bumps the version", async () => {
      const res = await call(
        "PUT",
        `/api/organizations/${orgId}`,
        { website_url: null, confirm_overwrite: true }, // clearing an existing website needs confirmation
        "someone-else",
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.website_url, null);
      assert.equal(res.body.name, "Folsom Water District");
      assert.equal(res.body.version, 2);
      assert.equal(res.body.updated_by, "someone-else");
    });

    it("rejects an empty update and a blank required field", async () => {
      assert.equal((await call("PUT", `/api/organizations/${orgId}`, {})).status, 400);
      assert.equal((await call("PUT", `/api/organizations/${orgId}`, { name: " " })).status, 400);
    });

    it("lists with paging and a domain filter", async () => {
      const other = (await call("POST", "/api/domains", { name: "Parks" })).body.domain_id;
      await call("POST", "/api/organizations", { domain_id: other, name: "City Parks" });
      const all = await call("GET", "/api/organizations");
      assert.equal(all.body.total, 2);
      const water = await call("GET", `/api/organizations?domain_id=${domainId}&limit=1`);
      assert.equal(water.body.total, 1);
      assert.equal(water.body.data[0].name, "Folsom Water District");
      assert.equal((await call("GET", "/api/organizations?limit=0")).status, 400);
    });

    it("returns 400 for a malformed id and 404 for an unknown one", async () => {
      assert.equal((await call("GET", "/api/organizations/abc")).status, 400);
      assert.equal((await call("GET", "/api/organizations/99999")).status, 404);
      assert.equal((await call("PUT", "/api/organizations/99999", { name: "x" })).status, 404);
    });

    it("has no delete endpoint: records are kept", async () => {
      const res = await call("DELETE", `/api/organizations/${orgId}`);
      assert.equal(res.status, 404);
      assert.equal((await call("GET", `/api/organizations/${orgId}`)).status, 200);
    });

    it("flags an organization as no longer valid, keeping the record", async () => {
      const flagged = await call("PUT", `/api/organizations/${orgId}`, {
        is_flagged: true,
        flag_reason: "  District dissolved ",
      });
      assert.equal(flagged.status, 200);
      assert.equal(flagged.body.is_flagged, true);
      assert.equal(flagged.body.flag_reason, "District dissolved");
      assert.equal(flagged.body.name, "Folsom Water District");

      const cleared = await call("PUT", `/api/organizations/${orgId}`, { is_flagged: false, flag_reason: "ignored" });
      assert.equal(cleared.body.is_flagged, false);
      assert.equal(cleared.body.flag_reason, null);
    });

    it("requires a reason when flagging and rejects a reason without a flag", async () => {
      const noReason = await call("PUT", `/api/organizations/${orgId}`, { is_flagged: true });
      assert.equal(noReason.status, 400);
      assert.equal(noReason.body.fields.flag_reason, "is required when flagging a record");

      const lone = await call("PUT", `/api/organizations/${orgId}`, { flag_reason: "why" });
      assert.equal(lone.status, 400);
      assert.match(lone.body.fields.flag_reason, /together with is_flagged/);

      const badFlag = await call("PUT", `/api/organizations/${orgId}`, { is_flagged: "yes" });
      assert.equal(badFlag.status, 400);
      assert.equal(badFlag.body.fields.is_flagged, "must be true or false");
    });
  });

  describe("people (contacts)", () => {
    let orgId: number;
    let personId: number;
    let positionId: number;
    let emailId: number;
    let secondPositionId: number;
    let secondEmailId: number;

    before(async () => {
      orgId = (await call("GET", "/api/organizations?domain_id=" + domainId)).body.data[0].organization_id;
    });

    it("validates nested positions and emails with field paths", async () => {
      const res = await call("POST", "/api/people", {
        first_name: "Ana",
        positions: [{ title: "Manager" }],
        emails: [{ address: "not-an-email" }],
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.fields.last_name, "is required");
      assert.equal(res.body.fields["positions[0].organization_id"], "is required");
      assert.equal(res.body.fields["emails[0].address"], "must be a valid email address");
    });

    it("creates a person with a position and emails in one request", async () => {
      const res = await call("POST", "/api/people", {
        first_name: "Ana",
        last_name: "Lopez",
        linkedin_url: "https://linkedin.com/in/ana-lopez",
        positions: [{ organization_id: orgId, title: "General Manager", phone: "916-555-0100" }],
        emails: [{ address: "  Ana.Lopez@FolsomWater.Example " }],
      });
      assert.equal(res.status, 201);
      personId = res.body.person_id;
      positionId = res.body.positions[0].position_id;
      emailId = res.body.emails[0].email_id;
      assert.equal(res.body.positions[0].organization_name, "Folsom Water District");
      assert.equal(res.body.positions[0].title, "General Manager");
      assert.equal(res.body.emails[0].address, "ana.lopez@folsomwater.example");
      assert.equal(res.body.emails[0].email_domain, "folsomwater.example");
      assert.equal(res.body.emails[0].email_tld, "example");
    });

    it("rolls everything back when one part fails", async () => {
      const before = await pool.query("SELECT count(*)::int AS n FROM person");
      const res = await call("POST", "/api/people", {
        first_name: "Bo",
        last_name: "Chen",
        emails: [{ address: "ana.lopez@folsomwater.example" }],
      });
      assert.equal(res.status, 409);
      assert.match(res.body.error, /email address is already in use/);
      const after = await pool.query("SELECT count(*)::int AS n FROM person");
      assert.equal(after.rows[0].n, before.rows[0].n);
    });

    it("rejects a position at an organization that does not exist", async () => {
      const res = await call("POST", `/api/people/${personId}/positions`, { organization_id: 99999 });
      assert.equal(res.status, 400);
      assert.equal(res.body.fields.organization_id, "Referenced record does not exist");
    });

    it("gets, lists, and filters contacts", async () => {
      const one = await call("GET", `/api/people/${personId}`);
      assert.equal(one.body.first_name, "Ana");
      assert.equal(one.body.positions.length, 1);
      const byOrg = await call("GET", `/api/people?organization_id=${orgId}`);
      assert.equal(byOrg.body.total, 1);
      const none = await call("GET", "/api/people?organization_id=99999");
      assert.equal(none.body.total, 0);
      assert.equal((await call("GET", "/api/people/99999")).status, 404);
    });

    it("shows contacts on the organization detail view", async () => {
      const res = await call("GET", `/api/organizations/${orgId}`);
      assert.equal(res.body.contacts.length, 1);
      assert.equal(res.body.contacts[0].last_name, "Lopez");
      assert.equal(res.body.contacts[0].title, "General Manager");
    });

    it("updates a person, a position and an email", async () => {
      const person = await call("PUT", `/api/people/${personId}`, { middle_name: "M", suffix: null });
      assert.equal(person.body.middle_name, "M");
      assert.equal(person.body.version, 2);

      const dept = (await call("GET", "/api/departments")).body.data[0].department_id;
      const position = await call("PUT", `/api/positions/${positionId}`, {
        title: "Director",
        department_id: dept,
      });
      assert.equal(position.body.title, "Director");
      assert.equal(position.body.department_name, "Operations");

      const email = await call("PUT", `/api/emails/${emailId}`, { address: "ALopez@example.org" });
      assert.equal(email.body.address, "alopez@example.org");
      assert.equal(email.body.email_domain, "example.org");
      assert.equal(email.body.email_tld, "org");
    });

    it("adds a second position and email", async () => {
      const email = await call("POST", `/api/people/${personId}/emails`, { address: "second@example.org" });
      assert.equal(email.status, 201);
      const position = await call("POST", `/api/people/${personId}/positions`, {
        organization_id: orgId,
        title: "Board Member",
      });
      assert.equal(position.status, 201);
      assert.equal(position.body.organization_name, "Folsom Water District");
      assert.equal((await call("POST", "/api/people/99999/emails", { address: "a@b.co" })).status, 404);
      secondPositionId = position.body.position_id;
      secondEmailId = email.body.email_id;
    });

    it("has no delete endpoints: nothing can be removed through the API", async () => {
      for (const path of [
        `/api/people/${personId}`,
        `/api/positions/${secondPositionId}`,
        `/api/emails/${secondEmailId}`,
      ]) {
        assert.equal((await call("DELETE", path)).status, 404, path);
      }
      const person = await call("GET", `/api/people/${personId}`);
      assert.equal(person.status, 200);
      assert.equal(person.body.positions.length, 2);
      assert.equal(person.body.emails.length, 2);
    });

    it("flags a person, a position and an email instead of deleting them", async () => {
      const person = await call("PUT", `/api/people/${personId}`, { is_flagged: true, flag_reason: "Left the agency" });
      assert.equal(person.body.is_flagged, true);
      assert.equal(person.body.flag_reason, "Left the agency");

      const position = await call("PUT", `/api/positions/${secondPositionId}`, {
        is_flagged: true,
        flag_reason: "No longer on the board",
      });
      assert.equal(position.body.is_flagged, true);

      const email = await call("PUT", `/api/emails/${secondEmailId}`, { is_flagged: true, flag_reason: "Bounced" });
      assert.equal(email.body.is_flagged, true);

      const read = await call("GET", `/api/people/${personId}`);
      assert.equal(read.body.is_flagged, true, "the person is still returned, with the flag");
      assert.equal(
        read.body.positions.find((p: { position_id: number }) => p.position_id === secondPositionId).flag_reason,
        "No longer on the board",
      );
    });

    it("keeps organizations that still have contacts", async () => {
      assert.equal((await call("DELETE", `/api/organizations/${orgId}`)).status, 404);
      const res = await call("GET", `/api/organizations/${orgId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.contacts.length, 2);
    });

    it("keeps a history of changes, including who flagged a record", async () => {
      await call("PUT", `/api/people/${personId}`, { is_flagged: false }, "reviewer");
      const { rows } = await pool.query(
        `SELECT operation, version, changed_by, row_data->>'is_flagged' AS flagged
         FROM record_history WHERE table_name = 'person' AND row_id = $1 ORDER BY history_id`,
        [personId],
      );
      assert.deepEqual(
        rows.map((r) => r.operation),
        ["INSERT", "UPDATE", "UPDATE", "UPDATE"],
      );
      assert.deepEqual(rows.map((r) => r.flagged), ["false", "false", "true", "false"]);
      assert.equal(rows[2].changed_by, "tester");
      assert.equal(rows[3].changed_by, "reviewer");
    });
  });

  describe("website (manual)", () => {
    let eduId: number;
    let orgId: number;
    const first = "https://www.example.edu/";
    const second = "https://example.edu/home";

    before(async () => {
      eduId = (await call("POST", "/api/domains", { name: "Education" })).body.domain_id;
      orgId = (await call("POST", "/api/organizations", { domain_id: eduId, name: "Sample School District" })).body
        .organization_id;
    });

    it("starts with no website and the default status", async () => {
      const org = (await call("GET", `/api/organizations/${orgId}`)).body;
      assert.equal(org.website_url, null);
      assert.equal(org.website_status, "NOT_SEARCHED");
      assert.equal(org.website_source, null);
      assert.equal(org.website_updated_at, null);
    });

    it("rejects a missing or malformed URL", async () => {
      for (const body of [{}, { url: "not a url" }, { url: "ftp://example.edu" }, { url: "javascript:alert(1)" }]) {
        const res = await call("PUT", `/api/organizations/${orgId}/website`, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.fields.url, JSON.stringify(body));
      }
    });

    it("sets the website and records that a person set it", async () => {
      const res = await call("PUT", `/api/organizations/${orgId}/website`, { url: first });
      assert.equal(res.status, 200);
      assert.equal(res.body.website_url, first);
      assert.equal(res.body.website_status, "FOUND");
      assert.equal(res.body.website_source, "MANUAL");
      assert.ok(res.body.website_updated_at);
      assert.equal(res.body.updated_by, "tester");
    });

    it("does not replace an existing website unless the caller confirms", async () => {
      const refused = await call("PUT", `/api/organizations/${orgId}/website`, { url: second });
      assert.equal(refused.status, 409);
      assert.match(refused.body.error, /already has a website/);
      assert.match(refused.body.error, /www\.example\.edu/);
      assert.equal((await call("GET", `/api/organizations/${orgId}`)).body.website_url, first);

      const confirmed = await call("PUT", `/api/organizations/${orgId}/website`, {
        url: second,
        confirm_overwrite: true,
      });
      assert.equal(confirmed.status, 200);
      assert.equal(confirmed.body.website_url, second);
    });

    it("keeps the previous URL in the record history", async () => {
      const { rows } = await pool.query(
        `SELECT row_data->>'website_url' AS url FROM record_history
         WHERE table_name = 'organization' AND row_id = $1 ORDER BY history_id`,
        [orgId],
      );
      assert.ok(rows.map((r) => r.url).includes(first), "the first URL is still in the history");
    });

    it("accepts the same URL again without a confirmation and without a new version", async () => {
      const before = (await call("GET", `/api/organizations/${orgId}`)).body;
      const res = await call("PUT", `/api/organizations/${orgId}/website`, { url: second });
      assert.equal(res.status, 200);
      assert.equal(res.body.version, before.version);
    });

    it("drops waiting candidate URLs when a person sets the website", async () => {
      const other = (await call("POST", "/api/organizations", { domain_id: eduId, name: "Other School District" })).body
        .organization_id;
      await pool.query(
        "INSERT INTO website_candidate (organization_id, url, rank) VALUES ($1, 'https://a.example', 1), ($1, 'https://b.example', 2)",
        [other],
      );
      await call("PUT", `/api/organizations/${other}/website`, { url: "https://a.example" });
      const left = await pool.query("SELECT count(*)::int AS n FROM website_candidate WHERE organization_id = $1", [
        other,
      ]);
      assert.equal(left.rows[0].n, 0);
    });

    it("returns 400 for a bad id and 404 for an unknown entity", async () => {
      assert.equal((await call("PUT", "/api/organizations/abc/website", { url: first })).status, 400);
      assert.equal((await call("PUT", "/api/organizations/99999/website", { url: first })).status, 404);
    });

    it("applies the same rules when the website is edited through the general organization edit", async () => {
      const refused = await call("PUT", `/api/organizations/${orgId}`, { website_url: first });
      assert.equal(refused.status, 409);

      const changed = await call("PUT", `/api/organizations/${orgId}`, { website_url: first, confirm_overwrite: true });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.website_url, first);
      assert.equal(changed.body.website_source, "MANUAL");
    });

    it("leaves the website fields alone when an edit does not touch the website", async () => {
      const before = (await call("GET", `/api/organizations/${orgId}`)).body;
      const res = await call("PUT", `/api/organizations/${orgId}`, { name: "Sample School District (renamed)" });
      assert.equal(res.status, 200);
      assert.equal(res.body.name, "Sample School District (renamed)");
      assert.equal(res.body.website_url, before.website_url);
      assert.equal(res.body.website_updated_at, before.website_updated_at);
    });

    it("clearing a website needs confirmation and resets the status", async () => {
      assert.equal((await call("PUT", `/api/organizations/${orgId}`, { website_url: null })).status, 409);
      const cleared = await call("PUT", `/api/organizations/${orgId}`, { website_url: null, confirm_overwrite: true });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.website_url, null);
      assert.equal(cleared.body.website_status, "NOT_SEARCHED");
      assert.equal(cleared.body.website_source, null);
    });
  });

  describe("website candidates and the review list", () => {
    let healthId: number;
    let review: number;
    let found: number;

    before(async () => {
      healthId = (await call("POST", "/api/domains", { name: "Health" })).body.domain_id;
      review = (await call("POST", "/api/organizations", { domain_id: healthId, name: "Valley Health District" })).body
        .organization_id;
      found = (await call("POST", "/api/organizations", { domain_id: healthId, name: "Bay Health Authority" })).body
        .organization_id;
      // Step 4 will fill these in from website discovery; for now put them in directly.
      await pool.query("UPDATE organization SET website_status = 'NEEDS_REVIEW' WHERE organization_id = $1", [review]);
      await pool.query(
        `INSERT INTO website_candidate (organization_id, url, page_title, score, rank)
         VALUES ($1, 'https://second.example', 'Second choice', 41.5, 2),
                ($1, 'https://first.example', 'First choice', 78.25, 1)`,
        [review],
      );
      await call("PUT", `/api/organizations/${found}/website`, { url: "https://bayhealth.example" });
    });

    it("shows the candidates, best first, on the entity", async () => {
      const org = (await call("GET", `/api/organizations/${review}`)).body;
      assert.equal(org.website_status, "NEEDS_REVIEW");
      assert.equal(org.website_url, null);
      assert.deepEqual(
        org.website_candidates.map((c: { url: string; rank: number }) => [c.rank, c.url]),
        [
          [1, "https://first.example"],
          [2, "https://second.example"],
        ],
      );
      assert.equal(org.website_candidates[0].page_title, "First choice");
      assert.equal(org.website_candidates[0].score, 78.25);
    });

    it("gives an empty candidate list when there are none", async () => {
      const org = (await call("GET", `/api/organizations/${found}`)).body;
      assert.deepEqual(org.website_candidates, []);
      assert.equal(org.website_status, "FOUND");
    });

    it("lists only entities that need review, with their candidates and a total", async () => {
      const res = await call("GET", "/api/organizations?website_status=NEEDS_REVIEW");
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 1);
      assert.equal(res.body.data[0].organization_id, review);
      assert.equal(res.body.data[0].website_candidates.length, 2);
    });

    it("combines the status filter with the domain filter", async () => {
      const here = await call("GET", `/api/organizations?domain_id=${healthId}&website_status=FOUND`);
      assert.deepEqual(here.body.data.map((o: { organization_id: number }) => o.organization_id), [found]);
      const none = await call("GET", `/api/organizations?domain_id=${healthId}&website_status=NOT_FOUND`);
      assert.equal(none.body.total, 0);
    });

    it("rejects a status that does not exist", async () => {
      const res = await call("GET", "/api/organizations?website_status=MAYBE");
      assert.equal(res.status, 400);
      assert.match(res.body.error, /NEEDS_REVIEW/);
    });
  });

  describe("website (automatic discovery)", () => {
    let safetyId: number;
    const found = "https://www.fireoffice.example/";
    const create = async (name: string) =>
      (await call("POST", "/api/organizations", { domain_id: safetyId, name })).body.organization_id as number;
    const discover = (id: number, body: unknown, user = "finder") =>
      call("POST", `/api/organizations/${id}/website/discovery`, body, user);
    const candidates = [
      { url: "https://one.example", page_title: "One", score: 80 },
      { url: "https://two.example", page_title: "Two", score: 55.5 },
      { url: "https://three.example" },
    ];

    before(async () => {
      safetyId = (await call("POST", "/api/domains", { name: "Public Safety" })).body.domain_id;
    });

    it("saves a high-confidence URL as an automatic change", async () => {
      const id = await create("Metro Fire District");
      const res = await discover(id, { confidence: "high", url: found });
      assert.equal(res.status, 200);
      assert.equal(res.body.result, "saved");
      const org = res.body.organization;
      assert.equal(org.website_url, found);
      assert.equal(org.website_status, "FOUND");
      assert.equal(org.website_source, "AUTO");
      assert.ok(org.website_updated_at);
      assert.equal(org.updated_by_type, "REFRESH");
      assert.equal(org.updated_by, "finder");
      assert.deepEqual(org.website_candidates, []);
    });

    it("records the change as automatic in the history", async () => {
      const id = await create("Harbor Fire District");
      await discover(id, { confidence: "high", url: found });
      const { rows } = await pool.query(
        `SELECT changed_by_type FROM record_history
         WHERE table_name = 'organization' AND row_id = $1 ORDER BY history_id DESC LIMIT 1`,
        [id],
      );
      assert.equal(rows[0].changed_by_type, "REFRESH");
    });

    it("keeps low-confidence candidates for review without saving a URL", async () => {
      const id = await create("Ridge Police Authority");
      const res = await discover(id, { confidence: "low", candidates });
      assert.equal(res.status, 200);
      assert.equal(res.body.result, "needs_review");
      const org = res.body.organization;
      assert.equal(org.website_url, null);
      assert.equal(org.website_status, "NEEDS_REVIEW");
      assert.deepEqual(
        org.website_candidates.map((c: { rank: number; url: string }) => [c.rank, c.url]),
        [
          [1, "https://one.example"],
          [2, "https://two.example"],
          [3, "https://three.example"],
        ],
      );
      assert.equal(org.website_candidates[1].score, 55.5);
    });

    it("replaces the old candidates when it searches again", async () => {
      const id = await create("Delta Sheriff Office");
      await discover(id, { confidence: "low", candidates });
      const again = await discover(id, { confidence: "low", candidates: [{ url: "https://new.example" }] });
      assert.deepEqual(
        again.body.organization.website_candidates.map((c: { url: string }) => c.url),
        ["https://new.example"],
      );
    });

    it("records no match and clears stale candidates", async () => {
      const id = await create("Lakeside Rescue");
      await discover(id, { confidence: "low", candidates });
      const res = await discover(id, { confidence: "none" });
      assert.equal(res.body.result, "no_match");
      assert.equal(res.body.organization.website_status, "NOT_FOUND");
      assert.deepEqual(res.body.organization.website_candidates, []);
    });

    it("does not touch an entity that already has a website unless confirmed", async () => {
      const id = await create("Summit Emergency Services");
      await call("PUT", `/api/organizations/${id}/website`, { url: "https://summit.example" });

      for (const body of [
        { confidence: "high", url: found },
        { confidence: "low", candidates },
        { confidence: "none" },
      ]) {
        const refused = await discover(id, body);
        assert.equal(refused.status, 409, JSON.stringify(body));
        assert.match(refused.body.error, /summit\.example/);
      }
      const org = (await call("GET", `/api/organizations/${id}`)).body;
      assert.equal(org.website_url, "https://summit.example");
      assert.equal(org.website_status, "FOUND");
      assert.deepEqual(org.website_candidates, []);

      const confirmed = await discover(id, { confidence: "high", url: found, confirm_overwrite: true });
      assert.equal(confirmed.body.result, "saved");
      assert.equal(confirmed.body.organization.website_url, found);
      assert.equal(confirmed.body.organization.website_source, "AUTO");
    });

    it("does nothing when it finds the URL the entity already has", async () => {
      const id = await create("Canyon Fire Protection");
      await call("PUT", `/api/organizations/${id}/website`, { url: found });
      const before = (await call("GET", `/api/organizations/${id}`)).body;
      const res = await discover(id, { confidence: "high", url: found });
      assert.equal(res.status, 200);
      assert.equal(res.body.result, "unchanged");
      assert.equal(res.body.organization.version, before.version);
      assert.equal(res.body.organization.website_source, "MANUAL", "a person's choice stays a person's choice");
    });

    it("lets a person pick a candidate afterwards", async () => {
      const id = await create("Prairie Water Safety");
      await discover(id, { confidence: "low", candidates });
      const picked = await call("PUT", `/api/organizations/${id}/website`, { url: "https://two.example" });
      assert.equal(picked.status, 200);
      assert.equal(picked.body.website_status, "FOUND");
      assert.equal(picked.body.website_source, "MANUAL");
      assert.deepEqual(picked.body.website_candidates, []);
    });

    it("checks what it is sent", async () => {
      const id = await create("Validation Test District");
      const cases: [unknown, string][] = [
        [{}, "confidence"],
        [{ confidence: "maybe" }, "confidence"],
        [{ confidence: "high" }, "url"],
        [{ confidence: "high", url: "ftp://x.example" }, "url"],
        [{ confidence: "low" }, "candidates"],
        [{ confidence: "low", candidates: [] }, "candidates"],
        [{ confidence: "low", candidates: [...candidates, { url: "https://four.example" }] }, "candidates"],
        [{ confidence: "low", candidates: [{ url: "nope" }] }, "candidates[0].url"],
        [{ confidence: "low", candidates: [{ url: "https://a.example", score: "high" }] }, "candidates[0].score"],
        [{ confidence: "low", candidates: [{ url: "https://a.example" }, { url: "https://a.example" }] }, "candidates[1].url"],
      ];
      for (const [body, field] of cases) {
        const res = await discover(id, body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.ok(res.body.fields[field], `${JSON.stringify(body)} should flag ${field}`);
      }
      const org = (await call("GET", `/api/organizations/${id}`)).body;
      assert.equal(org.website_status, "NOT_SEARCHED", "bad requests change nothing");
    });

    it("returns 400 for a bad id and 404 for an unknown entity", async () => {
      assert.equal((await discover(99999, { confidence: "none" })).status, 404);
      const bad = await call("POST", "/api/organizations/abc/website/discovery", { confidence: "none" });
      assert.equal(bad.status, 400);
    });
  });

  describe("review fixes (stuck review queue, existing websites)", () => {
    let domain: number;
    const create = async (name: string) =>
      (await call("POST", "/api/organizations", { domain_id: domain, name })).body.organization_id as number;
    const discover = (id: number, body: unknown) => call("POST", `/api/organizations/${id}/website/discovery`, body);
    const reject = (id: number) => call("POST", `/api/organizations/${id}/website/reject-candidates`);

    before(async () => {
      domain = (await call("POST", "/api/domains", { name: "Transit Review" })).body.domain_id;
    });

    it("keeping the current website settles a pending review and drops the suggestions", async () => {
      const id = await create("Stuck Entity");
      await call("PUT", `/api/organizations/${id}/website`, { url: "https://original.example" });
      const suggested = await discover(id, {
        confidence: "low",
        candidates: [{ url: "https://other.example" }],
        confirm_overwrite: true,
      });
      assert.equal(suggested.body.organization.website_status, "NEEDS_REVIEW");
      assert.equal(suggested.body.organization.website_candidates.length, 1);

      const kept = await call("PUT", `/api/organizations/${id}/website`, { url: "https://original.example" });
      assert.equal(kept.status, 200);
      assert.equal(kept.body.website_url, "https://original.example");
      assert.equal(kept.body.website_status, "FOUND");
      assert.deepEqual(kept.body.website_candidates, []);
      assert.equal(kept.body.website_source, "MANUAL");
    });

    it("rejecting all suggestions on an entity with a website keeps the website", async () => {
      const id = await create("Has Website");
      await call("PUT", `/api/organizations/${id}/website`, { url: "https://keep.example" });
      await discover(id, { confidence: "low", candidates: [{ url: "https://nope.example" }], confirm_overwrite: true });

      const res = await reject(id);
      assert.equal(res.status, 200);
      assert.equal(res.body.website_url, "https://keep.example");
      assert.equal(res.body.website_status, "FOUND");
      assert.deepEqual(res.body.website_candidates, []);
    });

    it("rejecting all suggestions on an entity without a website marks it not found", async () => {
      const id = await create("No Website");
      await discover(id, {
        confidence: "low",
        candidates: [{ url: "https://a.example" }, { url: "https://b.example" }],
      });
      const res = await reject(id);
      assert.equal(res.status, 200);
      assert.equal(res.body.website_url, null);
      assert.equal(res.body.website_status, "NOT_FOUND");
      assert.deepEqual(res.body.website_candidates, []);
      assert.equal(res.body.updated_by_type, "USER", "a person rejected them");
    });

    it("refuses to reject when nothing is waiting, and handles unknown or bad ids", async () => {
      const id = await create("Nothing Waiting");
      const res = await reject(id);
      assert.equal(res.status, 409);
      assert.match(res.body.error, /no website suggestions/);
      assert.equal((await call("GET", `/api/organizations/${id}`)).body.website_status, "NOT_SEARCHED");
      assert.equal((await reject(99999)).status, 404);
      assert.equal((await call("POST", "/api/organizations/abc/website/reject-candidates")).status, 400);
    });

    it("the website SQL labels entities that already had a website, and is safe to run twice", async () => {
      const sql = readFileSync(new URL("../../DataBase/database_add_website_discovery.sql", import.meta.url), "utf8");
      const had = await create("Had A Website Before");
      const review = await create("Already In Review");
      // Rows as they looked before the script ran: a URL, but the default status.
      await pool.query("UPDATE organization SET website_url = 'https://before.example' WHERE organization_id = $1", [had]);
      await pool.query(
        "UPDATE organization SET website_url = 'https://r.example', website_status = 'NEEDS_REVIEW' WHERE organization_id = $1",
        [review],
      );

      await pool.query(sql);
      let rows = (await pool.query("SELECT organization_id, website_status, website_source FROM organization WHERE organization_id = ANY($1)", [[had, review]])).rows;
      const byId = Object.fromEntries(rows.map((r) => [r.organization_id, r]));
      assert.equal(byId[had].website_status, "FOUND");
      assert.equal(byId[had].website_source, "MANUAL");
      assert.equal(byId[review].website_status, "NEEDS_REVIEW", "other statuses are left alone");

      const versionBefore = (await pool.query("SELECT version FROM organization WHERE organization_id = $1", [had])).rows[0].version;
      await pool.query(sql); // second run changes nothing
      const versionAfter = (await pool.query("SELECT version FROM organization WHERE organization_id = $1", [had])).rows[0].version;
      assert.equal(versionAfter, versionBefore);
    });
  });
});
