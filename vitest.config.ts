import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@recalink/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@recalink/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url)
      ),
      "@recalink/db": fileURLToPath(
        new URL("./packages/db/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  }
});
