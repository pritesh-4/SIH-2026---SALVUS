import { useState } from 'react'

export const EmergencyCard = ({
  badgeText = 'EMERGENCY',
  title = 'Need help right now?',
  description = 'Send an emergency request with your live location to nearby responders.',
  buttonText = 'SEND SOS',
  onSosClick,
}) => {
  const [isPressed, setIsPressed] = useState(false)

  const handleSos = () => {
    setIsPressed(true)
    setTimeout(() => setIsPressed(false), 800)
    if (onSosClick) onSosClick()
  }

  return (
    <div className="bg-[#111A24] border border-[#1E293B] rounded-xl p-6 transition-all duration-200 hover:border-[#2A3B4E]">
      <span className="text-xs font-semibold tracking-wider text-rose-500 uppercase block mb-2">
        {badgeText}
      </span>
      <h2 className="text-xl font-bold text-white tracking-tight leading-snug">{title}</h2>
      <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-lg leading-relaxed">
        {description}
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleSos}
          className={`px-5 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase text-white transition-all duration-200 cursor-pointer shadow-lg shadow-red-950/40 active:scale-95 ${
            isPressed
              ? 'bg-rose-700 ring-2 ring-rose-400'
              : 'bg-[#EF4444] hover:bg-rose-600 hover:shadow-rose-900/50'
          }`}
        >
          {isPressed ? 'REQUEST INITIATED...' : buttonText}
        </button>
      </div>
    </div>
  )
}
