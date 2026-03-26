import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// 基于此配置文件所在目录（即 monorepo 根目录）加载 .env
dotenv.config({ path: path.resolve(import.meta.dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
