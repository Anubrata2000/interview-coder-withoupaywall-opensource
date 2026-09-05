export type APIProvider = "openai" | "gemini" | "anthropic" | "custom";

export interface AppConfig {
  apiKey: string;
  apiProvider: APIProvider;
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  customApiKey?: string;
  customBaseUrl?: string;
  customModel?: string;
}

export interface ScreenshotPreview {
  path: string;
  preview: string;
}

export interface ElectronAPI {
  openSettingsPortal: () => Promise<{ success: boolean; error?: string } | void>;
  updateContentDimensions: (dimensions: {
    width: number;
    height: number;
  }) => Promise<void>;
  clearStore: () => Promise<{ success: boolean; error?: string }>;
  getScreenshots: () => Promise<ScreenshotPreview[]>;
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>;
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>;

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void;
  onResetView: (callback: () => void) => () => void;
  onSolutionStart: (callback: () => void) => () => void;
  onDebugStart: (callback: () => void) => () => void;
  onDebugSuccess: (callback: (data: any) => void) => () => void;
  onDebugError: (callback: (error: string) => void) => () => void;
  onSolutionError: (callback: (error: string) => void) => () => void;
  onProcessingNoScreenshots: (callback: () => void) => () => void;
  onOutOfCredits: (callback: () => void) => () => void;
  onProblemExtracted: (callback: (data: any) => void) => () => void;
  onSolutionSuccess: (callback: (data: any) => void) => () => void;
  onUnauthorized: (callback: () => void) => () => void;
  onReset?: (callback: () => void) => () => void;

  // Actions
  openLink: (url: string) => Promise<{ success: boolean; error?: string } | void>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string } | void>;
  triggerScreenshot: () => Promise<{ success?: boolean; error?: string; path?: string; preview?: string }>;
  triggerProcessScreenshots: () => Promise<{ success: boolean; error?: string }>;
  triggerReset: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveLeft: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveRight: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveUp: () => Promise<{ success: boolean; error?: string }>;
  triggerMoveDown: () => Promise<{ success: boolean; error?: string }>;

  // Auto-updater
  startUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  onUpdateAvailable: (callback: (info: any) => void) => () => void;
  onUpdateDownloaded: (callback: (info: any) => void) => () => void;

  // Credits & Platform
  decrementCredits: () => Promise<void>;
  setInitialCredits: (credits: number) => Promise<void>;
  onCreditsUpdated: (callback: (credits: number) => void) => () => void;
  getPlatform: () => string;

  // Config & API Keys
  getConfig: () => Promise<AppConfig>;
  updateConfig: (config: Partial<AppConfig>) => Promise<AppConfig | boolean>;
  onShowSettings: (callback: () => void) => () => void;
  checkApiKey: () => Promise<boolean>;
  validateApiKey: (
    apiKey: string,
    provider?: APIProvider,
    baseUrl?: string
  ) => Promise<{ valid: boolean; error?: string }>;
  onApiKeyInvalid: (callback: () => void) => () => void;
  removeListener: (eventName: string, callback: (...args: any[]) => void) => void;

  // Screenshot management
  onDeleteLastScreenshot: (callback: () => void) => () => void;
  deleteLastScreenshot: () => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    __CREDITS__: number;
    __LANGUAGE__: string;
    __IS_INITIALIZED__: boolean;
  }
}
