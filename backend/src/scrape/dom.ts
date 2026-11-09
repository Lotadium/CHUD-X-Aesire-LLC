import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

export type DOMNode = cheerio.Cheerio<AnyNode>;
export type DOMElement = cheerio.Cheerio<Element>;
export type DOMTree = cheerio.CheerioAPI;
