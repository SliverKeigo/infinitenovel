'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { useModelLoader } from '@/hooks/use-model-loader';
import { type ThemeProviderProps } from "next-themes";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useModelLoader();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
} 