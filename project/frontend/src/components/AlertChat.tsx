import React, { useEffect, useRef } from 'react'
import type { AlertMessage } from '../types'

interface AlertChatProps {
  messages: AlertMessage[]
}

const TYPE_STYLES: Record<AlertMessage['type'], string> = {
  alert: 'bg-brutal-red text-white border-black',
  describe_response: 'bg-brutal-blue text-white border-black',
  system: 'bg-gray-100 text-black border-gray-400',
}

const TYPE_LABEL: Record<AlertMessage['type'], string> = {
  alert: 'OBSTACLE',
  describe_response: 'DESCRIPTION',
  system: 'SYSTEM',
}

const AlertChat: React.FC<AlertChatProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full overflow-y-auto gap-2 p-2">
      {messages.length === 0 && (
        <div className="text-gray-400 text-xs font-bold uppercase text-center mt-4">
          No alerts
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`border-2 p-2 ${TYPE_STYLES[msg.type]}`}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-black uppercase">{TYPE_LABEL[msg.type]}</span>
            {msg.distance !== undefined && (
              <span className="text-xs font-bold">{msg.distance.toFixed(1)} m</span>
            )}
            <span className="text-xs opacity-70">
              {new Date(msg.timestamp * 1000).toLocaleTimeString('en-GB')}
            </span>
          </div>
          <p className="text-sm font-bold leading-snug">{msg.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

export default AlertChat
