import { useState } from 'react'

export const EmergencyCard = ({
  badgeText = 'Emergency assistance',
  title = 'Need urgent emergency help?',
  description = 'Transmits an instant distress beacon with your precise location to disaster coordinators.',
  buttonText = 'Send SOS Request',
  onSosClick,
}) => {
  const [isPressed, setIsPressed] = useState(false)

  const handleSos = () => {
    setIsPressed(true)
    setTimeout(() => setIsPressed(false), 800)
    if (onSosClick) onSosClick()
  }

  return (
    <div className="bg-[#0D141F] border border-rose-500/30 rounded-xl p-5 sm:p-6 transition-all duration-200 hover:border-rose-500/50 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full bg-rose-500"></span>
        <span className="text-xs font-semibold tracking-wide text-rose-400">{badgeText}</span>
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight leading-snug">
        {title}
      </h2>
      <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-lg leading-relaxed font-normal">
        {description}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSos}
          className={`px-5 py-2.5 rounded-lg text-xs font-bold tracking-wide text-white transition-all duration-200 cursor-pointer shadow-md active:scale-95 flex items-center gap-2 ${
            isPressed
              ? 'bg-rose-700 ring-2 ring-rose-400'
              : 'bg-[#EF4444] hover:bg-rose-600 shadow-rose-950/40'
          }`}
        >
          <span>🚨</span>
          <span>{isPressed ? 'Connecting to Command...' : buttonText}</span>
        </button>
        <span className="text-[11px] text-slate-400">Press to transmit GPS beacon</span>
      </div>
    </div>
  )
}
