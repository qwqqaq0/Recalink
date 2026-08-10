// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  cleanCapturedText,
  chooseCapturedContent,
  chooseCapturedText,
  prepareCaptureInputs
} from "./capture.js";

describe("chooseCapturedText", () => {
  it("falls back to visible text when Readability returns a short fragment", () => {
    const selected = chooseCapturedContent(
      "too short",
      "Navigation and complete article edge-explicit-capture-7f3a9 with much more useful content for recall."
    );
    expect(selected.plainText).toContain("edge-explicit-capture-7f3a9");
    expect(selected.extractionMethod).toBe("visible_text");
  });

  it("keeps a substantial Readability article instead of page chrome", () => {
    const article = "article".repeat(150);
    expect(chooseCapturedText(article, `menu${article}footer`)).toBe(article);
    expect(
      chooseCapturedContent(article, `menu${article}footer`).extractionMethod
    ).toBe("readability");
  });
});

describe("prepareCaptureInputs", () => {
  it("excludes content hidden by rendered styles and accessibility state", () => {
    document.head.innerHTML = `<style>
      .secret, .secret-heading { display: none; }
      .invisible { visibility: hidden; }
      .transparent { opacity: 0; }
    </style>`;
    document.body.innerHTML = `
      <article>
        <h1>Visible article heading</h1>
        <p>Useful rendered term capture-visible-4e8d remains searchable.</p>
        <p class="secret">css-secret-text</p>
        <h2 class="secret-heading">css-secret-heading</h2>
        <p hidden>hidden-attribute-text</p>
        <h2 aria-hidden="true">aria-hidden-heading</h2>
        <p class="invisible">visibility-secret-text</p>
        <p class="transparent">opacity-secret-text</p>
      </article>
      <form>
        <h2>form-secret-heading</h2>
        <label>form-secret-label</label>
      </form>`;

    const inputs = prepareCaptureInputs(document);
    const captured = chooseCapturedContent("", inputs.visibleText);

    expect(captured.plainText).toContain("capture-visible-4e8d");
    expect(captured.plainText).not.toMatch(
      /css-secret|hidden-attribute|aria-hidden|visibility-secret|opacity-secret|form-secret/
    );
    expect(inputs.headings).toEqual(["Visible article heading"]);
    expect(inputs.readabilityDocument.body.textContent).not.toMatch(
      /css-secret|hidden-attribute|aria-hidden|visibility-secret|opacity-secret|form-secret/
    );
    expect(document.querySelector(".secret")).not.toBeNull();
    expect(document.querySelector("form")).not.toBeNull();
  });

  it("excludes form content from Readability, fallback text, and headings", () => {
    const source = new DOMParser().parseFromString(
      `<html><body>
        <article>
          <h1>Ordinary article heading</h1>
          <p>Useful article term capture-safe-91c2 remains searchable.</p>
        </article>
        <form>
          <h2>Private form heading</h2>
          <label>Secret account label <input value="hidden-input-value" /></label>
          <textarea>private-textarea-value</textarea>
          <button>Submit private data</button>
        </form>
      </body></html>`,
      "text/html"
    );

    const inputs = prepareCaptureInputs(source);
    const captured = chooseCapturedContent("", inputs.visibleText);

    expect(captured.extractionMethod).toBe("visible_text");
    expect(captured.plainText).toContain("capture-safe-91c2");
    expect(captured.plainText).not.toMatch(
      /Secret account label|hidden-input-value|private-textarea-value|Submit private data/
    );
    expect(inputs.headings).toEqual(["Ordinary article heading"]);
    expect(inputs.readabilityDocument.querySelector("form")).toBeNull();
  });
});

describe("cleanCapturedText", () => {
  it("truncates captured text at exactly 500,000 characters", () => {
    const limit = "a".repeat(500_000);

    const captured = cleanCapturedText(`${limit}must-not-cross-boundary`);

    expect(captured).toHaveLength(500_000);
    expect(captured).toBe(limit);
  });
});
