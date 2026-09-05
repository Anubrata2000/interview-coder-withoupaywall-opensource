// file: src/components/SubscribedApp.tsx
import React, { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Queue from "../_pages/Queue"
import Solutions from "../_pages/Solutions"
import { useToast } from "../contexts/toast"

interface SubscribedAppProps {
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}

const SubscribedApp: React.FC<SubscribedAppProps> = ({
  credits,
  currentLanguage,
  setLanguage
}) => {
  const queryClient = useQueryClient()
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  // Ensure queries are invalidated and reset if electron reset occurs
  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(() => {
      queryClient.invalidateQueries({ queryKey: ["screenshots"] })
      queryClient.invalidateQueries({ queryKey: ["problem_statement"] })
      queryClient.invalidateQueries({ queryKey: ["solution"] })
      queryClient.invalidateQueries({ queryKey: ["new_solution"] })
      setView("queue")
    })

    return () => {
      cleanup()
    }
  }, [queryClient])

  // Dynamically update the window size
  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight || 600
      const width = containerRef.current.scrollWidth || 800
      window.electronAPI?.updateContentDimensions({ width, height })
    }

    updateDimensions()

    const fallbackTimer = setTimeout(() => {
      window.electronAPI?.updateContentDimensions({ width: 800, height: 600 })
    }, 500)

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.current)

    const mutationObserver = new MutationObserver(updateDimensions)
    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    const delayedUpdate = setTimeout(updateDimensions, 1000)

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      clearTimeout(fallbackTimer)
      clearTimeout(delayedUpdate)
    }
  }, [view])

  // Listen for events that switch views or handle errors
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
      }),
      window.electronAPI.onUnauthorized(() => {
        queryClient.removeQueries({ queryKey: ["screenshots"] })
        queryClient.removeQueries({ queryKey: ["solution"] })
        queryClient.removeQueries({ queryKey: ["problem_statement"] })
        setView("queue")
      }),
      window.electronAPI.onResetView(() => {
        queryClient.removeQueries({ queryKey: ["screenshots"] })
        queryClient.removeQueries({ queryKey: ["solution"] })
        queryClient.removeQueries({ queryKey: ["problem_statement"] })
        queryClient.setQueryData(["problem_statement"], null)
        setView("queue")
      }),
      window.electronAPI.onProblemExtracted((data: unknown) => {
        if (view === "queue") {
          queryClient.invalidateQueries({ queryKey: ["problem_statement"] })
          queryClient.setQueryData(["problem_statement"], data)
        }
      }),
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Error", error, "error")
      })
    ]
    return () => cleanupFunctions.forEach((fn) => fn())
  }, [view, queryClient, showToast])

  return (
    <div ref={containerRef} className="min-h-0">
      {view === "queue" ? (
        <Queue
          setView={setView}
          credits={credits}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        <Solutions
          setView={setView}
          credits={credits}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      )}
    </div>
  )
}

export default SubscribedApp
