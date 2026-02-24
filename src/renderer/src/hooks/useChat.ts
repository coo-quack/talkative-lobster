import { useState, useEffect, useCallback } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamText, setStreamText] = useState('')

  useEffect(() => {
    window.budgie.getChatHistory().then(setMessages)
    const unsub1 = window.budgie.onChatMessage((msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg])
      setStreamText('')
    })
    const unsub2 = window.budgie.onChatStream((chunk: string) => {
      setStreamText(chunk)
    })
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const send = useCallback((text: string) => {
    window.budgie.chatSend(text)
  }, [])

  return { messages, streamText, send }
}
