// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"
import Anthropic from "@anthropic-ai/sdk"
import axios from "axios"

export type APIProvider = "openai" | "gemini" | "anthropic" | "custom";

export interface Config {
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

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.0-flash",
    solutionModel: "gemini-2.0-flash",
    debuggingModel: "gemini-2.0-flash",
    language: "python",
    opacity: 1.0,
    openaiApiKey: "",
    geminiApiKey: "",
    anthropicApiKey: "",
    customApiKey: "",
    customBaseUrl: "https://api.openai.com/v1",
    customModel: "gpt-4o"
  };

  constructor() {
    super();
    try {
      this.configPath = path.join(app.getPath("userData"), "config.json");
      console.log("Config path:", this.configPath);
    } catch {
      console.warn("Could not access user data path, using fallback");
      this.configPath = path.join(process.cwd(), "config.json");
    }

    this.ensureConfigExists();
  }

  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  public sanitizeModelSelection(model: string, provider: APIProvider): string {
    if (provider === "openai") {
      const allowed = ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4-turbo"];
      return allowed.includes(model) ? model : "gpt-4o";
    } else if (provider === "gemini") {
      const allowed = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
      return allowed.includes(model) ? model : "gemini-2.0-flash";
    } else if (provider === "anthropic") {
      const allowed = [
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229"
      ];
      return allowed.includes(model) ? model : "claude-3-7-sonnet-20250219";
    } else if (provider === "custom") {
      return model || "gpt-4o";
    }
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, "utf8");
        const parsed = JSON.parse(configData);

        const validProviders: APIProvider[] = ["openai", "gemini", "anthropic", "custom"];
        if (!validProviders.includes(parsed.apiProvider)) {
          parsed.apiProvider = "gemini";
        }

        // Keep active apiKey synced with provider-specific key if available
        if (parsed.apiProvider === "openai" && parsed.openaiApiKey && !parsed.apiKey) {
          parsed.apiKey = parsed.openaiApiKey;
        } else if (parsed.apiProvider === "gemini" && parsed.geminiApiKey && !parsed.apiKey) {
          parsed.apiKey = parsed.geminiApiKey;
        } else if (parsed.apiProvider === "anthropic" && parsed.anthropicApiKey && !parsed.apiKey) {
          parsed.apiKey = parsed.anthropicApiKey;
        } else if (parsed.apiProvider === "custom" && parsed.customApiKey && !parsed.apiKey) {
          parsed.apiKey = parsed.customApiKey;
        }

        return {
          ...this.defaultConfig,
          ...parsed
        };
      }

      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  public saveConfig(config: Config): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();

      // Auto-detect provider if user provides key without provider
      if (updates.apiKey && !updates.apiProvider) {
        const key = updates.apiKey.trim();
        if (key.startsWith("sk-ant-")) {
          updates.apiProvider = "anthropic";
        } else if (key.startsWith("sk-")) {
          updates.apiProvider = "openai";
        } else if (key.startsWith("AIzaSy")) {
          updates.apiProvider = "gemini";
        }
      }

      const activeProvider = updates.apiProvider || currentConfig.apiProvider;

      // Synchronize per-provider keys
      const providerKeyUpdates: Partial<Config> = {};
      if (updates.apiKey !== undefined) {
        if (activeProvider === "openai") providerKeyUpdates.openaiApiKey = updates.apiKey;
        else if (activeProvider === "gemini") providerKeyUpdates.geminiApiKey = updates.apiKey;
        else if (activeProvider === "anthropic") providerKeyUpdates.anthropicApiKey = updates.apiKey;
        else if (activeProvider === "custom") providerKeyUpdates.customApiKey = updates.apiKey;
      } else if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        // Provider changed without explicit apiKey: restore that provider's saved key
        if (updates.apiProvider === "openai") updates.apiKey = currentConfig.openaiApiKey || "";
        else if (updates.apiProvider === "gemini") updates.apiKey = currentConfig.geminiApiKey || "";
        else if (updates.apiProvider === "anthropic") updates.apiKey = currentConfig.anthropicApiKey || "";
        else if (updates.apiProvider === "custom") updates.apiKey = currentConfig.customApiKey || "";
      }

      // Reset default models if provider changed and models not specified
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = updates.extractionModel || "gpt-4o";
          updates.solutionModel = updates.solutionModel || "gpt-4o";
          updates.debuggingModel = updates.debuggingModel || "gpt-4o";
        } else if (updates.apiProvider === "gemini") {
          updates.extractionModel = updates.extractionModel || "gemini-2.0-flash";
          updates.solutionModel = updates.solutionModel || "gemini-2.0-flash";
          updates.debuggingModel = updates.debuggingModel || "gemini-2.0-flash";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = updates.extractionModel || "claude-3-7-sonnet-20250219";
          updates.solutionModel = updates.solutionModel || "claude-3-7-sonnet-20250219";
          updates.debuggingModel = updates.debuggingModel || "claude-3-7-sonnet-20250219";
        } else if (updates.apiProvider === "custom") {
          const customM = updates.customModel || currentConfig.customModel || "gpt-4o";
          updates.extractionModel = updates.extractionModel || customM;
          updates.solutionModel = updates.solutionModel || customM;
          updates.debuggingModel = updates.debuggingModel || customM;
        }
      }

      // Sanitize model selections
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, activeProvider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, activeProvider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, activeProvider);
      }

      const newConfig = { ...currentConfig, ...providerKeyUpdates, ...updates };
      this.saveConfig(newConfig);

      if (
        updates.apiKey !== undefined ||
        updates.apiProvider !== undefined ||
        updates.extractionModel !== undefined ||
        updates.solutionModel !== undefined ||
        updates.debuggingModel !== undefined ||
        updates.language !== undefined ||
        updates.customBaseUrl !== undefined
      ) {
        this.emit("config-updated", newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error("Error updating config:", error);
      return this.defaultConfig;
    }
  }

  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }

  public isValidApiKeyFormat(apiKey: string, provider?: APIProvider): boolean {
    const trimmed = (apiKey || "").trim();
    if (!trimmed) return false;

    if (!provider) {
      if (trimmed.startsWith("sk-ant-")) provider = "anthropic";
      else if (trimmed.startsWith("sk-")) provider = "openai";
      else provider = "gemini";
    }

    if (provider === "openai") {
      return /^sk-[-a-zA-Z0-9_]{20,}$/.test(trimmed);
    } else if (provider === "gemini") {
      return trimmed.length >= 15;
    } else if (provider === "anthropic") {
      return /^sk-ant-[-a-zA-Z0-9_]{20,}$/.test(trimmed);
    } else if (provider === "custom") {
      return trimmed.length > 0;
    }

    return false;
  }

  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  public setOpacity(opacity: number): void {
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }

  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }

  public async testApiKey(
    apiKey: string,
    provider?: APIProvider,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string }> {
    const key = (apiKey || "").trim();
    if (!key && provider !== "custom") {
      return { valid: false, error: "API key is required" };
    }

    const currentProvider = provider || (key.startsWith("sk-ant-") ? "anthropic" : key.startsWith("sk-") ? "openai" : "gemini");

    if (currentProvider === "openai") {
      return this.testOpenAIKey(key);
    } else if (currentProvider === "gemini") {
      return this.testGeminiKey(key);
    } else if (currentProvider === "anthropic") {
      return this.testAnthropicKey(key);
    } else if (currentProvider === "custom") {
      return this.testCustomKey(key, baseUrl);
    }

    return { valid: false, error: "Unknown API provider" };
  }

  private async testOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const openai = new OpenAI({ apiKey, timeout: 15000 });
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error("OpenAI API key test failed:", error);
      if (error?.status === 401) {
        return { valid: false, error: "Invalid OpenAI API key. Please verify your key." };
      } else if (error?.status === 429) {
        return { valid: false, error: "OpenAI rate limit or quota exceeded." };
      }
      return { valid: false, error: error?.message || "Failed to validate OpenAI API key" };
    }
  }

  private async testGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { timeout: 15000 }
      );
      if (response.status === 200 && response.data?.models) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid response from Google Gemini API" };
    } catch (error: any) {
      console.error("Gemini API key test failed:", error?.response?.data || error);
      const status = error?.response?.status;
      const apiErrMsg = error?.response?.data?.error?.message;
      if (status === 400 || status === 403) {
        return { valid: false, error: apiErrMsg || "Invalid Gemini API key. Please check your key from Google AI Studio." };
      }
      return { valid: false, error: apiErrMsg || error?.message || "Failed to validate Gemini API key" };
    }
  }

  private async testAnthropicKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const anthropic = new Anthropic({ apiKey, timeout: 15000 });
      await anthropic.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error("Anthropic API key test failed:", error);
      if (error?.status === 401) {
        return { valid: false, error: "Invalid Anthropic API key. Please check your key from Anthropic Console." };
      } else if (error?.status === 429) {
        return { valid: false, error: "Anthropic rate limit exceeded." };
      }
      return { valid: false, error: error?.message || "Failed to validate Anthropic API key" };
    }
  }

  private async testCustomKey(apiKey: string, baseUrl?: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const url = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
      const client = new OpenAI({
        apiKey: apiKey || "dummy-key",
        baseURL: url,
        timeout: 15000
      });
      await client.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error("Custom endpoint test failed:", error);
      return {
        valid: false,
        error: error?.message || "Failed to connect to custom API endpoint"
      };
    }
  }
}

export const configHelper = new ConfigHelper();
