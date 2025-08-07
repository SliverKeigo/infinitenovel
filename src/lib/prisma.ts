import { PrismaClient } from "@prisma/client";

// 在全局对象上声明一个 prisma 变量，用于类型提示
declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // log: ["query"],
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
