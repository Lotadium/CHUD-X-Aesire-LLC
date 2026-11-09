// AI use: written with AI help from OpenAI GPT-5.6 (Luna), directed by Kyle Tran
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { crawlContact } from "../src/scrape/scraper.ts";

test("extracts a contact from a saved HTML page", async () => {
  const html = await readFile(
    new URL("./contact-page.html", import.meta.url),
    "utf8",
  );

  const requestedPaths: string[] = [];
  const server = createServer((request, response) => {
    const requestPath = request.url ?? "/";
    requestedPaths.push(requestPath);

    if (requestPath === "/robots.txt") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("User-agent: *\nAllow: /\n");
      return;
    }

    if (requestPath === "/contact.html") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(html);
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const pageUrl = `http://127.0.0.1:${address.port}/contact.html`;

    const result = await crawlContact(
      pageUrl,
      {
        firstName: "Jane",
        lastName: "Doe",
      },
      {
        userAgent: "AesireContactCrawlerTest/1.0",
        maxPages: 10,
        maxDepth: 5,
        minDelayMs: 0,
        timeoutMs: 2_000,
      },
    );

    assert.equal(result.found, true, JSON.stringify(result, null, 2));
    assert.deepEqual(result.contact, {
      name: "Jane Doe",
      title: "Director of Operations",
      email: "jane.doe@example.org",
      phone: "+1-555-0100",
      sourceUrl: pageUrl,
    });
    assert.deepEqual(result.pagesVisited, [pageUrl]);
    assert.deepEqual(requestedPaths, ["/robots.txt", "/contact.html"]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
