"use client"

import * as React from "react"
import Link from "next/link"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { Home, FilePlus2, BookOpen, Cpu, Settings } from "lucide-react"

const Header = () => {
  return (
    <header className="bg-background text-foreground border-b">
      <nav className="container mx-auto flex items-center p-4">
        <div className="flex-1 flex justify-start">
            <Link href="/" className="text-lg font-bold">
              无限小说
            </Link>
        </div>

        <div className="flex-none">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <Link href="/" legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <Home className="mr-2 h-4 w-4" /> 首页
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/create" legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <FilePlus2 className="mr-2 h-4 w-4" /> 创建小说
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/manage" legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <BookOpen className="mr-2 h-4 w-4" /> 小说管理
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/ai-config" legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <Cpu className="mr-2 h-4 w-4" /> AI配置
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/settings" legacyBehavior passHref>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    <Settings className="mr-2 h-4 w-4" /> 生成设置
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex-1 flex justify-end">
        </div>
      </nav>
    </header>
  );
};

export default Header; 