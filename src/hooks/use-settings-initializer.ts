'use client';

import { useEffect, useState } from 'react';
import { useGenerationSettingsStore } from '@/store/generation-settings';

/**
 * 这个钩子负责在应用加载时检查并初始化默认的生成设置。
 * 它确保了数据库中总有可用的设置，避免了在只读查询中进行写入操作。
 */
export const useSettingsInitializer = () => {
    const [isInitiated, setIsInitiated] = useState(false);
    const initializeSettings = useGenerationSettingsStore((state) => state.initializeSettings);

    useEffect(() => {
        if (isInitiated) return;
        
        console.log('[设置初始化] 开始检查并初始化生成设置...');
        initializeSettings().then(() => {
            console.log('[设置初始化] 生成设置检查和初始化完成。');
        });
        setIsInitiated(true);

    }, [isInitiated, initializeSettings]);
}; 