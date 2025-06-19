import { Voy } from 'voy-search';

class VoyInitializer {
  private static instance: VoyInitializer;
  private readyPromise: Promise<void>;
  private isInitializing = false;

  private constructor() {
    this.readyPromise = Promise.resolve();
  }

  public static getInstance(): VoyInitializer {
    if (!VoyInitializer.instance) {
      VoyInitializer.instance = new VoyInitializer();
    }
    return VoyInitializer.instance;
  }

  public async init(): Promise<void> {
    if (this.isInitializing) {
      return this.readyPromise;
    }

    this.isInitializing = true;
    console.log('[VoyInitializer] Starting initialization...');

    this.readyPromise = new Promise(async (resolve, reject) => {
      try {
        // We don't need to import, as Voy is imported statically.
        // The key is to trigger the Wasm instantiation.
        // Creating an empty instance is a lightweight way to do this.
        new Voy();
        console.log('[VoyInitializer] Wasm module instantiated successfully.');
        resolve();
      } catch (error) {
        console.error('[VoyInitializer] Failed to initialize Voy Wasm module:', error);
        reject(error);
      } finally {
        this.isInitializing = false;
      }
    });

    return this.readyPromise;
  }

  public ready(): Promise<void> {
    return this.readyPromise;
  }
}

export const voyInitializer = VoyInitializer.getInstance(); 