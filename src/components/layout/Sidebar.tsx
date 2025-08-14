"use client";

import { Bot, BookOpen, Edit, Settings, Library } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, type ReactNode } from "react";

const NavLink = ({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} passHref>
      <div
        className={`
              flex items-center gap-3 px-3 py-2 rounded-md
              text-sm font-medium transition-colors
              ${
                isActive
                  ? "bg-white/20 text-white"
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              }
          `}
      >
        <Icon
          className={`h-5 w-5 ${isActive ? "text-white" : "text-gray-400"}`}
        />
        <span>{children}</span>
      </div>
    </Link>
  );
};

export default function Sidebar() {
  return (
    <aside
      className="
        w-60 flex-shrink-0 p-4 sticky top-0 h-screen
        bg-white/10 backdrop-blur-xl
        border-r border-white/20
        shadow-2xl flex flex-col
      "
    >
      <div className="flex items-center gap-3 px-2 py-4 mb-4">
        <Bot className="h-8 w-8 text-white" />
        <h1 className="text-xl font-bold text-white">小说AI</h1>
      </div>
      <nav className="flex flex-col gap-1">
        <NavLink href="/" icon={Edit}>
          仪表盘
        </NavLink>
        <NavLink href="/create" icon={BookOpen}>
          创作
        </NavLink>
        <NavLink href="/novels" icon={Library}>
          我的小说
        </NavLink>
        <NavLink href="/settings" icon={Settings}>
          AI 设置
        </NavLink>
      </nav>
    </aside>
  );
}
