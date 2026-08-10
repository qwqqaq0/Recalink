const REMOVED_CAPTURE_SELECTORS =
  "script,style,noscript,form,input,textarea,select,button";

export interface CaptureInputs {
  readabilityDocument: Document;
  visibleText: string;
  headings: string[];
}

function createCaptureVisibilityChecker(source: Document) {
  const visibility = new WeakMap<Element, boolean>();
  const view = source.defaultView;

  function isVisible(element: Element): boolean {
    const cached = visibility.get(element);
    if (cached !== undefined) return cached;

    const parentVisible = element.parentElement
      ? isVisible(element.parentElement)
      : true;
    const style = view?.getComputedStyle(element);
    const visible =
      parentVisible &&
      !element.matches(REMOVED_CAPTURE_SELECTORS) &&
      !(element instanceof HTMLElement && element.hidden) &&
      element.getAttribute("aria-hidden")?.trim().toLowerCase() !== "true" &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      style?.visibility !== "collapse" &&
      style?.opacity !== "0";
    visibility.set(element, visible);
    return visible;
  }

  return isVisible;
}

function visibleTextWithin(
  source: Document,
  root: Node,
  isVisible: (element: Element) => boolean
): string {
  const walker = source.createTreeWalker(root, 4);
  const parts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.parentElement && isVisible(node.parentElement)) {
      parts.push(node.textContent ?? "");
    }
    node = walker.nextNode();
  }
  return cleanCapturedText(parts.join(" "));
}

export function prepareCaptureInputs(source: Document): CaptureInputs {
  const isVisible = createCaptureVisibilityChecker(source);
  const sanitized = source.cloneNode(true) as Document;
  const sourceElements = Array.from(source.querySelectorAll("*"));
  const sanitizedElements = Array.from(sanitized.querySelectorAll("*"));
  sourceElements.forEach((element, index) => {
    if (!isVisible(element)) sanitizedElements[index]?.remove();
  });
  const visibleText = source.body
    ? visibleTextWithin(source, source.body, isVisible)
    : "";
  const headings = Array.from(source.querySelectorAll("h1,h2,h3"))
    .filter(isVisible)
    .map((heading) => visibleTextWithin(source, heading, isVisible))
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
