import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CheckCircle2, PenSquare, Library, Cpu } from "lucide-react";

export default function Home() {
  return (
    <main className="container mx-auto p-4 flex flex-col items-center text-center">
      <div className="mt-20 max-w-2xl">
        <h1 className="text-4xl font-bold">欢迎来到无限小说生成平台</h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          在这里，您的想象力是唯一的边界。基于多Agent协作，让您的故事永不完结。
        </p>
      </div>

      <div className="mt-8 flex gap-4">
        <Link href="/create">
          <Button size="lg">
            <PenSquare className="mr-2 h-5 w-5" /> 开始创作
          </Button>
        </Link>
        <Link href="/manage">
          <Button size="lg" variant="secondary">
            <Library className="mr-2 h-5 w-5" /> 查看作品
          </Button>
        </Link>
        <Link href="/ai-config">
          <Button size="lg" variant="secondary">
            <Cpu className="mr-2 h-5 w-5" /> 配置AI
          </Button>
        </Link>
      </div>

      <Card className="mt-20 w-full max-w-md">
        <CardHeader>
          <CardTitle>系统状态</CardTitle>
          <CardDescription>查看核心服务运行情况</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-left">
            <li className="flex items-center">
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              AI Agent 状态: <span className="font-semibold ml-1">运行正常</span>
            </li>
            <li className="flex items-center">
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              记忆库连接: <span className="font-semibold ml-1">已连接</span>
          </li>
            <li className="flex items-center">
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
              一致性检查服务: <span className="font-semibold ml-1">已激活</span>
          </li>
          </ul>
        </CardContent>
      </Card>

      </main>
  );
}
