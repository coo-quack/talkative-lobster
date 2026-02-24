import { useState, useRef, useEffect } from 'react'
import { useChat } from '../hooks/useChat'

export function ChatView() {
  const { messages, streamText, send } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const handleSend = () => {
    if (!input.trim()) return
    send(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role}`}>
            <span className="chat-role">{msg.role === 'user' ? 'You' : 'Claw'}</span>
            <p>{msg.text}</p>
          </div>
        ))}
        {streamText && (
          <div className="chat-msg assistant streaming">
            <span className="chat-role">Claw</span>
            <p>{streamText}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <button onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
