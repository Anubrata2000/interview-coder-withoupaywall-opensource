import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useToast } from "../../contexts/toast";
import { APIProvider, AppConfig } from "../../types/electron";

type AIModel = {
  id: string;
  name: string;
  description: string;
};

type ModelCategory = {
  key: "extractionModel" | "solutionModel" | "debuggingModel";
  title: string;
  description: string;
  openaiModels: AIModel[];
  geminiModels: AIModel[];
  anthropicModels: AIModel[];
};

const modelCategories: ModelCategory[] = [
  {
    key: "extractionModel",
    title: "Problem Extraction",
    description: "Model used to analyze screenshots and extract problem details",
    openaiModels: [
      { id: "gpt-4o", name: "GPT-4o", description: "Best overall vision and extraction performance" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Faster, lightweight option" },
      { id: "o3-mini", name: "o3-mini", description: "High reasoning capabilities" }
    ],
    geminiModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "State-of-the-art speed and vision accuracy" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Ultra-fast extraction and processing" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Complex context reasoning" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", description: "Balanced performance and efficiency" }
    ],
    anthropicModels: [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", description: "Highest coding and vision intelligence" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Balanced speed and accuracy" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Fastest response times" }
    ]
  },
  {
    key: "solutionModel",
    title: "Solution Generation",
    description: "Model used to generate coding solutions and complexity analysis",
    openaiModels: [
      { id: "gpt-4o", name: "GPT-4o", description: "Strong coding accuracy and explanations" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Faster solution generation" },
      { id: "o3-mini", name: "o3-mini", description: "Deep algorithmic reasoning" }
    ],
    geminiModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Latest reasoning with fast response times" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Rapid optimal code generation" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Deep reasoning on complex constraints" }
    ],
    anthropicModels: [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", description: "Best-in-class coding benchmarks" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Exceptional code quality" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", description: "Lightning fast responses" }
    ]
  },
  {
    key: "debuggingModel",
    title: "Debugging & Feedback",
    description: "Model used to analyze candidate code, test cases, and errors",
    openaiModels: [
      { id: "gpt-4o", name: "GPT-4o", description: "Comprehensive error diagnosis" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast error inspection" }
    ],
    geminiModels: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Sharp error finding and test case analysis" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast feedback loop" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Thorough deep-dive debugging" }
    ],
    anthropicModels: [
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", description: "Top-tier debugging accuracy" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", description: "Clear structured code fixes" }
    ]
  }
];

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: externalOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen || false);
  const [apiProvider, setApiProvider] = useState<APIProvider>("gemini");

  // Per-provider stored keys
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("https://api.openai.com/v1");
  const [customModel, setCustomModel] = useState("gpt-4o");

  // Selected models
  const [extractionModel, setExtractionModel] = useState("gemini-2.0-flash");
  const [solutionModel, setSolutionModel] = useState("gemini-2.0-flash");
  const [debuggingModel, setDebuggingModel] = useState("gemini-2.0-flash");

  // Testing status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    setTestResult(null);
    if (onOpenChange && newOpen !== externalOpen) {
      onOpenChange(newOpen);
    }
  };

  // Load current config when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setTestResult(null);

      window.electronAPI
        .getConfig()
        .then((config: AppConfig) => {
          const provider = config.apiProvider || "gemini";
          setApiProvider(provider);

          setOpenaiKey(config.openaiApiKey || (provider === "openai" ? config.apiKey : ""));
          setGeminiKey(config.geminiApiKey || (provider === "gemini" ? config.apiKey : ""));
          setAnthropicKey(config.anthropicApiKey || (provider === "anthropic" ? config.apiKey : ""));
          setCustomKey(config.customApiKey || (provider === "custom" ? config.apiKey : ""));
          setCustomBaseUrl(config.customBaseUrl || "https://api.openai.com/v1");
          setCustomModel(config.customModel || "gpt-4o");

          setExtractionModel(config.extractionModel || "gemini-2.0-flash");
          setSolutionModel(config.solutionModel || "gemini-2.0-flash");
          setDebuggingModel(config.debuggingModel || "gemini-2.0-flash");
        })
        .catch((error: unknown) => {
          console.error("Failed to load config:", error);
          showToast("Error", "Failed to load settings", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, showToast]);

  const getCurrentKey = (): string => {
    if (apiProvider === "openai") return openaiKey;
    if (apiProvider === "gemini") return geminiKey;
    if (apiProvider === "anthropic") return anthropicKey;
    return customKey;
  };

  const setCurrentKey = (value: string) => {
    setTestResult(null);
    if (apiProvider === "openai") setOpenaiKey(value);
    else if (apiProvider === "gemini") setGeminiKey(value);
    else if (apiProvider === "anthropic") setAnthropicKey(value);
    else setCustomKey(value);
  };

  const handleProviderChange = (provider: APIProvider) => {
    setApiProvider(provider);
    setTestResult(null);

    if (provider === "openai") {
      setExtractionModel("gpt-4o");
      setSolutionModel("gpt-4o");
      setDebuggingModel("gpt-4o");
    } else if (provider === "gemini") {
      setExtractionModel("gemini-2.0-flash");
      setSolutionModel("gemini-2.0-flash");
      setDebuggingModel("gemini-2.0-flash");
    } else if (provider === "anthropic") {
      setExtractionModel("claude-3-7-sonnet-20250219");
      setSolutionModel("claude-3-7-sonnet-20250219");
      setDebuggingModel("claude-3-7-sonnet-20250219");
    } else if (provider === "custom") {
      const model = customModel || "gpt-4o";
      setExtractionModel(model);
      setSolutionModel(model);
      setDebuggingModel(model);
    }
  };

  const handleTestKey = async () => {
    const keyToTest = getCurrentKey();
    if (!keyToTest && apiProvider !== "custom") {
      setTestResult({ success: false, message: "Please enter an API key to test." });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await window.electronAPI.validateApiKey(keyToTest, apiProvider, customBaseUrl);
      if (result.valid) {
        setTestResult({ success: true, message: "Connection successful! API key is active." });
      } else {
        setTestResult({
          success: false,
          message: result.error || "Validation failed. Please verify your credentials."
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || "Failed to reach API server."
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const currentApiKey = getCurrentKey();

      const result = await window.electronAPI.updateConfig({
        apiKey: currentApiKey,
        apiProvider,
        openaiApiKey: openaiKey,
        geminiApiKey: geminiKey,
        anthropicApiKey: anthropicKey,
        customApiKey: customKey,
        customBaseUrl,
        customModel,
        extractionModel,
        solutionModel,
        debuggingModel
      });

      if (result) {
        showToast("Success", "Settings saved successfully", "success");
        handleOpenChange(false);

        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Error", "Failed to save settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return "";
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  const openExternalLink = (url: string) => {
    window.electronAPI.openLink(url);
  };

  const currentKeyVal = getCurrentKey();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-neutral-950 border border-white/10 text-white settings-dialog"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, 92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          zIndex: 9999,
          padding: "20px"
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-white">API & Model Settings</DialogTitle>
          <DialogDescription className="text-white/70 text-xs">
            Choose your AI provider and enter your API key. Keys are saved locally on your device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* API Provider Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/90">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                  apiProvider === "gemini"
                    ? "bg-white/10 border-blue-400/60 shadow-sm"
                    : "bg-black/30 border-white/10 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("gemini")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${apiProvider === "gemini" ? "bg-blue-400" : "bg-white/20"}`} />
                  <div>
                    <p className="font-medium text-white text-xs">Gemini</p>
                    <p className="text-[10px] text-white/50">Google AI Studio</p>
                  </div>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                  apiProvider === "openai"
                    ? "bg-white/10 border-emerald-400/60 shadow-sm"
                    : "bg-black/30 border-white/10 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("openai")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${apiProvider === "openai" ? "bg-emerald-400" : "bg-white/20"}`} />
                  <div>
                    <p className="font-medium text-white text-xs">OpenAI</p>
                    <p className="text-[10px] text-white/50">GPT-4o & o3</p>
                  </div>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                  apiProvider === "anthropic"
                    ? "bg-white/10 border-amber-400/60 shadow-sm"
                    : "bg-black/30 border-white/10 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("anthropic")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${apiProvider === "anthropic" ? "bg-amber-400" : "bg-white/20"}`} />
                  <div>
                    <p className="font-medium text-white text-xs">Anthropic</p>
                    <p className="text-[10px] text-white/50">Claude 3.7 / 3.5</p>
                  </div>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                  apiProvider === "custom"
                    ? "bg-white/10 border-purple-400/60 shadow-sm"
                    : "bg-black/30 border-white/10 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("custom")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${apiProvider === "custom" ? "bg-purple-400" : "bg-white/20"}`} />
                  <div>
                    <p className="font-medium text-white text-xs">Custom / Local</p>
                    <p className="text-[10px] text-white/50">Ollama, DeepSeek, etc.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Base URL & Model (for Custom provider) */}
          {apiProvider === "custom" && (
            <div className="space-y-2 p-3 bg-white/[0.03] border border-white/10 rounded-lg">
              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">API Base URL</label>
                <Input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="bg-black/60 border-white/10 text-white text-xs h-8"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/80 block mb-1">Model Identifier</label>
                <Input
                  type="text"
                  value={customModel}
                  onChange={(e) => {
                    setCustomModel(e.target.value);
                    setExtractionModel(e.target.value);
                    setSolutionModel(e.target.value);
                    setDebuggingModel(e.target.value);
                  }}
                  placeholder="deepseek-chat or llama3"
                  className="bg-black/60 border-white/10 text-white text-xs h-8"
                />
              </div>
            </div>
          )}

          {/* API Key Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-white/90" htmlFor="apiKey">
                {apiProvider === "openai"
                  ? "OpenAI API Key"
                  : apiProvider === "gemini"
                  ? "Gemini API Key"
                  : apiProvider === "anthropic"
                  ? "Anthropic API Key"
                  : "API Key (Optional for local)"}
              </label>
              {currentKeyVal && (
                <span className="text-[11px] text-white/50 font-mono">
                  {maskApiKey(currentKeyVal)}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                id="apiKey"
                type="password"
                value={currentKeyVal}
                onChange={(e) => setCurrentKey(e.target.value)}
                placeholder={
                  apiProvider === "openai"
                    ? "sk-..."
                    : apiProvider === "gemini"
                    ? "AIzaSy..."
                    : apiProvider === "anthropic"
                    ? "sk-ant-..."
                    : "Enter key or leave empty if not required"
                }
                className="bg-black/50 border-white/10 text-white text-xs h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestKey}
                disabled={isTesting || (!currentKeyVal && apiProvider !== "custom")}
                className="border-white/20 text-xs px-3 text-white hover:bg-white/10 h-9"
              >
                {isTesting ? "Testing..." : "Test Key"}
              </Button>
            </div>

            {testResult && (
              <div
                className={`p-2 rounded text-xs mt-1 border ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {testResult.message}
              </div>
            )}

            {/* Quick links to get keys */}
            <div className="p-2 rounded bg-white/[0.02] border border-white/5 text-[11px] text-white/60">
              {apiProvider === "openai" && (
                <span>
                  Get key from{" "}
                  <button
                    onClick={() => openExternalLink("https://platform.openai.com/api-keys")}
                    className="text-blue-400 hover:underline"
                  >
                    platform.openai.com
                  </button>
                </span>
              )}
              {apiProvider === "gemini" && (
                <span>
                  Get free key from{" "}
                  <button
                    onClick={() => openExternalLink("https://aistudio.google.com/app/apikey")}
                    className="text-blue-400 hover:underline"
                  >
                    Google AI Studio
                  </button>
                </span>
              )}
              {apiProvider === "anthropic" && (
                <span>
                  Get key from{" "}
                  <button
                    onClick={() => openExternalLink("https://console.anthropic.com/settings/keys")}
                    className="text-blue-400 hover:underline"
                  >
                    Anthropic Console
                  </button>
                </span>
              )}
              {apiProvider === "custom" && (
                <span>Works with local Ollama, LM Studio, vLLM, DeepSeek, Groq, or OpenRouter.</span>
              )}
            </div>
          </div>

          {/* Model selection (for providers with presets) */}
          {apiProvider !== "custom" && (
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-white/90 block">Model Configuration</label>

              {modelCategories.map((category) => {
                const models =
                  apiProvider === "openai"
                    ? category.openaiModels
                    : apiProvider === "gemini"
                    ? category.geminiModels
                    : category.anthropicModels;

                const currentValue =
                  category.key === "extractionModel"
                    ? extractionModel
                    : category.key === "solutionModel"
                    ? solutionModel
                    : debuggingModel;

                const setValue =
                  category.key === "extractionModel"
                    ? setExtractionModel
                    : category.key === "solutionModel"
                    ? setSolutionModel
                    : setDebuggingModel;

                return (
                  <div key={category.key} className="space-y-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] font-medium text-white/80">{category.title}</span>
                      <span className="text-[10px] text-white/40">{currentValue}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-1">
                      {models.map((m) => (
                        <div
                          key={m.id}
                          className={`p-2 rounded cursor-pointer transition-colors flex items-center justify-between border ${
                            currentValue === m.id
                              ? "bg-white/10 border-white/30 text-white"
                              : "bg-black/20 border-white/5 text-white/60 hover:bg-white/5"
                          }`}
                          onClick={() => setValue(m.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                currentValue === m.id ? "bg-white" : "bg-white/20"
                              }`}
                            />
                            <span className="text-xs font-medium">{m.name}</span>
                          </div>
                          <span className="text-[10px] text-white/40">{m.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shortcuts summary */}
          <div className="p-2.5 bg-black/40 border border-white/10 rounded-lg text-[11px]">
            <span className="font-semibold text-white/80 block mb-1">Global Hotkeys</span>
            <div className="grid grid-cols-2 gap-y-1 text-white/60">
              <span>Show / Hide: <kbd className="text-white font-mono">Ctrl+B</kbd></span>
              <span>Screenshot: <kbd className="text-white font-mono">Ctrl+H</kbd></span>
              <span>Solve Problem: <kbd className="text-white font-mono">Ctrl+Enter</kbd></span>
              <span>Delete Last: <kbd className="text-white font-mono">Ctrl+L</kbd></span>
              <span>Reset State: <kbd className="text-white font-mono">Ctrl+R</kbd></span>
              <span>Quit Application: <kbd className="text-white font-mono">Ctrl+Q</kbd></span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between gap-2 sm:justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-white/10 hover:bg-white/5 text-white text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            className="px-4 bg-white text-black rounded-lg font-medium hover:bg-white/90 text-xs h-9"
            onClick={handleSave}
            disabled={isLoading || (!currentKeyVal && apiProvider !== "custom")}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
