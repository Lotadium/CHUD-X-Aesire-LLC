// AI use: written with AI help from OpenAI GPT-5.6 (Luna), directed by Kyle Tran. See "AI use" in backend/README.md
import { parseArgs } from "node:util";
import { crawlContact } from "../src/scrape/scraper.ts";
import type { ContactName } from "../src/scrape/scan.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    name: { type: "string" },
    suffix: { type: "string" },
    "max-pages": { type: "string" },
    "max-depth": { type: "string" },
  },
});

function requiredString(
  value: string | undefined,
  flag: string,
): string {
  const result = value?.trim();

  if (!result) {
    throw new Error(`Missing required argument: ${flag}`);
  }

  return result;
}

function parseName(value: string, suffix: string | undefined): ContactName {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    throw new Error(
      "--name must contain at least a first name and a last name",
    );
  }

  return {
    firstName: parts[0],
    middleName: parts.length > 2
      ? parts.slice(1, -1).join(" ")
      : undefined,
    lastName: parts.at(-1)!,
    nameSuffix: suffix?.trim() || undefined,
  };
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return parsed;
}

async function main(): Promise<void> {
  const websiteUrl = requiredString(values.url, "--url");
  const name = requiredString(values.name, "--name");
  const target = parseName(name, values.suffix);

  const result = await crawlContact(websiteUrl, target, {
    userAgent:
      "AesireContactRefresh/1.0 (+mailto:team@example.com)",
    maxPages: positiveInteger(values["max-pages"], 1),
    maxDepth: positiveInteger(values["max-depth"], 2),
    minDelayMs: 1_000,
    timeoutMs: 10_000,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.found) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
}
