'use client';

import { useEffect, useState } from 'react';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';
import { ModelLoader } from '@/lib/model-loader';

export const useModelLoader = () => {
    const { setEmbeddingModelStatus, setEmbeddingModelProgress } = useAppStatusStore();
    const [isInitiated, setIsInitiated] = useState(false);

    useEffect(() => {
        console.log('[模型加载钩子] Effect 执行。是否已初始化:', isInitiated);
        if (isInitiated) {
            console.log('[模型加载钩子] 已初始化，跳过加载。');
            return;
        }
        
        console.log('[模型加载钩子] 开始初始化模型加载...');
        setIsInitiated(true);
        
        console.time('[模型加载钩子] ModelLoader.load 总耗时');
        ModelLoader.load(setEmbeddingModelStatus, setEmbeddingModelProgress)
            .then(() => {
                console.log("通过钩子成功加载嵌入模型。");
            })
            .catch(err => {
                console.error("通过钩子加载模型失败:", err);
            })
            .finally(() => {
                console.timeEnd('[模型加载钩子] ModelLoader.load 总耗时');
            });
    }, [isInitiated, setEmbeddingModelStatus, setEmbeddingModelProgress]);
}; 