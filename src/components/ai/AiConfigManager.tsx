"use client";

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useAIConfigStore } from '@/store/ai-config';
import { AIConfig } from '@/types/ai-config';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoreHorizontal } from 'lucide-react';

export function AiConfigManager() {
  const configs = useLiveQuery(() => db.aiConfigs.toArray(), []);
  const { activeConfigId, setActiveConfigId, addConfig, updateConfig, deleteConfig } = useAIConfigStore();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<Partial<AIConfig> | null>(null);
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);


  const handleSave = async () => {
    if (currentConfig) {
      if (currentConfig.id) {
        await updateConfig(currentConfig.id, currentConfig);
      } else {
        await addConfig(currentConfig as Omit<AIConfig, 'id'>);
      }
    }
    closeDialog();
  };

  const openDialog = (config: Partial<AIConfig> | null = null) => {
    setCurrentConfig(config ? { ...config } : { name: '', apiKey: '', model: '' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setCurrentConfig(null);
  };

  const openDeleteAlert = (id: number) => {
    setConfigToDelete(id);
    setDeleteAlertOpen(true);
  }

  const handleDeleteConfirm = async () => {
    if (configToDelete !== null) {
      await deleteConfig(configToDelete);
    }
    setDeleteAlertOpen(false);
    setConfigToDelete(null);
  }

  if (!configs) return <div>Loading configurations...</div>;

  return (
    <div className="w-full">
      <div className="flex justify-end mb-4">
        <Button onClick={() => openDialog()}>添加配置</Button>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.id}>
                <TableCell>{config.name}</TableCell>
                <TableCell>{config.model}</TableCell>
                <TableCell>
                  {config.id === activeConfigId && <Badge>已激活</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setActiveConfigId(config.id!)}>
                        {config.id === activeConfigId ? '取消激活' : '设为激活'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openDialog(config)}>
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openDeleteAlert(config.id!)} className="text-red-600">
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{currentConfig?.id ? '编辑' : '添加'} AI 配置</DialogTitle>
            <DialogDescription>
              在这里管理您的AI模型连接。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                名称
              </Label>
              <Input id="name" value={currentConfig?.name || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, name: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="model" className="text-right">
                模型
              </Label>
              <Input id="model" value={currentConfig?.model || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, model: e.target.value })} className="col-span-3" />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiKey" className="text-right">
                API Key
              </Label>
              <Input id="apiKey" type="password" value={currentConfig?.apiKey || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, apiKey: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiBaseUrl" className="text-right">
                API Base URL
              </Label>
              <Input id="apiBaseUrl" value={currentConfig?.apiBaseUrl || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, apiBaseUrl: e.target.value })} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>您确定要删除吗?</AlertDialogTitle>
                  <AlertDialogDescription>
                      此操作无法撤销。这将从数据库中永久删除该配置。
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteConfirm}>继续</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

    </div>
  );
} 