import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 知識庫檔案上傳走 Server Action，放寬到 10MB
    serverActions: { bodySizeLimit: "10mb" },
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
