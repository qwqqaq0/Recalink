import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Recalink",
    description: "将 Edge 收藏同步到 Recalink，保存网页正文并快速检索。",
    permissions: ["bookmarks", "storage", "activeTab", "scripting"],
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"]
  }
});
