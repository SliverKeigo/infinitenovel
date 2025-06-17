'use client';

import { useEffect, useState } from 'react';
import { useAppStatusStore, ModelLoadStatus } from '@/store/use-app-status-store';
import { ModelLoader } from '@/lib/model-loader';

export const useModelLoader = () => {
    const { setEmbeddingModelStatus, setEmbeddingModelProgress } = useAppStatusStore();
    const [isInitiated, setIsInitiated] = useState(false);

    useEffect(() => {
        if (isInitiated) {
            return;
        }
        
        setIsInitiated(true);
        
        ModelLoader.load(setEmbeddingModelStatus, setEmbeddingModelProgress)
            .then(() => {
            })
            .catch(err => {
            })
            .finally(() => {
            });
    }, [isInitiated, setEmbeddingModelStatus, setEmbeddingModelProgress]);
}; 