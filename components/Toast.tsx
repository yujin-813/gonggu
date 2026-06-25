'use client'
import { useEffect } from 'react'

interface ToastProps {
  message: string
  visible: boolean
  onHide: () => void
}

export default function Toast({ message, visible, onHide }: ToastProps) {
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(onHide, 2200)
    return () => clearTimeout(t)
  }, [visible, onHide])

  return <div className={`toast ${visible ? 'show' : ''}`}>{message}</div>
}
