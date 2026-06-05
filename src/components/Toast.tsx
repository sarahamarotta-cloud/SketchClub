'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'

interface ToastMessage {
  id: string
  message: string
  type: 'default' | 'error'
  leaving: boolean
}

interface ToastContextValue {
  showToast: (message: string, type?: 'default' | 'error') => void
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((message: string, type: 'default' | 'error' = 'default') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type, leaving: false }])

    setTimeout(() => {
      setToasts(prev =>
        prev.map(t => t.id === id ? { ...t, leaving: true } : t)
      )
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 300)
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast${toast.type === 'error' ? ' toast-error' : ''}${toast.leaving ? ' toast-out' : ''}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
