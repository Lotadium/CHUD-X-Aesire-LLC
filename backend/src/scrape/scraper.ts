// AI use: written with AI help from OpenAI GPT-5.6 (Luna), directed by Kyle Tran
import { createRequire } from "node:module";
import {
  getLinks,
  getPageDOM,
} from "./crawl.ts";
import type { DOMElement, DOMTree } from "./dom.ts";
import {
  type ContactName,
  nodeContains,
  tokenizeName
} from "./scan.ts";

export const NOT_FOUND = "Not Found";

export type Contact = {
  name: string;
  title: string;
  email: string;
  phone: string;
  sourceUrl: string;
};

export type CrawlFailure = {
  url: string;
  reason: string;
};

export type ContactCrawlResult = {
  contact: Contact;
  found: boolean;
  pagesVisited: string[];
  failures: CrawlFailure[];
};

export type ContactCrawlerOptions = {
  userAgent: string;
  maxPages?: number;
  maxDepth?: number;
  ignoreQueryParameters?: boolean;
  minDelayMs?: number;
  timeoutMs?: number;
};

type RequiredOptions = Required<ContactCrawlerOptions>;

type RobotsPolicy = {
  isAllowed(
    url: string,
    userAgent?: string,
  ): boolean | undefined;
  getCrawlDelay(userAgent?: string): number | undefined;
};

type RobotsParserFactory = (
  robotsUrl: string,
  robotsText: string,
) => RobotsPolicy;

const require = createRequire(import.meta.url);
const robotsParser = require("robots-parser") as RobotsParserFactory;

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;

const PHONE_PATTERN =
  /(?<!\w)(?:\+?[\d][\d\s().-]{6,}\d)(?!\w)/u;

function clean(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function valueOrNotFound(value: string | undefined | null): string {
  return clean(value) || NOT_FOUND;
}

function formatName(name: ContactName): string {
  return [
    name.firstName,
    name.middleName,
    name.lastName,
    name.nameSuffix,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getRobotsPolicy(
  websiteUrl: string,
  options: RequiredOptions,
): Promise<RobotsPolicy> {
  const website = new URL(websiteUrl);
  const robotsUrl = new URL("/robots.txt", website.origin);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs,
  );

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        "User-Agent": options.userAgent,
        Accept: "text/plain",
      },
      signal: controller.signal,
    });

    if (response.status >= 500) throw new Error(`robots file exists, but returned status ${response.status} on retrieval`);

    const robotsText: string = response.status < 400 ? await response.text() : "";

    return robotsParser(robotsUrl.href, robotsText);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("robots.txt request timed out");
    }

    throw new Error(
      `Could not fetch robots.txt: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLink(
  rawLink: string,
  pageUrl: string,
  origin: string,
  ignoreQueryParameters: boolean,
): string | null {
  let url: URL;

  try {
    url = new URL(rawLink, pageUrl);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.origin !== origin) return null;

  url.hash = "";

  if (ignoreQueryParameters) {
    url.search = "";
  }

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.href;
}

function findText(
  block: DOMElement,
  selectors: string[],
): string {
  for (const selector of selectors) {
    const matching = block.is(selector)
      ? block
      : block.find(selector).first();
    const value = clean(matching.text());
    if (value) return value;
  }

  return NOT_FOUND;
}

function normalizeFieldLabel(value: string): string {
  return clean(value)
    .replace(/:\s*$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isTitleLabel(value: string): boolean {
  return /^(?:job\s+)?(?:title|position|role)$/u.test(
    normalizeFieldLabel(value),
  );
}

function findLabeledSiblingValue(
  page: DOMTree,
  block: DOMElement,
): string {
  let result = NOT_FOUND;

  block.find("*").each((_, element) => {
    if (result !== NOT_FOUND) return;

    const label = page(element) as DOMElement;
    if (!isTitleLabel(label.text())) return;

    let sibling = label.next();

    while (sibling.length > 0) {
      const value = clean(sibling.text());

      if (value && !isTitleLabel(value)) {
        result = value;
        return;
      }

      sibling = sibling.next();
    }
  });

  return result;
}

function hasContactSignal(block: DOMElement): boolean {
  const text = block.text();

  return (
    block.find('a[href^="mailto:"], a[href^="tel:"]').length > 0 ||
    EMAIL_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    block.find(
      '[itemprop="jobTitle"], [class*="title"], [class*="position"], [class*="role"]',
    ).length > 0
  );
}

function isLikelyContactBlock(block: DOMElement): boolean {
  const element = block.get(0);
  if (!element || element.type !== "tag") return false;

  const tagName = element.name.toLowerCase();
  const className = block.attr("class") ?? "";
  const semanticTag = ["article", "li", "tr", "section"].includes(tagName);
  const contactClass = /staff|employee|contact|directory|team|person|member|profile/i
    .test(className);

  return semanticTag || contactClass || hasContactSignal(block);
}

function findContactBlock(
  page: DOMTree,
  target: ContactName,
): DOMElement | null {
  const nameTokens = tokenizeName(target);

  page("script, style, noscript, svg, img, template").remove();

  let result: DOMElement | null = null;

  // This reuses nodeContains() from scan.ts while searching every element
  // for the requested person's name.
  page("*").each((_, element) => {
    if (result) return;

    const nameElement = page(element) as DOMElement;

    if (!nodeContains(page, nameElement, nameTokens)) return;

    const childContainsName = nameElement
      .children()
      .toArray()
      .some((child) => nodeContains(page, page(child), nameTokens));

    if (childContainsName) return;

    // Start at the name and walk upward until the nearest contact container.
    let candidate = nameElement.parent() as DOMElement;

    for (let level = 0; level < 8 && candidate.length > 0; level++) {
      if (
        clean(candidate.text()).length <= 1_500 &&
        isLikelyContactBlock(candidate)
      ) {
        result = candidate;
        return;
      }

      candidate = candidate.parent() as DOMElement;
    }
  });

  return result;
}

function extractEmail(
  page: DOMTree,
  block: DOMElement,
): string {
  const emails = new Set<string>();

  block.find('a[href^="mailto:"]').each((_, element) => {
    const href = page(element).attr("href");
    if (!href) return;

    const email = decodeURIComponent(href)
      .replace(/^mailto:/i, "")
      .split("?")[0]
      .trim()
      .toLowerCase();

    if (EMAIL_PATTERN.test(email)) emails.add(email);
  });

  if (emails.size === 1) return [...emails][0];
  if (emails.size > 1) return NOT_FOUND;

  return valueOrNotFound(
    block.text().match(EMAIL_PATTERN)?.[0]?.toLowerCase(),
  );
}

function extractPhone(
  page: DOMTree,
  block: DOMElement,
): string {
  const phones = new Set<string>();

  block.find('a[href^="tel:"]').each((_, element) => {
    const href = page(element).attr("href");
    if (!href) return;

    phones.add(
      decodeURIComponent(href)
        .replace(/^tel:/i, "")
        .trim(),
    );
  });

  if (phones.size === 1) return [...phones][0];
  if (phones.size > 1) return NOT_FOUND;

  return valueOrNotFound(block.text().match(PHONE_PATTERN)?.[0]);
}

function extractContact(
  page: DOMTree,
  block: DOMElement,
  target: ContactName,
  sourceUrl: string,
): Contact {
  const title = findText(block, [
    '[itemprop="jobTitle" i]',
    '[data-title]',
    '[data-job-title]',
    '[class*="job-title" i]',
    '[class*="job_title" i]',
    '[class*="jobtitle" i]',
    '[class*="position" i]',
    '[class*="role" i]',
    '[class~="title" i]',
  ]);

  return {
    name: formatName(target),
    title: title === NOT_FOUND
      ? findLabeledSiblingValue(page, block)
      : title,
    email: extractEmail(page, block),
    phone: extractPhone(page, block),
    sourceUrl,
  };
}

function mergeField(current: string, incoming: string): string {
  if (current === NOT_FOUND) return incoming;
  if (incoming === NOT_FOUND) return current;
  return current;
}

function mergeContact(current: Contact, incoming: Contact): Contact {
  return {
    name: current.name,
    title: mergeField(current.title, incoming.title),
    email: mergeField(current.email, incoming.email),
    phone: mergeField(current.phone, incoming.phone),
    sourceUrl: current.sourceUrl === NOT_FOUND
      ? incoming.sourceUrl
      : current.sourceUrl,
  };
}

function hasCompleteContactData(contact: Contact): boolean {
  return [contact.title, contact.email, contact.phone]
    .every((value) => value !== NOT_FOUND);
}

export async function crawlContact(
  websiteUrl: string,
  target: ContactName,
  options: ContactCrawlerOptions,
): Promise<ContactCrawlResult> {
  const config: RequiredOptions = {
    maxPages: 5,
    maxDepth: 2,
    ignoreQueryParameters: true,
    minDelayMs: 1_000,
    timeoutMs: 10_000,
    ...options,
  };

  const startUrl = new URL(websiteUrl);
  const failures: CrawlFailure[] = [];
  let contact: Contact = {
    name: formatName(target),
    title: NOT_FOUND,
    email: NOT_FOUND,
    phone: NOT_FOUND,
    sourceUrl: NOT_FOUND,
  };
  let matched = false;
  const pagesVisited: string[] = [];
  let robots;
  try {
    robots = await getRobotsPolicy(startUrl.href, config);
  } catch (err) {
    failures.push({
      url: startUrl.href,
      reason: err instanceof Error && err.message
        ? err.message
        : "Failed on retreiving robots.txt",
    });
  }
  if (robots) {
    const robotsDelay = robots.getCrawlDelay(config.userAgent) ?? 0;
    const delayMs = Math.max(config.minDelayMs, robotsDelay * 1_000);

    const queue: Array<{ url: string; depth: number }> = [
      { url: startUrl.href, depth: 0 },
    ];
    const queued = new Set([startUrl.href]);

    while (
      queue.length > 0 &&
      pagesVisited.length < config.maxPages
    ) {
      const current = queue.shift()!;
      if (current.depth > config.maxDepth) continue;

      if (robots.isAllowed(current.url, config.userAgent) === false) {
        failures.push({
          url: current.url,
          reason: "robots.txt disallows this URL",
        });
        continue;
      }

      await sleep(delayMs);

      try {
        // Reuse the page loader supplied in crawl.ts.
        const page = await getPageDOM(current.url, config.userAgent, config.timeoutMs);

        if (!page) {
          failures.push({
            url: current.url,
            reason: "page could not be loaded",
          });
          continue;
        }

        pagesVisited.push(current.url);

        const block = findContactBlock(page, target);
        if (block) {
          matched = true;
          contact = mergeContact(
            contact,
            extractContact(page, block, target, current.url),
          );
        }

        // Stop once this contact's requested fields have been found. If any
        // field is still missing, continue through allowed same-origin links.
        if (hasCompleteContactData(contact)) break;

        if (current.depth >= config.maxDepth) continue;

        // Reuse getLinks() from crawl.ts, then resolve and restrict its links.
        for (const rawLink of getLinks(page)) {
          const link = normalizeLink(
            rawLink,
            current.url,
            startUrl.origin,
            config.ignoreQueryParameters,
          );

          if (!link || queued.has(link)) continue;
          if (robots.isAllowed(link, config.userAgent) === false) continue;

          queued.add(link);
          queue.push({
            url: link,
            depth: current.depth + 1,
          });
        }
      } catch (error) {
        failures.push({
          url: current.url,
          reason: error instanceof Error
            ? error.message
            : "Unknown crawl failure",
        });
      }
    }
    if (!matched && failures.length === 0) {
      failures.push({
        url: websiteUrl,
        reason: "Requested contact was not found on the crawled pages",
      });
    }
  }

  return {
    contact,
    found: matched,
    pagesVisited,
    failures,
  };
}
