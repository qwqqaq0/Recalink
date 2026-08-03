import { Readability } from "@mozilla/readability";
import { browser } from "wxt/browser";

function cleanText(value: string) { return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 500_000); }

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: string })?.type !== "bookmark-recall:capture") return undefined;
      const clone = document.cloneNode(true) as Document;
      clone.querySelectorAll("script,style,noscript,form,input,textarea,select,button").forEach((node) => node.remove());
      const article = new Readability(clone).parse();
      const fallback = (document.body as HTMLElement | null)?.innerText ?? "";
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .map((node) => cleanText(node.textContent ?? "")).filter(Boolean).slice(0, 100);
      return Promise.resolve({
        url: location.href,
        title: article?.title || document.title,
        description: article?.excerpt || document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        plainText: cleanText(article?.textContent || fallback),
        headings,
        language: document.documentElement.lang || "und"
      });
    });
  }
});
