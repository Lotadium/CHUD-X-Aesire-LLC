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
    await pool.query(readFileSync(new URL("../../DataBase/database_schema.sql", import.meta.url), "utf8"));
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
      const res = await call("PUT", `/api/organizations/${orgId}`, { website_url: null }, "someone-else");
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
      assert.equal((await call("DELETE", "/api/organizations/99999")).status, 404);
    });

    it("deletes an organization with no contacts", async () => {
      const created = await call("POST", "/api/organizations", { domain_id: domainId, name: "Temp" });
      const id = created.body.organization_id;
      assert.equal((await call("DELETE", `/api/organizations/${id}`)).status, 204);
      assert.equal((await call("GET", `/api/organizations/${id}`)).status, 404);
    });
  });

  describe("people (contacts)", () => {
    let orgId: number;
    let personId: number;
    let positionId: number;
    let emailId: number;

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

    it("adds and removes a second position and email", async () => {
      const email = await call("POST", `/api/people/${personId}/emails`, { address: "second@example.org" });
      assert.equal(email.status, 201);
      assert.equal((await call("DELETE", `/api/emails/${email.body.email_id}`)).status, 204);
      assert.equal((await call("DELETE", `/api/emails/${email.body.email_id}`)).status, 404);

      const position = await call("POST", `/api/people/${personId}/positions`, {
        organization_id: orgId,
        title: "Board Member",
      });
      assert.equal(position.status, 201);
      assert.equal(position.body.organization_name, "Folsom Water District");
      assert.equal((await call("DELETE", `/api/positions/${position.body.position_id}`)).status, 204);
      assert.equal((await call("POST", "/api/people/99999/emails", { address: "a@b.co" })).status, 404);
    });

    it("blocks deleting an organization that still has contacts unless forced", async () => {
      const blocked = await call("DELETE", `/api/organizations/${orgId}`);
      assert.equal(blocked.status, 409);
      assert.match(blocked.body.error, /force=true/);

      assert.equal((await call("DELETE", `/api/organizations/${orgId}?force=true`)).status, 204);
      const person = await call("GET", `/api/people/${personId}`);
      assert.equal(person.status, 200, "the person is kept");
      assert.deepEqual(person.body.positions, []);
    });

    it("deletes a person together with their emails and positions", async () => {
      assert.equal((await call("DELETE", `/api/people/${personId}`, undefined, "deleter")).status, 204);
      assert.equal((await call("GET", `/api/people/${personId}`)).status, 404);
      const leftovers = await pool.query("SELECT count(*)::int AS n FROM email WHERE person_id = $1", [personId]);
      assert.equal(leftovers.rows[0].n, 0);
    });

    it("keeps a history of changes, including who deleted a record", async () => {
      const { rows } = await pool.query(
        `SELECT operation, version, changed_by FROM record_history
         WHERE table_name = 'person' AND row_id = $1 ORDER BY history_id`,
        [personId],
      );
      assert.deepEqual(
        rows.map((r) => r.operation),
        ["INSERT", "UPDATE", "DELETE"],
      );
      assert.equal(rows[2].changed_by, "deleter");
    });
  });
});
