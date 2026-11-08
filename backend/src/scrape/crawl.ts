import * as cheerio from "cheerio";
import type { DOMTree, DOMElement } from "./dom.ts";
import { type ContactName, nodeContains, tokenizeName } from "./scan.ts";

export type CrawledElements = Generator<DOMElement>;

function* crawl(tree: DOMTree, element: DOMElement, nameTokens: string[], maxDepth: number): CrawledElements | null {
  if (!maxDepth) return null;
  else if (nodeContains(tree, element, nameTokens)) return element;
  const children: DOMElement = element.children();
  const newDepth: number = maxDepth - 1;
  let found = false;
  if (!!children.length && newDepth > 0) {
    for (const child of children) {
      const el = crawl(tree, tree(child), nameTokens, newDepth);
      if (el) {
        found ||= true;
        yield* el as CrawledElements;
      }
    }
  }
  if (!found) return null;
}

/**
 * Crawl DOM and return elements containing a name match
 *
 * This mutates the DOM tree
 */
export function* crawlPage(page: DOMTree, name: ContactName, crawlDepth: number): CrawledElements {
  page("script, style, noscript, svg, img").remove();
  const contactTokens = tokenizeName(name);
  const origin = page("body");
  const crawled = crawl(page, origin, contactTokens, crawlDepth);
  if (crawled)
    yield* crawled as CrawledElements;
}

export async function getPageDOM(url: string, userAgent: string): Promise<DOMTree | null> {
  const response = await fetch(url, {headers:{"User-Agent": userAgent}});
  if (!response.ok) return null;
  const html = await response.text();
  const dom = cheerio.load(html);
  return dom;
}

export function getLinks(page: DOMTree): string[] {
  const links: string[] = [];
  page("a").each((_, element) => {
    const href = page(element).attr("href");
    if (href) links.push(href);
  });
  return links;
}
