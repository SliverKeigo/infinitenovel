"use client";

import { useState } from "react";
import { ChevronDown, Users, Map, Link as LinkIcon } from "lucide-react";
import { NovelRole, NovelScene, NovelClue } from "@prisma/client";

// 可重用的可折叠区域组件
function CollapsibleSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left text-lg font-semibold text-white"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span>{title}</span>
          <span className="text-sm font-normal text-slate-400">({count})</span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="mt-3 pl-2 space-y-2 text-sm text-slate-300 border-l-2 border-white/10 ml-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface WorldAnvilSidebarProps {
  roles: NovelRole[];
  scenes: NovelScene[];
  clues: NovelClue[];
}

export function WorldAnvilSidebar({
  roles,
  scenes,
  clues,
}: WorldAnvilSidebarProps) {
  return (
    <div className="space-y-6 sticky top-8">
      <CollapsibleSection
        title="角色"
        icon={<Users className="text-purple-400" />}
        count={roles.length}
      >
        {roles.length > 0 ? (
          roles.map((role) => (
            <p
              key={role.id}
              className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
            >
              {role.name}
            </p>
          ))
        ) : (
          <p className="pl-2 text-slate-500">暂无角色</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="场景"
        icon={<Map className="text-green-400" />}
        count={scenes.length}
      >
        {scenes.length > 0 ? (
          scenes.map((scene) => (
            <p
              key={scene.id}
              className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
            >
              {scene.name}
            </p>
          ))
        ) : (
          <p className="pl-2 text-slate-500">暂无场景</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="线索"
        icon={<LinkIcon className="text-yellow-400" />}
        count={clues.length}
      >
        {clues.length > 0 ? (
          clues.map((clue) => (
            <p
              key={clue.id}
              className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
            >
              {clue.name}
            </p>
          ))
        ) : (
          <p className="pl-2 text-slate-500">暂无线索</p>
        )}
      </CollapsibleSection>
    </div>
  );
}
