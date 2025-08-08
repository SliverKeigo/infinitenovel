"use client";

import { useState, useEffect, ReactNode } from "react";
import { ChevronDown, Users, Map, Link as LinkIcon, X } from "lucide-react";
import { NovelRole, NovelScene, NovelClue } from "@prisma/client";

// --- 1. 统一定义类型 ---
type Item = NovelRole | NovelScene | NovelClue;
type ItemType = "角色" | "场景" | "线索";

interface ModalItem {
  name: string;
  type: ItemType;
  content: string;
}

// --- 2. 增强的模态窗口 (ItemDetailModal) ---
const ICONS: Record<ItemType, ReactNode> = {
  角色: <Users className="text-purple-400" />,
  场景: <Map className="text-green-400" />,
  线索: <LinkIcon className="text-yellow-400" />,
};

const ItemDetailModal = ({
  item,
  onClose,
}: {
  item: ModalItem | null;
  onClose: () => void;
}) => {
  if (!item) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl rounded-lg bg-slate-800 border border-slate-700 shadow-xl p-6"
      >
        <div className="flex items-center space-x-3 mb-4">
          {ICONS[item.type]}
          <h3 className="text-xl font-semibold text-white">{item.name}</h3>
          <span className="text-xs font-medium text-slate-400 bg-slate-700 px-2 py-1 rounded-md">
            {item.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
        <div className="max-h-[60vh] overflow-y-auto pr-3 text-slate-300 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
          {item.content}
        </div>
      </div>
    </div>
  );
};

// --- 3. 重构后的可折叠区域 (CollapsibleSection) ---
interface CollapsibleSectionProps {
  title: ItemType;
  items: Item[];
  onItemClick: (item: Item, type: ItemType) => void;
}

function CollapsibleSection({
  title,
  items,
  onItemClick,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white/5 p-4 rounded-lg border border-white/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center text-left text-lg font-semibold text-white"
      >
        <div className="flex items-center gap-3">
          {ICONS[title]}
          <span>{title}</span>
          <span className="text-sm font-normal text-slate-400">
            ({items.length})
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transform transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="mt-3 pl-2 space-y-2 text-sm text-slate-300 border-l-2 border-white/10 ml-4">
          {items.length > 0 ? (
            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-500 scrollbar-track-transparent">
              {items.map((item) => (
                <p
                  key={item.id}
                  onClick={() => onItemClick(item, title)}
                  className="pl-2 py-1 rounded-md hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  {item.name}
                </p>
              ))}
            </div>
          ) : (
            <p className="pl-2 text-slate-500">暂无{title}</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- 4. 简化的侧边栏 (WorldAnvilSidebar) ---
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
  const [selectedItem, setSelectedItem] = useState<ModalItem | null>(null);

  const handleItemClick = (item: Item, type: ItemType) => {
    setSelectedItem({
      name: item.name,
      type,
      content: item.content,
    });
  };

  const handleCloseModal = () => {
    setSelectedItem(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
          items={roles}
          onItemClick={handleItemClick}
        />
        <CollapsibleSection
          title="场景"
          items={scenes}
          onItemClick={handleItemClick}
        />
        <CollapsibleSection
          title="线索"
          items={clues}
          onItemClick={handleItemClick}
        />
      </div>
      <ItemDetailModal item={selectedItem} onClose={handleCloseModal} />
    </>
  );
}
