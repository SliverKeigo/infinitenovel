"use client"

import { usePathname } from 'next/navigation'
import { MainNav } from '@/components/layout/main-nav'
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store'
import { useModelLoader } from '@/hooks/use-model-loader'
import { useSettingsInitializer } from '@/hooks/use-settings-initializer'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BrainCircuit, CheckCircle, AlertTriangle, Loader, Database } from 'lucide-react'
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Icons } from "@/components/icons";

const ModelStatusIndicator = () => {
  const status = useAppStatusStore((state) => state.embeddingModelStatus)
  const progress = useAppStatusStore((state) => state.embeddingModelProgress)

  if (status === ModelLoadStatus.IDLE) {
    return null
  }

  const StatusIcon = {
    [ModelLoadStatus.LOADING]: <Loader className="h-5 w-5 animate-spin text-blue-500" />,
    [ModelLoadStatus.LOADED]: <CheckCircle className="h-5 w-5 text-green-500" />,
    [ModelLoadStatus.FAILED]: <AlertTriangle className="h-5 w-5 text-red-500" />,
    [ModelLoadStatus.IDLE]: <BrainCircuit className="h-5 w-5 text-slate-500" />,
  }[status]

  const statusText = {
    [ModelLoadStatus.LOADING]: `正在加载 AI 引擎... (${(progress || 0).toFixed(0)}%)`,
    [ModelLoadStatus.LOADED]: 'AI 引擎已就绪',
    [ModelLoadStatus.FAILED]: 'AI 引擎加载失败',
    [ModelLoadStatus.IDLE]: 'AI 引擎待命中',
  }[status]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            {StatusIcon}
            {status === ModelLoadStatus.LOADING && (
              <Progress value={progress} className="w-24" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{statusText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function Header() {
  const pathname = usePathname()
  useModelLoader()
  useSettingsInitializer()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="flex flex-1 items-center justify-start">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Icons.logo className="h-6 w-6" />
            <span className="hidden font-bold sm:inline-block">
              {siteConfig.name}
            </span>
          </Link>
        </div>

        <div className="flex-none">
          <MainNav />
        </div>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <ModelStatusIndicator />
          <TooltipProvider>
              <Tooltip>
                  <TooltipTrigger asChild>
                      <Link href="/dev/db-viewer">
                          <div className="h-9 w-9 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground">
                            <Database className="h-5 w-5" />
                            <span className="sr-only">数据库浏览器</span>
                          </div>
                      </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>数据库浏览器</p>
                  </TooltipContent>
              </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </header>
  )
} 