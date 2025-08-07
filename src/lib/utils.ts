import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safelyParseJson<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) {
    return fallback;
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return fallback;
  }
}

