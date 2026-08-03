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
