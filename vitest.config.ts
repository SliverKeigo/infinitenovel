import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node", // 我们主要测试的是后端 Node.js 逻辑
    globals: true,
  },
});
