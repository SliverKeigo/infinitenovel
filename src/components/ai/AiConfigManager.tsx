"use client";

import { useState } from 'react';
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
import { MoreHorizontal, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ModelLoader } from '@/lib/model-loader';
import { ModelLoadStatus } from '@/store/use-app-status-store';
import { EmbeddingPipeline } from '@/lib/embeddings';

export function AiConfigManager() {
  const {
    configs,
    loading,
    activeConfigId,
    setActiveConfigId,
    addConfig,
    updateConfig,
    deleteConfig,
  } = useAIConfigStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<Partial<AIConfig> | null>(null);
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const [modelLoadStatus, setModelLoadStatus] = useState<ModelLoadStatus>(ModelLoadStatus.IDLE);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

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
    setCurrentConfig(config ? { ...config } : {
      name: '',
      api_key: '',
      model: '',
      use_api_for_embeddings: false,
      embedding_model: 'text-embedding-ada-002',
      use_independent_embedding_config: false,
      embedding_api_key: '',
      embedding_api_base_url: ''
    });
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

  const handleToggleEmbeddingSource = (checked: boolean) => {
    setCurrentConfig({ ...currentConfig, use_api_for_embeddings: checked });
    // 重置嵌入服务，以便下次使用时重新创建
    EmbeddingPipeline.resetService();
  };

  const handleEmbeddingModelChange = (value: string) => {
    setCurrentConfig({ ...currentConfig, embedding_model: value });
    // 重置嵌入服务，以便下次使用时重新创建
    EmbeddingPipeline.resetService();
  };

  const handleToggleIndependentConfig = (checked: boolean) => {
    setCurrentConfig({ ...currentConfig, use_independent_embedding_config: checked });
    // 重置嵌入服务，以便下次使用时重新创建
    EmbeddingPipeline.resetService();
  };

  const handleEmbeddingApiKeyChange = (value: string) => {
    setCurrentConfig({ ...currentConfig, embedding_api_key: value || undefined });
    // 重置嵌入服务，以便下次使用时重新创建
    EmbeddingPipeline.resetService();
  };

  const handleEmbeddingApiBaseUrlChange = (value: string) => {
    setCurrentConfig({ ...currentConfig, embedding_api_base_url: value || undefined });
    // 重置嵌入服务，以便下次使用时重新创建
    EmbeddingPipeline.resetService();
  };

  const loadBrowserModel = async () => {
    setModelLoadStatus(ModelLoadStatus.LOADING);
    try {
      await ModelLoader.load(
        (status) => setModelLoadStatus(status),
        (progress) => setModelLoadProgress(progress)
      );
    } catch (error) {
      console.error("加载模型失败:", error);
      setModelLoadStatus(ModelLoadStatus.FAILED);
    }
  };


  return (
    <div className="w-full">
      <Tabs defaultValue="configs" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="configs">API配置</TabsTrigger>
          <TabsTrigger value="embeddings">向量化模型设置</TabsTrigger>
        </TabsList>

        <TabsContent value="configs">
          <div className="flex justify-end mb-4">
            <Button onClick={() => openDialog()}>
              <Plus className="mr-2 h-4 w-4" /> 添加配置
            </Button>
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
                {configs.map((config: AIConfig) => (
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
        </TabsContent>

        <TabsContent value="embeddings">
          <Card>
            <CardHeader>
              <CardTitle>向量化模型设置</CardTitle>
              <CardDescription>
                配置用于文本向量化的模型。向量化用于相似度搜索和语义检索。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="use-api-toggle">使用API进行向量化</Label>
                    <p className="text-sm text-muted-foreground">
                      开启后将使用OpenAI API进行文本向量化，关闭则使用浏览器内置模型
                    </p>
                  </div>
                  <Switch
                    id="use-api-toggle"
                    checked={currentConfig?.use_api_for_embeddings || false}
                    onCheckedChange={handleToggleEmbeddingSource}
                  />
                </div>

                <Separator />

                {currentConfig?.use_api_for_embeddings ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">API向量化设置</h3>
                    <div className="grid gap-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="embedding-model" className="text-right">
                          嵌入模型
                        </Label>
                        <Input
                          id="embedding-model"
                          value={currentConfig?.embedding_model || ''}
                          onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                          className="col-span-3"
                          placeholder="例如：text-embedding-ada-002"
                        />
                      </div>

                      <div className="flex items-center justify-between col-span-4">
                        <div className="space-y-1">
                          <Label htmlFor="use-independent-config">使用独立API配置</Label>
                          <p className="text-sm text-muted-foreground">
                            开启后将使用下方设置的API密钥和基础URL，而不是当前激活的配置
                          </p>
                        </div>
                        <Switch
                          id="use-independent-config"
                          checked={currentConfig?.use_independent_embedding_config || false}
                          onCheckedChange={handleToggleIndependentConfig}
                        />
                      </div>

                      {currentConfig?.use_independent_embedding_config ? (
                        <>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="embedding-api-key" className="text-right">
                              API密钥
                            </Label>
                            <Input
                              id="embedding-api-key"
                              type="password"
                              value={currentConfig?.embedding_api_key || ''}
                              onChange={(e) => handleEmbeddingApiKeyChange(e.target.value)}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="embedding-api-base-url" className="text-right">
                              API基础URL
                            </Label>
                            <Input
                              id="embedding-api-base-url"
                              value={currentConfig?.embedding_api_base_url || ''}
                              onChange={(e) => handleEmbeddingApiBaseUrlChange(e.target.value)}
                              className="col-span-3"
                              placeholder="可选，留空使用默认URL"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="col-span-4">
                          <p className="text-sm text-muted-foreground">
                            将使用当前激活的API配置进行向量化。请确保已经设置了有效的API密钥。
                          </p>
                          {!activeConfigId && (
                            <p className="text-sm text-red-500 mt-2">
                              警告：未激活任何API配置。请在"API配置"标签页中激活一个配置。
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">浏览器内置模型设置</h3>
                    <div className="grid gap-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="browser-model" className="text-right">
                          嵌入模型
                        </Label>
                        <Input
                          id="browser-model"
                          value={currentConfig?.embedding_model || ''}
                          onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                          className="col-span-3"
                          placeholder="例如：Xenova/all-MiniLM-L6-v2"
                        />
                      </div>
                      <div className="col-span-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={loadBrowserModel}
                            disabled={modelLoadStatus === ModelLoadStatus.LOADING}
                          >
                            {modelLoadStatus === ModelLoadStatus.LOADING ? '加载中...' : '加载模型'}
                          </Button>
                          <div className="flex-1">
                            {modelLoadStatus === ModelLoadStatus.LOADING && (
                              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                <div
                                  className="bg-blue-600 h-2.5 rounded-full"
                                  style={{ width: `${modelLoadProgress}%` }}
                                ></div>
                              </div>
                            )}
                            {modelLoadStatus === ModelLoadStatus.LOADED && (
                              <p className="text-sm text-green-500">模型已加载</p>
                            )}
                            {modelLoadStatus === ModelLoadStatus.FAILED && (
                              <p className="text-sm text-red-500">模型加载失败</p>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          浏览器内置模型在首次使用时需要下载，这可能需要一些时间。下载后的模型将缓存在浏览器中。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
              <Input id="apiKey" type="password" value={currentConfig?.api_key || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, api_key: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiBaseUrl" className="text-right">
                API Base URL
              </Label>
              <Input id="apiBaseUrl" value={currentConfig?.api_base_url || ''} onChange={(e) => setCurrentConfig({ ...currentConfig, api_base_url: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="useApiForEmbeddings" className="text-right">
                使用API进行向量化
              </Label>
              <div className="col-span-3 flex items-center">
                <Switch
                  id="useApiForEmbeddings"
                  checked={currentConfig?.use_api_for_embeddings || false}
                  onCheckedChange={(checked) => setCurrentConfig({ ...currentConfig, use_api_for_embeddings: checked })}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="embeddingModel" className="text-right">
                嵌入模型
              </Label>
              <Input
                id="embeddingModel"
                value={currentConfig?.embedding_model || ''}
                onChange={(e) => setCurrentConfig({ ...currentConfig, embedding_model: e.target.value })}
                className="col-span-3"
                placeholder={currentConfig?.use_api_for_embeddings ? "例如：text-embedding-ada-002" : "例如：Xenova/all-MiniLM-L6-v2"}
              />
            </div>
            {currentConfig?.use_api_for_embeddings && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="useIndependentEmbeddingConfig" className="text-right">
                    使用独立嵌入配置
                  </Label>
                  <div className="col-span-3 flex items-center">
                    <Switch
                      id="useIndependentEmbeddingConfig"
                      checked={currentConfig?.use_independent_embedding_config || false}
                      onCheckedChange={(checked) => setCurrentConfig({ ...currentConfig, use_independent_embedding_config: checked })}
                    />
                  </div>
                </div>

                {currentConfig?.use_independent_embedding_config && (
                  <>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="embeddingApiKey" className="text-right">
                        嵌入API密钥
                      </Label>
                      <Input
                        id="embeddingApiKey"
                        type="password"
                        value={currentConfig?.embedding_api_key || ''}
                        onChange={(e) => setCurrentConfig({ ...currentConfig, embedding_api_key: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="embeddingApiBaseUrl" className="text-right">
                        嵌入API基础URL
                      </Label>
                      <Input
                        id="embeddingApiBaseUrl"
                        value={currentConfig?.embedding_api_base_url || ''}
                        onChange={(e) => setCurrentConfig({ ...currentConfig, embedding_api_base_url: e.target.value })}
                        className="col-span-3"
                        placeholder="可选，留空使用默认URL"
                      />
                    </div>
                  </>
                )}
              </>
            )}
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