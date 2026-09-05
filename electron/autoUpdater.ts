import { autoUpdater } from "electron-updater"
import { BrowserWindow, ipcMain, app } from "electron"
import log from "electron-log"

export function initAutoUpdater() {
  console.log("Initializing auto-updater...")

  // Skip update checks in development or if explicitly disabled
  if (!app.isPackaged) {
    console.log("Skipping auto-updater in development mode")
    return
  }

  // Prevent auto-updating from upstream closed-source repo unless explicit repo is provided
  if (!process.env.ENABLE_AUTO_UPDATE && !process.env.GH_TOKEN) {
    console.log("Auto-updater disabled for open-source standalone build")
    return
  }

  // Configure auto updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.logger = log
  log.transports.file.level = "info"

  autoUpdater.on("checking-for-update", () => {
    console.log("Checking for updates...")
  })

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info)
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update-available", info)
    })
  })

  autoUpdater.on("update-not-available", (info) => {
    console.log("Update not available:", info)
  })

  autoUpdater.on("download-progress", (progressObj) => {
    console.log("Download progress:", progressObj)
  })

  autoUpdater.on("update-downloaded", (info) => {
    console.log("Update downloaded:", info)
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update-downloaded", info)
    })
  })

  autoUpdater.on("error", (err) => {
    console.error("Auto updater error:", err)
  })

  // Handle IPC messages from renderer
  ipcMain.handle("start-update", async () => {
    console.log("Start update requested")
    try {
      await autoUpdater.downloadUpdate()
      console.log("Update download completed")
      return { success: true }
    } catch (error: any) {
      console.error("Failed to start update:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle("install-update", () => {
    console.log("Install update requested")
    autoUpdater.quitAndInstall()
  })
}
