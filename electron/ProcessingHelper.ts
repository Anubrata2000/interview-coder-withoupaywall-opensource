// ProcessingHelper.ts
import fs from "node:fs"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import axios from "axios"
import { BrowserWindow } from "electron"
import { OpenAI } from "openai"
import { configHelper, APIProvider } from "./ConfigHelper"
import Anthropic from "@anthropic-ai/sdk"

// Interface for Gemini API requests
interface GeminiMessage {
  role: string
  parts: Array<{
    text?: string
    inlineData?: {
      mimeType: string
      data: string
    }
  }>
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
    finishReason?: string
  }>
}

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper | null = null
  private openaiClient: OpenAI | null = null
  private geminiApiKey: string | null = null
  private anthropicClient: Anthropic | null = null

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()

    this.initializeAIClient()

    configHelper.on("config-updated", () => {
      this.initializeAIClient()
    })
  }

  private getActiveScreenshotHelper(): ScreenshotHelper | null {
    if (!this.screenshotHelper) {
      this.screenshotHelper = this.deps.getScreenshotHelper()
    }
    return this.screenshotHelper
  }

  private initializeAIClient(): void {
    try {
      const config = configHelper.loadConfig()
      const provider = config.apiProvider || "gemini"

      if (provider === "openai") {
        this.geminiApiKey = null
        this.anthropicClient = null
        if (config.apiKey) {
          this.openaiClient = new OpenAI({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          })
          console.log("OpenAI client initialized successfully")
        } else {
          this.openaiClient = null
          console.warn("No API key available, OpenAI client not initialized")
        }
      } else if (provider === "gemini") {
        this.openaiClient = null
        this.anthropicClient = null
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey
          console.log("Gemini API key configured successfully")
        } else {
          this.geminiApiKey = null
          console.warn("No API key available, Gemini client not initialized")
        }
      } else if (provider === "anthropic") {
        this.openaiClient = null
        this.geminiApiKey = null
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          })
          console.log("Anthropic client initialized successfully")
        } else {
          this.anthropicClient = null
          console.warn("No API key available, Anthropic client not initialized")
        }
      } else if (provider === "custom") {
        this.geminiApiKey = null
        this.anthropicClient = null
        const baseURL = (config.customBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "")
        this.openaiClient = new OpenAI({
          apiKey: config.apiKey || "dummy-key",
          baseURL,
          timeout: 60000,
          maxRetries: 2
        })
        console.log(`Custom OpenAI-compatible client initialized with baseURL: ${baseURL}`)
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error)
      this.openaiClient = null
      this.geminiApiKey = null
      this.anthropicClient = null
    }
  }

  private async waitForInitialization(mainWindow: BrowserWindow): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getLanguage(): Promise<string> {
    try {
      const config = configHelper.loadConfig()
      if (config.language) {
        return config.language
      }

      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )
          if (typeof language === "string" && language) {
            return language
          }
        } catch (err) {
          console.warn("Could not get language from window", err)
        }
      }

      return "python"
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig()
    const provider = config.apiProvider || "gemini"

    if ((provider === "openai" || provider === "custom") && !this.openaiClient) {
      this.initializeAIClient()
      if (!this.openaiClient) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID)
        return
      }
    } else if (provider === "gemini" && !this.geminiApiKey) {
      this.initializeAIClient()
      if (!this.geminiApiKey) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID)
        return
      }
    } else if (provider === "anthropic" && !this.anthropicClient) {
      this.initializeAIClient()
      if (!this.anthropicClient) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID)
        return
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    const helper = this.getActiveScreenshotHelper()
    if (!helper) {
      console.error("ScreenshotHelper not available")
      return
    }

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = helper.getScreenshotQueue()

      if (!screenshotQueue || screenshotQueue.length === 0) {
        console.log("No screenshots found in queue")
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      const existingScreenshots = screenshotQueue.filter((p) => fs.existsSync(p))
      if (existingScreenshots.length === 0) {
        console.log("Screenshot files do not exist on disk")
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      try {
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const loadedScreenshots = await Promise.all(
          existingScreenshots.map(async (p) => {
            try {
              return {
                path: p,
                preview: await helper.getImagePreview(p),
                data: fs.readFileSync(p).toString("base64")
              }
            } catch (err) {
              console.error(`Error reading screenshot ${p}:`, err)
              return null
            }
          })
        )

        const validScreenshots: Array<{ path: string; preview: string; data: string }> = []
        for (const item of loadedScreenshots) {
          if (item !== null) {
            validScreenshots.push(item)
          }
        }

        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data")
        }

        const result = await this.processScreenshotsHelper(validScreenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (
            result.error?.includes("API Key") ||
            result.error?.includes("OpenAI") ||
            result.error?.includes("Gemini") ||
            result.error?.includes("Anthropic")
          ) {
            mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.API_KEY_INVALID)
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          this.deps.setView("queue")
          return
        }

        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view === "solutions" or "debug"
      const extraScreenshotQueue = helper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)

      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue")
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      const existingExtraScreenshots = extraScreenshotQueue.filter((p) => fs.existsSync(p))
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files do not exist on disk")
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const allPaths = [
          ...helper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ]

        const loadedScreenshots = await Promise.all(
          allPaths.map(async (p) => {
            try {
              if (!fs.existsSync(p)) return null
              return {
                path: p,
                preview: await helper.getImagePreview(p),
                data: fs.readFileSync(p).toString("base64")
              }
            } catch (err) {
              console.error(`Error reading screenshot ${p}:`, err)
              return null
            }
          })
        )

        const validScreenshots: Array<{ path: string; preview: string; data: string }> = []
        for (const item of loadedScreenshots) {
          if (item !== null) {
            validScreenshots.push(item)
          }
        }

        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging")
        }

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message || "Failed to process debug screenshots"
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const config = configHelper.loadConfig()
      const language = await this.getLanguage()
      const mainWindow = this.deps.getMainWindow()
      const provider: APIProvider = config.apiProvider || "gemini"

      const imageDataList = screenshots.map((s) => s.data)

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20
        })
      }

      let problemInfo: any

      if (provider === "openai" || provider === "custom") {
        if (!this.openaiClient) {
          this.initializeAIClient()
          if (!this.openaiClient) {
            return {
              success: false,
              error: "API client not initialized. Please verify your settings."
            }
          }
        }

        const messages = [
          {
            role: "system" as const,
            content:
              "You are an expert coding interview assistant. Analyze the screenshot of the coding problem and extract all relevant information. Return valid JSON only with these fields: problem_statement, constraints, example_input, example_output. Do not include markdown code block syntax or extra text outside JSON."
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: `Extract the coding problem details from these screenshots. Preferred coding language is ${language}. Return JSON only.`
              },
              ...imageDataList.map((data) => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ]

        const model = config.extractionModel || (provider === "custom" ? config.customModel || "gpt-4o" : "gpt-4o")

        const extractionResponse = await this.openaiClient.chat.completions.create({
          model,
          messages,
          max_tokens: 4000,
          temperature: 0.2
        })

        const responseText = extractionResponse.choices[0]?.message?.content || ""
        try {
          const jsonText = responseText.replace(/```(?:json)?|```/g, "").trim()
          problemInfo = JSON.parse(jsonText)
        } catch (error) {
          console.error("Error parsing response as JSON:", responseText, error)
          problemInfo = {
            problem_statement: responseText,
            constraints: "",
            example_input: "",
            example_output: ""
          }
        }
      } else if (provider === "gemini") {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          }
        }

        const geminiMessages: GeminiMessage[] = [
          {
            role: "user",
            parts: [
              {
                text: `You are an expert coding interview challenge interpreter. Analyze the screenshots of the coding problem and extract all relevant information. Return JSON format only with these fields: problem_statement, constraints, example_input, example_output. Preferred coding language is ${language}. Return JSON only without extra conversational text.`
              },
              ...imageDataList.map((data) => ({
                inlineData: {
                  mimeType: "image/png",
                  data
                }
              }))
            ]
          }
        ]

        const model = config.extractionModel || "gemini-2.0-flash"
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
          {
            contents: geminiMessages,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4000
            }
          },
          { signal }
        )

        const responseData = response.data as GeminiResponse
        const candidate = responseData.candidates?.[0]
        if (!candidate) {
          throw new Error("Empty response from Gemini API. The content might have been filtered.")
        }

        const parts = candidate.content?.parts || []
        const responseText = parts.map((p) => p.text || "").join("").trim()
        if (!responseText) {
          throw new Error("No text content returned from Gemini API")
        }

        try {
          const jsonText = responseText.replace(/```(?:json)?|```/g, "").trim()
          problemInfo = JSON.parse(jsonText)
        } catch (error) {
          console.error("Error parsing Gemini response as JSON:", responseText, error)
          problemInfo = {
            problem_statement: responseText,
            constraints: "",
            example_input: "",
            example_output: ""
          }
        }
      } else if (provider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          }
        }

        const messages = [
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: `Extract the coding problem details from these screenshots. Return JSON format with fields: problem_statement, constraints, example_input, example_output. Preferred language is ${language}. Return pure JSON only.`
              },
              ...imageDataList.map((data) => ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: "image/png" as const,
                  data
                }
              }))
            ]
          }
        ]

        const model = config.extractionModel || "claude-3-7-sonnet-20250219"
        const response = await this.anthropicClient.messages.create({
          model,
          max_tokens: 4000,
          messages,
          temperature: 0.2
        })

        const firstBlock = response.content?.[0]
        const responseText = firstBlock && "text" in firstBlock ? firstBlock.text : ""
        try {
          const jsonText = responseText.replace(/```(?:json)?|```/g, "").trim()
          problemInfo = JSON.parse(jsonText)
        } catch (error) {
          console.error("Error parsing Claude response as JSON:", responseText, error)
          problemInfo = {
            problem_statement: responseText,
            constraints: "",
            example_input: "",
            example_output: ""
          }
        }
      }

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40
        })
      }

      this.deps.setProblemInfo(problemInfo)

      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        )

        const solutionsResult = await this.generateSolutionsHelper(signal)
        if (solutionsResult.success) {
          const helper = this.getActiveScreenshotHelper()
          helper?.clearExtraScreenshotQueue()

          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          })

          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          )
          return { success: true, data: solutionsResult.data }
        } else {
          throw new Error(solutionsResult.error || "Failed to generate solutions")
        }
      }

      return { success: false, error: "Failed to process screenshots" }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        }
      }

      if (error?.response?.status === 401 || error?.status === 401) {
        return {
          success: false,
          error: "Invalid API key. Please check your settings."
        }
      } else if (error?.response?.status === 429 || error?.status === 429) {
        return {
          success: false,
          error: "API rate limit exceeded or insufficient quota. Please try again later."
        }
      }

      console.error("API Error Details:", error)
      return {
        success: false,
        error: error.message || "Failed to process screenshots. Please try again."
      }
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()
      const config = configHelper.loadConfig()
      const mainWindow = this.deps.getMainWindow()
      const provider: APIProvider = config.apiProvider || "gemini"

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Creating optimal solution with detailed explanations...",
          progress: 60
        })
      }

      const promptText = `
Generate a detailed, optimal solution for the following coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

Provide your response in the following exact format:
1. Code: An optimal implementation in ${language} wrapped in markdown code blocks (\`\`\`${language} ... \`\`\`)
2. Thoughts: Bullet points of key insights and approach
3. Time complexity: O(X) with explanation (at least 2 sentences)
4. Space complexity: O(X) with explanation (at least 2 sentences)
`

      let responseContent = ""

      if (provider === "openai" || provider === "custom") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "API client not initialized. Please check your settings."
          }
        }

        const model = config.solutionModel || (provider === "custom" ? config.customModel || "gpt-4o" : "gpt-4o")
        const solutionResponse = await this.openaiClient.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are an expert coding interview assistant. Provide clear, optimal solutions with clean code, key insights, and rigorous complexity analysis."
            },
            { role: "user", content: promptText }
          ],
          max_tokens: 4000,
          temperature: 0.2
        })

        responseContent = solutionResponse.choices[0]?.message?.content || ""
      } else if (provider === "gemini") {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          }
        }

        const model = config.solutionModel || "gemini-2.0-flash"
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
          {
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `You are an expert coding interview assistant. Provide an optimal solution with detailed explanations:\n\n${promptText}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4000
            }
          },
          { signal }
        )

        const responseData = response.data as GeminiResponse
        const candidate = responseData.candidates?.[0]
        if (!candidate) {
          throw new Error("Empty response from Gemini API")
        }
        const parts = candidate.content?.parts || []
        responseContent = parts.map((p) => p.text || "").join("").trim()
      } else if (provider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          }
        }

        const model = config.solutionModel || "claude-3-7-sonnet-20250219"
        const response = await this.anthropicClient.messages.create({
          model,
          max_tokens: 4000,
          messages: [
            {
              role: "user" as const,
              content: `You are an expert coding interview assistant. Provide an optimal solution with detailed explanations:\n\n${promptText}`
            }
          ],
          temperature: 0.2
        })

        const firstBlock = response.content?.[0]
        responseContent = firstBlock && "text" in firstBlock ? firstBlock.text : ""
      }

      const safeResponse = responseContent || ""

      // Extract code block
      const codeMatch = safeResponse.match(/```(?:\w+)?\s*([\s\S]*?)```/)
      const code = codeMatch ? codeMatch[1].trim() : safeResponse

      // Extract thoughts
      const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i
      const thoughtsMatch = safeResponse.match(thoughtsRegex)
      let thoughts: string[] = []

      if (thoughtsMatch && thoughtsMatch[1]) {
        const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g)
        if (bulletPoints) {
          thoughts = bulletPoints
            .map((point) => point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, "").trim())
            .filter(Boolean)
        } else {
          thoughts = thoughtsMatch[1]
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        }
      }

      // Extract complexities
      const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i
      const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i

      let timeComplexity = "O(n) - Linear time complexity. Elements are processed efficiently in a single pass."
      let spaceComplexity = "O(n) - Linear auxiliary space complexity for data storage."

      const timeMatch = safeResponse.match(timeComplexityPattern)
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim()
      }

      const spaceMatch = safeResponse.match(spaceComplexityPattern)
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim()
      }

      const formattedResponse = {
        code,
        thoughts: thoughts.length > 0 ? thoughts : ["Optimal solution generated based on problem constraints"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity
      }

      return { success: true, data: formattedResponse }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return { success: false, error: "Processing was canceled by the user." }
      }
      console.error("Solution generation error:", error)
      return { success: false, error: error.message || "Failed to generate solution" }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()
      const config = configHelper.loadConfig()
      const mainWindow = this.deps.getMainWindow()
      const provider: APIProvider = config.apiProvider || "gemini"

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        })
      }

      const imageDataList = screenshots.map((s) => s.data)
      let debugContent = ""

      const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include code, error messages, incorrect outputs, or test cases.

I am solving this problem: "${problemInfo.problem_statement}" in ${language}.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH HEADERS:
### Issues Identified
- List each issue found with clear explanations

### Specific Improvements and Corrections
- List specific code changes needed

### Optimizations
- List performance optimizations if applicable

### Explanation of Changes Needed
Provide an explanation of why the changes resolve the problem.

### Key Points
- Summary of the most important takeaways

Include code corrections in proper markdown code blocks (\`\`\`${language} ... \`\`\`).
`

      if (provider === "openai" || provider === "custom") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "API client not configured. Please check your settings."
          }
        }

        const model = config.debuggingModel || (provider === "custom" ? config.customModel || "gpt-4o" : "gpt-4o")
        const messages = [
          {
            role: "system" as const,
            content: "You are an expert coding interview assistant helping debug code."
          },
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: debugPrompt },
              ...imageDataList.map((data) => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ]

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60
          })
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model,
          messages,
          max_tokens: 4000,
          temperature: 0.2
        })

        debugContent = debugResponse.choices[0]?.message?.content || ""
      } else if (provider === "gemini") {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          }
        }

        const model = config.debuggingModel || "gemini-2.0-flash"
        const geminiMessages: GeminiMessage[] = [
          {
            role: "user",
            parts: [
              { text: debugPrompt },
              ...imageDataList.map((data) => ({
                inlineData: {
                  mimeType: "image/png",
                  data
                }
              }))
            ]
          }
        ]

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code with Gemini...",
            progress: 60
          })
        }

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`,
          {
            contents: geminiMessages,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4000
            }
          },
          { signal }
        )

        const responseData = response.data as GeminiResponse
        const candidate = responseData.candidates?.[0]
        if (!candidate) {
          throw new Error("Empty response from Gemini API")
        }
        const parts = candidate.content?.parts || []
        debugContent = parts.map((p) => p.text || "").join("").trim()
      } else if (provider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          }
        }

        const model = config.debuggingModel || "claude-3-7-sonnet-20250219"
        const messages = [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: debugPrompt },
              ...imageDataList.map((data) => ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: "image/png" as const,
                  data
                }
              }))
            ]
          }
        ]

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code with Claude...",
            progress: 60
          })
        }

        const response = await this.anthropicClient.messages.create({
          model,
          max_tokens: 4000,
          messages,
          temperature: 0.2
        })

        const firstBlock = response.content?.[0]
        debugContent = firstBlock && "text" in firstBlock ? firstBlock.text : ""
      }

      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        })
      }

      const safeDebugContent = debugContent || ""
      let extractedCode = "// Debug mode - see analysis below"
      const codeMatch = safeDebugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/)
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim()
      }

      let formattedDebugContent = safeDebugContent
      if (!safeDebugContent.includes("# ") && !safeDebugContent.includes("## ")) {
        formattedDebugContent = safeDebugContent
          .replace(/issues identified|problems found|bugs found/i, "## Issues Identified")
          .replace(/code improvements|improvements|suggested changes/i, "## Code Improvements")
          .replace(/optimizations|performance improvements/i, "## Optimizations")
          .replace(/explanation|detailed analysis/i, "## Explanation")
      }

      const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g)
      const thoughts = bulletPoints
        ? bulletPoints.map((point) => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, "").trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"]

      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      }

      return { success: true, data: response }
    } catch (error: any) {
      console.error("Debug processing error:", error)
      return { success: false, error: error.message || "Failed to process debug request" }
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    this.deps.setHasDebugged(false)
    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}
