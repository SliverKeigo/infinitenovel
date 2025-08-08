"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Users, Map, Link as LinkIcon, X } from "lucide-react";
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

// 新增的模态窗口组件
const ItemDetailModal = ({ item, onClose }) => {
  if (!item) return null;

  return (
    //- Backdrop
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      {/* Modal Content */}
      <div
        onClick={(e) => e.stopPropagation()} //- Prevent click from closing modal
        className="relative w-full max-w-2xl rounded-lg bg-slate-800 border border-slate-700 shadow-xl p-6"
      >
        {/* Header */}
        <div className="flex items-center space-x-3 mb-4">
          {item.icon}
          <h3 className="text-xl font-semibold text-white">{item.name}</h3>
          <span className="text-xs font-medium text-slate-400 bg-slate-700 px-2 py-1 rounded-md">
            {item.type}
          </span>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto pr-3 text-slate-300 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
          {item.content}
        </div>
      </div>
    </div>
  );
};

export function WorldAnvilSidebar({
  roles,
  scenes,
  clues,
}: WorldAnvilSidebarProps) {
  const [selectedItem, setSelectedItem] = useState(null);

  const handleItemClick = (item, type, icon) => {
    setSelectedItem({
      name: item.name,
      type,
      icon,
      content: item.content,
    });
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
  };

  // 监听 ESC 键关闭模态窗口
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleCloseModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  return (
    <>
      <div className="space-y-6 sticky top-8">
        <CollapsibleSection
          title="角色"
          icon={<Users className="text-purple-400" />}
          count={roles.length}
        >
          {roles.length > 0 ? (
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
              {roles.map((role) => (
                <p
                  key={role.id}
                  onClick={() =>
                    handleItemClick(
                      role,
                      "角色",
                      <Users className="text-purple-400" />,
                    )
                  }
                  className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  {role.name}
                </p>
              ))}
            </div>
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
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
              {scenes.map((scene) => (
                <p
                  key={scene.id}
                  onClick={() =>
                    handleItemClick(
                      scene,
                      "场景",
                      <Map className="text-green-400" />,
                    )
                  }
                  className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  {scene.name}
                </p>
              ))}
            </div>
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
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
              {clues.map((clue) => (
                <p
                  key={clue.id}
                  onClick={() =>
                    handleItemClick(
                      clue,
                      "线索",
                      <LinkIcon className="text-yellow-400" />,
                    )
                  }
                  className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  {clue.name}
                </p>
              ))}
            </div>
          ) : (
            <p className="pl-2 text-slate-500">暂无线索</p>
          )}
        </CollapsibleSection>
      </div>
      <ItemDetailModal item={selectedItem} onClose={handleCloseModal} />
    </>
  );
}
