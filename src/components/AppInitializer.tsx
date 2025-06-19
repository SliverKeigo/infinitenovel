'use client';

import { useEffect, useState } from 'react';
import { useAIConfigStore } from '@/store/ai-config';
import { useGenerationSettingsStore } from '@/store/generation-settings';
import { voyInitializer } from '@/lib/voy-initializer';

/**
 * This component is responsible for running initialization logic when the app loads.
 * It fetches the initial set of AI configurations from the server.
 */
export function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const fetchAIConfigs = useAIConfigStore((state) => state.fetchConfigs);
  const fetchGenerationSettings = useGenerationSettingsStore((state) => state.fetchSettings);

  useEffect(() => {
    const initialize = async () => {
      // Run initializations in parallel
      await Promise.all([
        fetchAIConfigs(),
        fetchGenerationSettings(),
        voyInitializer.init(),
      ]);
      setIsInitialized(true);
    };

    initialize();
  }, [fetchAIConfigs, fetchGenerationSettings]);

  if (!isInitialized) {
    return <div></div>;
  }

  return <>{children}</>;
}

export default AppInitializer; 