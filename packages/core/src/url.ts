const TRACKING_PARAMETERS = new Set(["fbclid", "gclid"]);

export function normalizeUrl(input: string): string {
  const url = new URL(input);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("仅支持 HTTP(S) URL");
  }

  url.hash = "";
  url.username = "";
  url.password = "";

  const retained = [...url.searchParams.entries()]
    .filter(([name]) => {
      const normalizedName = name.toLowerCase();
      return !normalizedName.startsWith("utm_") && !TRACKING_PARAMETERS.has(normalizedName);
    })
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName)
    );

  url.search = "";
  for (const [name, value] of retained) {
    url.searchParams.append(name, value);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

