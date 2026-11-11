// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
// Tests for the data refresh (CHUD-35). The web search and the contact lookup are always fakes, so nothing
// here touches the network. The API tests need a throwaway Postgres (TEST_DATABASE_URL, same rules as
// api.test.ts); they run in their own schema so they can run beside api.test.ts. The matching rules are
// plain functions and are tested without a database.
import "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.ts";
import { defaultRefreshDeps } from "../src/refresh/providers.ts";
import { planContact, phoneDigits, usableEmail, usablePhone, type StoredContact } from "../src/refresh/contacts.ts";
import type { ContactDetails, LookupResult, OrganizationInfo, RefreshDeps } from "../src/refresh/types.ts";
import type { RankResult } from "../src/ranking/rank.ts";

// ---------- matching rules (no database) ----------

const stored = (over: Partial<StoredContact> = {}): StoredContact => ({
  person_id: 1,
  position_id: 10,
  first_name: "Jane",
  middle_name: null,
  last_name: "Doe",
  suffix: null,
  title: "Director",
  phone: "916-555-0100",
  emails: [{ email_id: 5, address: "jane@city.gov" }],
  ...over,
});
const page = (over: Partial<ContactDetails> = {}): ContactDetails => ({ title: null, email: null, phone: null, ...over });

describe("refresh: matching rules", () => {
  it("writes nothing when the website agrees with what is stored", () => {
    const plan = planContact(stored(), page({ title: "Director", phone: "(916) 555-0100", email: "Jane@City.gov" }), 1);
    assert.deepEqual(plan.position, {});
    assert.deepEqual(plan.email, { kind: "same" });
  });

  it("writes only the fields that changed", () => {
    const plan = planContact(stored(), page({ title: "Deputy Director", phone: "916-555-0100" }), null);
    assert.deepEqual(plan.position, { title: "Deputy Director" });
  });

  it("treats the same phone number in another format as unchanged", () => {
    assert.equal(phoneDigits("+1 (916) 555-0100"), phoneDigits("916.555.0100"));
    assert.deepEqual(planContact(stored(), page({ phone: "+1-916-555-0100" }), null).position, {});
  });

  it("never blanks a stored value because the page did not show it", () => {
    assert.deepEqual(planContact(stored(), page(), null).position, {});
    assert.deepEqual(planContact(stored(), page(), null).email, { kind: "none" });
  });

  it("updates the only email in place, adds one when there are none or several", () => {
    assert.deepEqual(planContact(stored(), page({ email: "j.doe@city.gov" }), null).email, {
      kind: "update",
      email_id: 5,
      address: "j.doe@city.gov",
    });
    assert.deepEqual(planContact(stored({ emails: [] }), page({ email: "j.doe@city.gov" }), null).email, {
      kind: "insert",
      address: "j.doe@city.gov",
    });
    const two = stored({ emails: [{ email_id: 5, address: "a@city.gov" }, { email_id: 6, address: "b@city.gov" }] });
    assert.equal(planContact(two, page({ email: "j.doe@city.gov" }), null).email.kind, "insert");
  });

  it("reports an address that belongs to another contact instead of moving it", () => {
    assert.deepEqual(planContact(stored(), page({ email: "boss@city.gov" }), 99).email, { kind: "conflict", address: "boss@city.gov" });
  });

  it("only accepts a phone with exactly 10 digits (charter e.iv)", () => {
    assert.equal(usablePhone("(916) 555-0100"), "(916) 555-0100");
    assert.equal(usablePhone("+1-916-555-0100"), "+1-916-555-0100");
    assert.equal(usablePhone("555-0100"), null);
    assert.equal(usablePhone("Not Found"), null);
    assert.equal(usablePhone("916-555-01000"), null);
    assert.deepEqual(planContact(stored(), page({ phone: "555-0100" }), null).position, {});
  });

  it("ignores values the database would reject", () => {
    assert.equal(usableEmail("not an email"), null);
    assert.equal(usableEmail("  A@B.org "), "a@b.org");
    assert.deepEqual(planContact(stored(), page({ title: "x".repeat(301) }), null).position, {});
  });
});

// ---------- the real contact lookup (CHUD-34) against a local web server, no database ----------

describe("refresh: contact lookup (CHUD-34 crawler)", () => {
  const html = readFileSync(new URL("./contact-page.html", import.meta.url), "utf8");
  const lookup = defaultRefreshDeps({ userAgent: "test-bot", minDelayMs: 0 }).lookupContact;
  let server: ReturnType<typeof createServer>;
  let base: string;

  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/robots.txt") return void res.writeHead(200).end("User-agent: *\nAllow: /");
      if (req.url === "/staff.html") return void res.writeHead(200, { "Content-Type": "text/html" }).end(html);
      if (req.url === "/plain") {
        return void res.writeHead(200, { "Content-Type": "text/html" }).end(
          "<html><body><ul><li>Elizabeth Smith, City Clerk, elizabeth.smith@city.gov</li>" +
          "<li>Robert Jones, Mayor, bob.jones@city.gov</li></ul></body></html>",
        );
      }
      if (req.url === "/cards") {
        return void res.writeHead(200, { "Content-Type": "text/html" }).end(
          '<html><body><div class="staff"><div class="staff-member"><b>Dr. Robert Jones</b> <span class="title">Mayor</span> <a href="mailto:bob.jones@city.gov">email</a></div>' +
          '<div class="staff-member"><b>E. Smith</b> <span class="title">City Clerk</span> <a href="mailto:elizabeth.smith@city.gov">email</a></div></div></body></html>',
        );
      }
      if (req.url === "/empty") return void res.writeHead(200, { "Content-Type": "text/html" }).end("<html><body><p>Nobody here</p></body></html>");
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("turns a found contact into title, email and phone", async () => {
    const result = await lookup(`${base}/staff.html`, { firstName: "Jane", lastName: "Doe" });
    assert.deepEqual(result, {
      found: true,
      details: { title: "Director of Operations", email: "jane.doe@example.org", phone: "+1-555-0100" },
      sourceUrl: `${base}/staff.html`,
      matchedBy: "name",
    });
  });

  it("finds a contact by email when the website writes the name differently", async () => {
    // We know her as "Janet Roe"; the website lists "Jane Doe" with the same address.
    const result = await lookup(`${base}/staff.html`, { firstName: "Janet", lastName: "Roe", emails: ["Jane.Doe@example.org"] });
    assert.equal(result.found, true);
    assert.equal(result.found && result.matchedBy, "email");
    assert.equal(result.found && result.details.title, "Director of Operations");
    assert.equal(result.found && result.details.email, "jane.doe@example.org");
  });

  it("finds the right person by an address written in the page text, even for a nickname", async () => {
    const result = await lookup(`${base}/plain`, { firstName: "Liz", lastName: "Smith", emails: ["elizabeth.smith@city.gov"] });
    assert.equal(result.found, true);
    assert.equal(result.found && result.matchedBy, "email");
    assert.equal(result.found && result.details.email, "elizabeth.smith@city.gov", "not the mayor's address");
  });

  it("picks the matching person's own title when several people are listed together", async () => {
    const result = await lookup(`${base}/cards`, { firstName: "Liz", lastName: "Smith", emails: ["elizabeth.smith@city.gov"] });
    assert.equal(result.found, true);
    assert.equal(result.found && result.details.title, "City Clerk", "not the mayor's title");
    assert.equal(result.found && result.details.email, "elizabeth.smith@city.gov");
  });

  it("falls back to the name when none of the known emails is on the website", async () => {
    const result = await lookup(`${base}/staff.html`, { firstName: "Jane", lastName: "Doe", emails: ["old.address@example.org"] });
    assert.equal(result.found, true);
    assert.equal(result.found && result.matchedBy, "name");
    assert.equal(result.found && result.details.email, "jane.doe@example.org");
  });

  it("does not match a different person by name or email", async () => {
    const result = await lookup(`${base}/staff.html`, { firstName: "Zed", lastName: "Nobody", emails: ["zed@example.org"] });
    assert.equal(result.found, false);
    assert.equal(result.found === false && result.code, "CONTACT_NOT_LISTED");
  });

  it("reports a contact who is not on the pages as CONTACT_NOT_LISTED", async () => {
    const result = await lookup(`${base}/empty`, { firstName: "Jane", lastName: "Doe" });
    assert.equal(result.found, false);
    assert.equal(result.found === false && result.code, "CONTACT_NOT_LISTED");
  });

  it("reports a website that cannot be read as SITE_UNREACHABLE, never throws", async () => {
    const unreachable = await lookup("http://127.0.0.1:1/", { firstName: "Jane", lastName: "Doe" });
    assert.equal(unreachable.found === false && unreachable.code, "SITE_UNREACHABLE");
    const invalid = await lookup("not a url", { firstName: "Jane", lastName: "Doe" });
    assert.equal(invalid.found === false && invalid.code, "SITE_UNREACHABLE");
  });
});

// ---------- the API (needs a database) ----------

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "set TEST_DATABASE_URL to run the refresh API tests";
if (url) {
  const parsed = new URL(url);
  if (parsed.hostname.includes("neon.tech") || !parsed.pathname.toLowerCase().includes("test")) {
    throw new Error("Refusing to run tests: TEST_DATABASE_URL must be a local database with 'test' in its name");
  }
}

describe("refresh: API", { skip }, () => {
  const SCHEMA = "refresh_test";
  const pool = new pg.Pool({ connectionString: url, max: 5, options: `-c search_path=${SCHEMA}` });

  // Fakes. Each test sets what the "web" says.
  let searchAnswers: Record<string, RankResult | Error>;
  let lookups: Record<string, LookupResult | Error>; // key: "Jane Doe"
  let searched: string[];
  let looked: string[];
  let lookedFor: Record<string, string[] | undefined>; // the emails each lookup was given, by name
  let lookupDelayMs = 0; // makes the fake lookup slow, to test the time budget
  const deps: RefreshDeps = {
    searchProvider: "fake",
    async findWebsite(org: OrganizationInfo) {
      searched.push(org.name);
      const answer = searchAnswers[org.name] ?? { confidence: "none" as const };
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async lookupContact(websiteUrl, name) {
      const key = `${name.firstName} ${name.lastName}`;
      looked.push(`${key} @ ${websiteUrl}`);
      lookedFor[key] = name.emails;
      if (lookupDelayMs) await new Promise((resolve) => setTimeout(resolve, lookupDelayMs));
      const answer = lookups[key] ?? { found: false as const, code: "CONTACT_NOT_LISTED" as const, reason: "not on the site" };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  const app = createApp(pool, deps);

  async function call(method: string, path: string, body?: unknown, user = "tester") {
    const res = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json", "X-User": user },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  const found = (details: Partial<ContactDetails>, sourceUrl = "https://city.gov/staff"): LookupResult => ({
    found: true,
    details: { title: null, email: null, phone: null, ...details },
    sourceUrl,
  });
  const count = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n as number;

  let domainId: number;
  let n = 0;
  async function makeOrg(name: string, website: string | null = "https://city.gov") {
    const res = await call("POST", "/api/organizations", { domain_id: domainId, name, ...(website ? { website_url: website } : {}) });
    return res.body.organization_id as number;
  }
  async function makePerson(orgId: number, first: string, last: string, extra: { title?: string; phone?: string; emails?: string[] } = {}) {
    const res = await call("POST", "/api/people", {
      first_name: first,
      last_name: last,
      positions: [{ organization_id: orgId, title: extra.title ?? "Clerk", ...(extra.phone ? { phone: extra.phone } : {}) }],
      emails: (extra.emails ?? []).map((address) => ({ address })),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.person_id as number;
  }
  /** Start a run and process it to the end the way the front end does. */
  async function runAll(selection: unknown, batch = 3) {
    const start = await call("POST", "/api/refresh", selection);
    assert.equal(start.status, 201, JSON.stringify(start.body));
    let summary = start.body;
    for (let i = 0; i < 50 && summary.status !== "COMPLETE"; i++) {
      summary = (await call("POST", `/api/refresh/${summary.run_id}/process`, { batch_size: batch })).body;
    }
    return summary;
  }

  before(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    for (const file of [
      "database_schema.sql",
      "database_add_flag_columns.sql",
      "database_add_website_discovery.sql",
      "database_add_search_usage.sql",
      "database_add_refresh.sql", // refresh_run / refresh_item (CHUD-35)
    ]) {
      await pool.query(readFileSync(new URL(`../../DataBase/${file}`, import.meta.url), "utf8"));
    }
  });
  after(() => pool.end());

  beforeEach(async () => {
    searchAnswers = {};
    lookups = {};
    searched = [];
    looked = [];
    lookedFor = {};
    lookupDelayMs = 0;
    n += 1;
    domainId = (await call("POST", "/api/domains", { name: `Domain ${n}` })).body.domain_id;
  });

  describe("starting a run", () => {
    it("needs exactly one way of choosing records", async () => {
      assert.equal((await call("POST", "/api/refresh", {})).status, 400);
      assert.equal((await call("POST", "/api/refresh", { all: true, domain_id: domainId })).status, 400);
      assert.equal((await call("POST", "/api/refresh", { all: false })).status, 400);
    });

    it("rejects bad ids, empty lists and records that do not exist", async () => {
      assert.equal((await call("POST", "/api/refresh", { organization_ids: [] })).status, 400);
      assert.equal((await call("POST", "/api/refresh", { organization_ids: ["1"] })).status, 400);
      assert.equal((await call("POST", "/api/refresh", { domain_id: 0 })).status, 400);
      const res = await call("POST", "/api/refresh", { organization_ids: [987654] });
      assert.equal(res.status, 400);
      assert.match(res.body.fields.organization_ids, /987654/);
    });

    it("refuses to start with nothing to refresh", async () => {
      const empty = (await call("POST", "/api/domains", { name: `Empty ${n}` })).body.domain_id;
      assert.equal((await call("POST", "/api/refresh", { domain_id: empty })).status, 400);
    });

    it("lists the chosen records with a total and no work done", async () => {
      const a = await makeOrg("Alpha");
      const b = await makeOrg("Beta");
      const res = await call("POST", "/api/refresh", { organization_ids: [b, a, a] });
      assert.equal(res.status, 201);
      assert.equal(res.body.total, 2);
      assert.equal(res.body.processed, 0);
      assert.equal(res.body.status, "RUNNING");
      assert.equal(res.body.requested_by, "tester");
      assert.deepEqual(looked, []);
    });

    it("can choose a whole domain, and never includes flagged records", async () => {
      const a = await makeOrg("Alpha");
      const b = await makeOrg("Beta");
      await pool.query("UPDATE organization SET is_flagged = true, flag_reason = 'closed' WHERE organization_id = $1", [b]);
      const byDomain = await call("POST", "/api/refresh", { domain_id: domainId });
      assert.equal(byDomain.body.total, 1);
      const named = await call("POST", "/api/refresh", { organization_ids: [a, b] });
      assert.equal(named.status, 400); // asking for a flagged record by name is an error, not a silent skip
    });
  });

  describe("updating in place", () => {
    it("updates existing contacts without creating any new rows", async () => {
      const org = await makeOrg("City of Alpha");
      const person = await makePerson(org, "Jane", "Doe", { title: "Clerk", phone: "916-555-0000", emails: ["jane@old.gov"] });
      lookups["Jane Doe"] = found({ title: "City Clerk", phone: "916-555-0101", email: "jane@city.gov" });
      const before = { org: await count("organization"), person: await count("person"), position: await count("position"), email: await count("email") };

      const summary = await runAll({ organization_ids: [org] });

      assert.equal(summary.status, "COMPLETE");
      assert.equal(summary.verified, 1);
      assert.deepEqual(
        { org: await count("organization"), person: await count("person"), position: await count("position"), email: await count("email") },
        before,
        "no rows were added",
      );
      const pos = (await pool.query("SELECT * FROM position WHERE person_id = $1", [person])).rows[0];
      assert.equal(pos.title, "City Clerk");
      assert.equal(pos.phone, "916-555-0101");
      assert.equal(pos.updated_by_type, "REFRESH");
      assert.ok(pos.last_verified_at);
      const email = (await pool.query("SELECT * FROM email WHERE person_id = $1", [person])).rows[0];
      assert.equal(email.address, "jane@city.gov");
      assert.equal(email.email_domain, "city.gov");
      assert.equal(email.updated_by_type, "REFRESH");
    });

    it("versions each change and marks it as made by the refresh", async () => {
      const org = await makeOrg("City of Beta");
      const person = await makePerson(org, "Jane", "Doe", { title: "Clerk" });
      const posId = (await pool.query("SELECT position_id FROM position WHERE person_id = $1", [person])).rows[0].position_id;
      lookups["Jane Doe"] = found({ title: "City Clerk" });
      await runAll({ organization_ids: [org] }, 1);
      const history = (await pool.query(
        "SELECT version, operation, changed_by_type, changed_by, row_data->>'title' AS title FROM record_history WHERE table_name = 'position' AND row_id = $1 ORDER BY version",
        [posId],
      )).rows;
      assert.deepEqual(history.map((h) => [h.operation, h.title]), [["INSERT", "Clerk"], ["UPDATE", "City Clerk"]]);
      assert.equal(history[1].changed_by_type, "REFRESH");
      assert.equal(history[1].changed_by, "tester");
    });

    it("leaves the values alone when the website agrees, and does not rewrite the title or phone", async () => {
      const org = await makeOrg("City of Gamma");
      const person = await makePerson(org, "Jane", "Doe", { title: "Clerk", phone: "916-555-0100", emails: ["jane@gamma.gov"] });
      lookups["Jane Doe"] = found({ title: "Clerk", phone: "(916) 555-0100", email: "JANE@gamma.gov" });
      const emailVersion = (await pool.query("SELECT version FROM email WHERE person_id = $1", [person])).rows[0].version;
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.verified, 1);
      const pos = (await pool.query("SELECT title, phone FROM position WHERE person_id = $1", [person])).rows[0];
      assert.deepEqual(pos, { title: "Clerk", phone: "916-555-0100" });
      assert.equal((await pool.query("SELECT version FROM email WHERE person_id = $1", [person])).rows[0].version, emailVersion, "email row not written");
    });

    it("counts a record as updated only when something was saved", async () => {
      const org = await makeOrg("City of Updated");
      await makePerson(org, "Jane", "Doe", { title: "Clerk", phone: "916-555-0100", emails: ["jane@updated.gov"] });
      lookups["Jane Doe"] = found({ title: "City Clerk", phone: "(916) 555-0100", email: "jane@updated.gov" });
      const first = await runAll({ organization_ids: [org] });
      assert.equal(first.verified, 1);
      assert.equal(first.updated, 1, "the title changed");
      const second = await runAll({ organization_ids: [org] });
      assert.equal(second.verified, 1);
      assert.equal(second.updated, 0, "the website now agrees with the record, so nothing was saved");
    });

    it("saves a phone only when it has 10 digits, and treats a useless listing as no data", async () => {
      const org = await makeOrg("City of Phones");
      const person = await makePerson(org, "Jane", "Doe", { phone: "916-555-0100" });
      lookups["Jane Doe"] = found({ phone: "555-0100" });
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified_records[0].reason_code, "NO_CONTACT_DATA");
      assert.equal((await pool.query("SELECT phone FROM position WHERE person_id = $1", [person])).rows[0].phone, "916-555-0100");
    });

    it("keeps old values when the website does not show a field", async () => {
      const org = await makeOrg("City of Delta");
      const person = await makePerson(org, "Jane", "Doe", { title: "Clerk", phone: "916-555-0100", emails: ["jane@delta.gov"] });
      lookups["Jane Doe"] = found({ title: "City Clerk" });
      await runAll({ organization_ids: [org] });
      const pos = (await pool.query("SELECT title, phone FROM position WHERE person_id = $1", [person])).rows[0];
      assert.deepEqual(pos, { title: "City Clerk", phone: "916-555-0100" });
      assert.equal((await pool.query("SELECT address FROM email WHERE person_id = $1", [person])).rows[0].address, "jane@delta.gov");
    });

    it("adds an email to a contact that had none, as a refresh change", async () => {
      const org = await makeOrg("City of Epsilon");
      const person = await makePerson(org, "Jane", "Doe");
      lookups["Jane Doe"] = found({ email: "jane@epsilon.gov" });
      await runAll({ organization_ids: [org] });
      const rows = (await pool.query("SELECT address, updated_by_type FROM email WHERE person_id = $1", [person])).rows;
      assert.deepEqual(rows, [{ address: "jane@epsilon.gov", updated_by_type: "REFRESH" }]);
    });

    it("does not take an email that belongs to another contact, and says so", async () => {
      const org = await makeOrg("City of Zeta");
      await makePerson(org, "Boss", "Person", { emails: ["boss@zeta.gov"] });
      const jane = await makePerson(org, "Jane", "Doe", { emails: ["jane@zeta.gov"] });
      lookups["Jane Doe"] = found({ title: "Aide", email: "boss@zeta.gov" });
      lookups["Boss Person"] = found({ title: "Mayor" });
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified, 1);
      assert.equal(summary.unverified_records[0].reason_code, "EMAIL_BELONGS_TO_OTHER_CONTACT");
      assert.match(summary.unverified_records[0].reason, /Jane Doe/);
      assert.equal((await pool.query("SELECT address FROM email WHERE person_id = $1", [jane])).rows[0].address, "jane@zeta.gov");
      // the rest of what the page said is still saved
      assert.equal((await pool.query("SELECT title FROM position WHERE person_id = $1", [jane])).rows[0].title, "Aide");
    });

    it("gives the lookup each contact's stored emails, so it can match by email before the name", async () => {
      const org = await makeOrg("City of Emails");
      await makePerson(org, "Liz", "Smith", { emails: ["elizabeth.smith@emails.gov", "liz@emails.gov"] });
      await makePerson(org, "Bob", "Jones");
      const flagged = await makePerson(org, "Amy", "Lee", { emails: ["amy@emails.gov", "amy.old@emails.gov"] });
      await pool.query("UPDATE email SET is_flagged = true, flag_reason = 'bounced' WHERE address = 'amy.old@emails.gov'");
      lookups["Liz Smith"] = found({ title: "City Clerk" });
      lookups["Bob Jones"] = found({ title: "Mayor" });
      lookups["Amy Lee"] = found({ title: "Aide" });
      await runAll({ organization_ids: [org] });
      assert.deepEqual([...(lookedFor["Liz Smith"] ?? [])].sort(), ["elizabeth.smith@emails.gov", "liz@emails.gov"]);
      assert.deepEqual(lookedFor["Bob Jones"], [], "no email on file: the name is all there is");
      assert.deepEqual(lookedFor["Amy Lee"], ["amy@emails.gov"], "a flagged address is not used");
      assert.ok(flagged > 0);
    });

    it("updates the stored contact when the lookup recognized them by email", async () => {
      const org = await makeOrg("City of Nicknames");
      const person = await makePerson(org, "Liz", "Smith", { title: "Clerk", emails: ["elizabeth.smith@nick.gov"] });
      lookups["Liz Smith"] = { found: true, details: { title: "City Clerk", email: "elizabeth.smith@nick.gov", phone: null }, sourceUrl: "https://nick.gov/staff", matchedBy: "email" };
      const before = { person: await count("person"), position: await count("position"), email: await count("email") };
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.verified, 1);
      assert.equal((await pool.query("SELECT title FROM position WHERE person_id = $1", [person])).rows[0].title, "City Clerk");
      assert.deepEqual({ person: await count("person"), position: await count("position"), email: await count("email") }, before, "same rows, no duplicates");
    });

    it("skips contacts that are flagged as no longer valid", async () => {
      const org = await makeOrg("City of Eta");
      const gone = await makePerson(org, "Old", "Timer");
      await makePerson(org, "Jane", "Doe");
      await pool.query("UPDATE person SET is_flagged = true, flag_reason = 'retired' WHERE person_id = $1", [gone]);
      lookups["Jane Doe"] = found({ title: "Chief" });
      await runAll({ organization_ids: [org] });
      assert.deepEqual(looked.map((l) => l.split(" @ ")[0]), ["Jane Doe"]);
    });
  });

  describe("verified and unverified", () => {
    it("is verified when every contact is on the website", async () => {
      const org = await makeOrg("City of Theta");
      await makePerson(org, "Jane", "Doe");
      lookups["Jane Doe"] = found({ title: "Chief" });
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.verified, 1);
      assert.equal(summary.unverified, 0);
      assert.ok((await pool.query("SELECT last_verified_at FROM organization WHERE organization_id = $1", [org])).rows[0].last_verified_at);
    });

    it("is unverified, with a reason per contact, when someone is not listed", async () => {
      const org = await makeOrg("City of Iota");
      await makePerson(org, "Jane", "Doe");
      await makePerson(org, "Sam", "Lee");
      lookups["Jane Doe"] = found({ title: "Chief" });
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified, 1);
      const record = summary.unverified_records[0];
      assert.equal(record.organization_id, org);
      assert.equal(record.name, "City of Iota");
      assert.equal(record.reason_code, "CONTACT_NOT_LISTED");
      assert.match(record.reason, /Sam Lee/);
      assert.ok(!/Jane Doe/.test(record.reason));
      assert.equal((await pool.query("SELECT last_verified_at FROM organization WHERE organization_id = $1", [org])).rows[0].last_verified_at, null);
    });

    it("explains a contact that is listed with no usable data", async () => {
      const org = await makeOrg("City of Kappa");
      await makePerson(org, "Jane", "Doe");
      lookups["Jane Doe"] = found({});
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified_records[0].reason_code, "NO_CONTACT_DATA");
    });
  });

  describe("finding the website", () => {
    it("saves a confident website as an automatic change, then reads the contacts from it", async () => {
      const org = await makeOrg("City of Lambda", null);
      await makePerson(org, "Jane", "Doe");
      searchAnswers["City of Lambda"] = { confidence: "high", url: "https://lambda.gov" };
      lookups["Jane Doe"] = found({ title: "Chief" });
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.verified, 1);
      assert.deepEqual(looked, ["Jane Doe @ https://lambda.gov"]);
      const row = (await pool.query("SELECT website_url, website_status, website_source, updated_by_type FROM organization WHERE organization_id = $1", [org])).rows[0];
      assert.equal(row.website_url, "https://lambda.gov");
      assert.equal(row.website_status, "FOUND");
      assert.equal(row.website_source, "AUTO");
    });

    it("keeps low-confidence candidates for review and does not look up contacts", async () => {
      const org = await makeOrg("City of Mu", null);
      await makePerson(org, "Jane", "Doe");
      searchAnswers["City of Mu"] = { confidence: "low", candidates: [{ url: "https://mu.example", page_title: "Mu", score: 40 }] };
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified_records[0].reason_code, "WEBSITE_NEEDS_REVIEW");
      assert.deepEqual(looked, []);
      assert.equal((await pool.query("SELECT website_status FROM organization WHERE organization_id = $1", [org])).rows[0].website_status, "NEEDS_REVIEW");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM website_candidate WHERE organization_id = $1", [org])).rows[0].n, 1);
    });

    it("reports no website found", async () => {
      const org = await makeOrg("City of Nu", null);
      const summary = await runAll({ organization_ids: [org] });
      assert.equal(summary.unverified_records[0].reason_code, "NO_WEBSITE_FOUND");
      assert.equal((await pool.query("SELECT website_status FROM organization WHERE organization_id = $1", [org])).rows[0].website_status, "NOT_FOUND");
    });

    it("never searches when the record already has a website", async () => {
      const org = await makeOrg("City of Xi");
      await runAll({ organization_ids: [org] });
      assert.deepEqual(searched, []);
    });

    it("counts each search toward the monthly usage", async () => {
      const org = await makeOrg("City of Omicron", null);
      await runAll({ organization_ids: [org] });
      const logged = (await pool.query("SELECT provider, searched_by, organization_id FROM web_search_log WHERE organization_id = $1", [org])).rows;
      assert.deepEqual(logged, [{ provider: "fake", searched_by: "tester", organization_id: org }]);
    });

    it("stops searching once the monthly limit is used up", async () => {
      const org = await makeOrg("City of Pi", null);
      const used = (await pool.query("SELECT count(*)::int AS n FROM web_search_log")).rows[0].n;
      process.env.WEB_SEARCH_MONTHLY_LIMIT = String(used);
      try {
        const summary = await runAll({ organization_ids: [org] });
        assert.equal(summary.unverified_records[0].reason_code, "SEARCH_LIMIT_REACHED");
        assert.deepEqual(searched, []);
      } finally {
        delete process.env.WEB_SEARCH_MONTHLY_LIMIT;
      }
    });
  });

  describe("one failure does not stop the run", () => {
    it("carries on after a failed search, a failed lookup and a missing site", async () => {
      const a = await makeOrg("Search Fails", null);
      const b = await makeOrg("Lookup Throws");
      const c = await makeOrg("Good Record");
      await makePerson(b, "Bad", "Lookup");
      await makePerson(c, "Jane", "Doe");
      searchAnswers["Search Fails"] = new Error("provider down");
      lookups["Bad Lookup"] = new Error("socket hang up");
      lookups["Jane Doe"] = found({ title: "Chief" });

      const summary = await runAll({ organization_ids: [a, b, c] }, 2);

      assert.equal(summary.status, "COMPLETE");
      assert.equal(summary.total, 3);
      assert.equal(summary.verified, 1);
      assert.equal(summary.unverified, 2);
      const reasons = Object.fromEntries(summary.unverified_records.map((r: { name: string; reason_code: string }) => [r.name, r.reason_code]));
      assert.deepEqual(reasons, { "Search Fails": "SEARCH_FAILED", "Lookup Throws": "SITE_UNREACHABLE" });
      assert.ok(summary.finished_at);
    });
  });

  describe("progress", () => {
    it("moves forward one batch at a time and finishes", async () => {
      const ids = [];
      for (const name of ["P1", "P2", "P3", "P4", "P5"]) ids.push(await makeOrg(name));
      const start = await call("POST", "/api/refresh", { organization_ids: ids });
      const id = start.body.run_id;
      const seen = [];
      for (let i = 0; i < 3; i++) {
        const res = await call("POST", `/api/refresh/${id}/process`, { batch_size: 2 });
        seen.push([res.body.processed, res.body.total, res.body.status]);
        if (i === 0) assert.equal(res.body.percent_complete, 40, "2 of 5 records");
      }
      assert.deepEqual(seen, [[2, 5, "RUNNING"], [4, 5, "RUNNING"], [5, 5, "COMPLETE"]]);
      assert.equal((await call("GET", `/api/refresh/${id}`)).body.percent_complete, 100);
      const again = await call("POST", `/api/refresh/${id}/process`);
      assert.equal(again.body.processed, 5, "finished records are not redone");
      assert.deepEqual((await call("GET", `/api/refresh/${id}`)).body.status, "COMPLETE");
    });

    it("processes each record exactly once, even when two requests poll at the same time", async () => {
      const ids = [];
      for (const name of ["Q1", "Q2", "Q3", "Q4"]) {
        const org = await makeOrg(name);
        await makePerson(org, name, "Person");
        lookups[`${name} Person`] = found({ title: "Chief" });
        ids.push(org);
      }
      const start = await call("POST", "/api/refresh", { organization_ids: ids });
      const id = start.body.run_id;
      await Promise.all([1, 2, 3].map(() => call("POST", `/api/refresh/${id}/process`, { batch_size: 4 })));
      assert.equal(looked.length, 4);
      assert.equal(new Set(looked).size, 4);
      assert.equal((await call("GET", `/api/refresh/${id}`)).body.processed, 4);
    });

    it("stops starting new records once its time budget is spent", async () => {
      const a = await makeOrg("T1");
      const b = await makeOrg("T2");
      await makePerson(a, "Tee", "One");
      await makePerson(b, "Tee", "Two");
      lookups["Tee One"] = found({ title: "Chief" });
      lookups["Tee Two"] = found({ title: "Chief" });
      lookupDelayMs = 80; // each record takes longer than the 40 ms budget
      process.env.REFRESH_TIME_BUDGET_MS = "40";
      try {
        const start = await call("POST", "/api/refresh", { organization_ids: [a, b] });
        const first = await call("POST", `/api/refresh/${start.body.run_id}/process`, { batch_size: 10 });
        assert.equal(first.body.processed, 1, "the second record was left for the next request");
        const second = await call("POST", `/api/refresh/${start.body.run_id}/process`, { batch_size: 10 });
        assert.equal(second.body.status, "COMPLETE");
      } finally {
        delete process.env.REFRESH_TIME_BUDGET_MS;
      }
    });

    it("lists past runs, newest first, with their counts", async () => {
      const org = await makeOrg("L1");
      const first = await runAll({ organization_ids: [org] });
      const second = await call("POST", "/api/refresh", { organization_ids: [org] });
      const list = await call("GET", "/api/refresh?limit=2");
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.data.map((r: { run_id: number }) => r.run_id), [second.body.run_id, first.run_id]);
      assert.equal(list.body.data[0].status, "RUNNING");
      assert.equal(list.body.data[1].status, "COMPLETE");
      assert.equal(list.body.data[1].total, 1);
      assert.ok(list.body.total >= 2);
      assert.equal(list.body.limit, 2);
      assert.equal(list.body.data[0].unverified_records, undefined, "the list is short: no per-record details");
      assert.equal((await call("GET", "/api/refresh?limit=0")).status, 400);
    });

    it("rejects a bad batch size and an unknown run", async () => {
      const a = await makeOrg("B1");
      const start = await call("POST", "/api/refresh", { organization_ids: [a] });
      assert.equal((await call("POST", `/api/refresh/${start.body.run_id}/process`, { batch_size: 0 })).status, 400);
      assert.equal((await call("POST", `/api/refresh/${start.body.run_id}/process`, { batch_size: 11 })).status, 400);
      assert.equal((await call("POST", "/api/refresh/987654/process")).status, 404);
      assert.equal((await call("GET", "/api/refresh/987654")).status, 404);
      assert.equal((await call("GET", "/api/refresh/abc")).status, 400);
    });

    it("picks up a record whose request died", async () => {
      const a = await makeOrg("S1");
      const start = await call("POST", "/api/refresh", { organization_ids: [a] });
      await pool.query("UPDATE refresh_item SET status = 'PROCESSING', claimed_at = now() - interval '10 minutes' WHERE run_id = $1", [start.body.run_id]);
      const res = await call("POST", `/api/refresh/${start.body.run_id}/process`);
      assert.equal(res.body.status, "COMPLETE");
    });
  });
});
