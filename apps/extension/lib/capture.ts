const REMOVED_CAPTURE_SELECTORS =
  "script,style,noscript,form,input,textarea,select,button";

export interface CaptureInputs {
  readabilityDocument: Document;
  visibleText: string;
  headings: string[];
}

export function prepareCaptureInputs(source: Document): CaptureInputs {
  const sanitized = source.cloneNode(true) as Document;
  sanitized
    .querySelectorAll(REMOVED_CAPTURE_SELECTORS)
    .forEach((node) => node.remove());
  const body = sanitized.body as HTMLElement | null;
  const visibleText = cleanCapturedText(
    body?.innerText ?? body?.textContent ?? ""
  );
  const headings = Array.from(sanitized.querySelectorAll("h1,h2,h3"))
    .map((node) => cleanCapturedText(node.textContent ?? ""))
    .filter(Boolean)
    .slice(0, 100);

  return {
    readabilityDocument: sanitized.cloneNode(true) as Document,
    visibleText,
    headings
  };
}

export function cleanCapturedText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500_000);
}

export function chooseCapturedContent(
  readabilityText: string,
  visibleText: string
): {
  plainText: string;
  extractionMethod: "readability" | "visible_text";
} {
  const readable = cleanCapturedText(readabilityText);
  const visible = cleanCapturedText(visibleText);
  if (
    !readable ||
    (readable.length < 200 && visible.length >= readable.length + 40)
  ) {
    return { plainText: visible, extractionMethod: "visible_text" };
  }
  return { plainText: readable, extractionMethod: "readability" };
}

export function chooseCapturedText(
  readabilityText: string,
  visibleText: string
): string {
  return chooseCapturedContent(readabilityText, visibleText).plainText;
}
