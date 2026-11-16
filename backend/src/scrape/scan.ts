import type { DOMNode, DOMTree } from "./dom.ts";

export interface ContactName {
  firstName: string;
  middleName?: string;
  lastName: string;
  nameSuffix?: string;
  /** Email addresses we already have for this person. When given, they are looked for before the name. */
  emails?: string[];
};

export function tokenizeString(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .filter(Boolean);
}

export function tokenizeName(name: ContactName): string[] {
  return [
    name.firstName,
    name.middleName,
    name.lastName,
    name.nameSuffix,
  ]
  .filter((part): part is string => Boolean(part?.trim()))
  .flatMap(tokenizeString);
}

function containsTokens(
  contentTokens: string[],
  searchTokens: string[],
): boolean {
  if (searchTokens.length === 0) return false;
  for (let i = 0; i <= contentTokens.length - searchTokens.length; i++)
    if (searchTokens.every((token, offset) => contentTokens[i + offset] === token)) return true;
  return false;
}

export function nodeContains(
  tree: DOMTree,
  block: DOMNode,
  searchTokens: string[],
): boolean {
  const contentTokens = tokenizeString(tree(block).text());
  return containsTokens(contentTokens, searchTokens);
}