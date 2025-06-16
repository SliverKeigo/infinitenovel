import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer, dev }) {
    // 启用 WebAssembly 支持
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // 配置 WebAssembly 文件输出
    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";

    return config;
  },
};

export default nextConfig;