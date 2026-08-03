import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export const MAX_CONTENT_CHARACTERS = 500_000;

export interface ReadableContent {
  title: string;
  description: string;
  headings: string[];
  plainText: string;
  language: string;
  extractionMethod: "readability" | "visible-text";
}

export function clampPlainText(
  text: string,
  maxLength = MAX_CONTENT_CHARACTERS
): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

export function extractReadableContent(
  html: string,
  pageUrl: string
): ReadableContent {
  const dom = new JSDOM(html, { url: pageUrl });
  const document = dom.window.document;

  for (const element of document.querySelectorAll(
    "script, style, noscript, form, input, textarea, select, option, button"
  )) {
    element.remove();
  }

  const title = clampPlainText(document.title, 500);
  const description = clampPlainText(
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ?? "",
    2_000
  );
  const language = document.documentElement.lang || "und";
  const headings = [...document.querySelectorAll("h1, h2, h3")]
    .map((heading) => clampPlainText(heading.textContent ?? "", 500))
    .filter(Boolean)
    .slice(0, 100);

  const article = new Readability(document.cloneNode(true) as Document, {
    charThreshold: 100
  }).parse();
  const readableText = clampPlainText(article?.textContent ?? "");
  const fallbackText = clampPlainText(document.body?.textContent ?? "");

  return {
    title: title || clampPlainText(article?.title ?? "", 500),
    description,
    headings,
    plainText: readableText || fallbackText,
    language,
    extractionMethod: readableText ? "readability" : "visible-text"
  };
}
