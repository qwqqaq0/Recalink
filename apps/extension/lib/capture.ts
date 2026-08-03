export function cleanCapturedText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 500_000);
}

export function chooseCapturedText(
  readabilityText: string,
  visibleText: string
) {
  const readable = cleanCapturedText(readabilityText);
  const visible = cleanCapturedText(visibleText);
  if (!readable) return visible;
  if (readable.length < 200 && visible.length >= readable.length + 40)
    return visible;
  return readable;
}
