import { Readability } from "@mozilla/readability";
import { browser } from "wxt/browser";
import { chooseCapturedContent, prepareCaptureInputs } from "../lib/capture.js";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: string })?.type !== "bookmark-recall:capture")
        return undefined;
      const inputs = prepareCaptureInputs(document);
      const article = new Readability(inputs.readabilityDocument).parse();
      const captured = chooseCapturedContent(
        article?.textContent ?? "",
        inputs.visibleText
      );
      return Promise.resolve({
        url: location.href,
        title: article?.title || document.title,
        description:
          article?.excerpt ||
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") ||
          "",
        ...captured,
        headings: inputs.headings,
        language: document.documentElement.lang || "und"
      });
    });
  }
});
