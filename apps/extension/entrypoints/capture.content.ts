import { Readability } from "@mozilla/readability";
import { browser } from "wxt/browser";
import { chooseCapturedText, cleanCapturedText } from "../lib/capture.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: string })?.type !== "bookmark-recall:capture")
        return undefined;
      const clone = document.cloneNode(true) as Document;
      clone
        .querySelectorAll(
          "script,style,noscript,form,input,textarea,select,button"
        )
        .forEach((node) => node.remove());
      const article = new Readability(clone).parse();
      const fallback = (document.body as HTMLElement | null)?.innerText ?? "";
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .map((node) => cleanCapturedText(node.textContent ?? ""))
        .filter(Boolean)
        .slice(0, 100);
      return Promise.resolve({
        url: location.href,
        title: article?.title || document.title,
        description:
          article?.excerpt ||
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") ||
          "",
        plainText: chooseCapturedText(article?.textContent ?? "", fallback),
        headings,
        language: document.documentElement.lang || "und"
      });
    });
  }
});
