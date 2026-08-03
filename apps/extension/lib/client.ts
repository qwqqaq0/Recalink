import { browser } from "wxt/browser";

export interface ExtensionConfig {
  apiUrl: string;
  token: string;
  folderId?: string;
}
export const defaultConfig: ExtensionConfig = {
  apiUrl: "http://127.0.0.1:3210",
  token: ""
};

export async function getConfig(): Promise<ExtensionConfig> {
  const stored = await browser.storage.local.get([
    "apiUrl",
    "token",
    "folderId"
  ]);
  return {
    apiUrl:
      typeof stored.apiUrl === "string"
        ? stored.apiUrl.replace(/\/$/, "")
        : defaultConfig.apiUrl,
    token: typeof stored.token === "string" ? stored.token : "",
    ...(typeof stored.folderId === "string" && stored.folderId
      ? { folderId: stored.folderId }
      : {})
  };
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  authenticated = true
): Promise<T> {
  const config = await getConfig();
  const response = await fetch(`${config.apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(authenticated && config.token
        ? { authorization: `Bearer ${config.token}` }
        : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `服务请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}
