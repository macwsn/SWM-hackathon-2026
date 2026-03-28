import { BrowserRouter, Route, Routes, Link, useParams, useNavigate } from 'react-router-dom'
import UserPanel from './pages/UserPanel'
import CaregiverPanel from './pages/CaregiverPanel'
import StatsPanel from './pages/StatsPanel'
import MultiAssistantPanel from './pages/MultiAssistantPanel'
import MultiUserPanel from './pages/MultiUserPanel'
import { useState } from 'react'
import { FishjamProvider } from '@fishjam-cloud/react-client'
import { useBiometricAuth } from './hooks/useBiometricAuth'
import FingerprintModal from './components/FingerprintModal'

/* ──────────────────────────────────────────
   Decorative floating shape
   ────────────────────────────────────────── */
function FloatingShape({ color, size, top, left, delay, shape }: {
  color: string; size: number; top: string; left: string; delay: string; shape: 'square' | 'circle' | 'triangle' | 'cross'
}) {
  const base = `absolute border-4 border-black pointer-events-none opacity-70`
  const style = { top, left, animationDelay: delay, width: size, height: size }

  if (shape === 'circle') {
    return <div className={`${base} rounded-full animate-float-slow ${color}`} style={style} />
  }
  if (shape === 'triangle') {
    return (
      <div className="absolute pointer-events-none opacity-70 animate-float-reverse" style={{ top, left, animationDelay: delay }}>
        <div style={{
          width: 0, height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid currentColor`,
        }} className={color.replace('bg-', 'text-')} />
      </div>
    )
  }
  if (shape === 'cross') {
    return (
      <div className={`absolute pointer-events-none opacity-50 animate-spin-slow`} style={{ top, left, animationDelay: delay }}>
        <div className="relative" style={{ width: size, height: size }}>
          <div className={`absolute top-1/2 left-0 w-full h-1 ${color} border-2 border-black -translate-y-1/2`} />
          <div className={`absolute top-0 left-1/2 w-1 h-full ${color} border-2 border-black -translate-x-1/2`} />
        </div>
      </div>
    )
  }
  // square
  return <div className={`${base} animate-float ${color}`} style={{ ...style, transform: `rotate(${Math.random() * 20 - 10}deg)` }} />
}

/* ──────────────────────────────────────────
   Ticker strip component
   ────────────────────────────────────────── */
function Ticker() {
  const text = 'AISIGHT \u2588 SWM HACKATHON 2026 \u2588 REAL-TIME OBSTACLE DETECTION \u2588 DEPTH ANALYSIS \u2588 SPATIAL AUDIO \u2588 VOICE ASSISTANCE \u2588 AI-POWERED NAVIGATION \u2588 '
  return (
    <div className="bg-black border-y-4 border-brutal-yellow overflow-hidden py-1">
      <div className="animate-marquee whitespace-nowrap inline-block">
        <span className="text-brutal-yellow font-black text-xs tracking-widest">
          {text}{text}
        </span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   Home page
   ────────────────────────────────────────── */
function Home() {
  const navigate = useNavigate()
  const { isMobile } = useBiometricAuth()
  const [showFingerprint, setShowFingerprint] = useState(false)

  return (
    <div className="min-h-screen bg-brutal-yellow bg-dots relative overflow-hidden flex flex-col">

      {/* Floating decorative shapes */}
      <FloatingShape color="bg-brutal-pink" size={60} top="8%" left="5%" delay="0s" shape="square" />
      <FloatingShape color="bg-brutal-blue" size={40} top="15%" left="85%" delay="1s" shape="circle" />
      <FloatingShape color="bg-brutal-red" size={50} top="60%" left="8%" delay="2s" shape="triangle" />
      <FloatingShape color="bg-brutal-green" size={35} top="70%" left="90%" delay="0.5s" shape="square" />
      <FloatingShape color="bg-brutal-orange" size={30} top="40%" left="92%" delay="1.5s" shape="cross" />
      <FloatingShape color="bg-brutal-pink" size={25} top="85%" left="15%" delay="3s" shape="circle" />
      <FloatingShape color="bg-brutal-blue" size={45} top="25%" left="3%" delay="2.5s" shape="cross" />
      <FloatingShape color="bg-brutal-red" size={20} top="50%" left="80%" delay="1s" shape="circle" />

      {/* Ticker top */}
      <Ticker />

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 relative z-10">

        {/* Logo block */}
        <div className="text-center mb-2">
          {/* Eye icon */}
          <div className="inline-block mb-4 relative">
            <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center border-4 border-black shadow-brutal-lg relative">
              <span className="text-5xl">👁️</span>
              <div className="absolute inset-0 rounded-full animate-pulse-ring border-4 border-black opacity-30" />
            </div>
          </div>

          <h1 className="text-6xl md:text-8xl font-black uppercase animate-glitch tracking-tighter">
            AISIGHT
          </h1>
          <div className="h-2 w-full bg-brutal-yellow border-4 border-black mt-2 shadow-brutal" />
          <div className="mt-2 inline-block bg-black px-4 py-1">
            <span className="text-brutal-yellow font-black text-sm tracking-[0.3em]">SWM HACKATHON 2026</span>
          </div>
        </div>

        {/* Biometric quick login — mobile only */}
        {isMobile && (
          <button
            onClick={() => setShowFingerprint(true)}
            className="btn-brutal bg-brutal-green text-black max-w-sm w-full py-5 flex items-center justify-center gap-4 group shadow-brutal-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="group-hover:scale-110 transition-transform flex-shrink-0">
              <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
              <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
              <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
              <path d="M2 12a10 10 0 0 1 18-6" />
              <path d="M2 16h.01" />
              <path d="M21.8 16c.2-2 .131-5.354 0-6" />
              <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
              <path d="M8.65 22c.21-.66.45-1.32.57-2" />
              <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
            </svg>
            <div className="text-left">
              <span className="text-lg font-black uppercase block">QUICK LOGIN</span>
              <span className="text-xs font-bold opacity-70">Use fingerprint to enter as User</span>
            </div>
          </button>
        )}

        {/* Fingerprint modal */}
        <FingerprintModal
          open={showFingerprint}
          onClose={() => setShowFingerprint(false)}
          onSuccess={() => { setShowFingerprint(false); navigate('/user') }}
        />

        {/* Navigation card */}
        <div className="card-brutal p-6 max-w-sm w-full bg-[#1a1a2e] relative corner-brackets">
          {/* Decorative top bar */}
          <div className="absolute -top-3 left-6 right-6 h-3 bg-brutal-yellow border-x-4 border-t-4 border-black" />

          <div className="flex flex-col gap-3 mt-2">
            <Link to="/user" className="btn-brutal bg-brutal-green text-black text-lg py-4 text-center flex items-center justify-center gap-3 group">
              <span className="text-2xl group-hover:scale-125 transition-transform">👁️</span>
              USER
            </Link>

            <Link to="/caregiver" className="btn-brutal bg-brutal-blue text-white text-lg py-4 text-center flex items-center justify-center gap-3 group">
              <span className="text-2xl group-hover:scale-125 transition-transform">🛡️</span>
              CAREGIVER
            </Link>

            <Link to="/stats" className="btn-brutal bg-brutal-pink text-black text-lg py-4 text-center flex items-center justify-center gap-3 group">
              <span className="text-2xl group-hover:scale-125 transition-transform">📊</span>
              STATISTICS
            </Link>

            <Link to="/multiassistant" className="btn-brutal bg-black text-white text-lg py-4 text-center flex items-center justify-center gap-3 group">
              <span className="text-2xl group-hover:scale-125 transition-transform">📡</span>
              MULTI ASSISTANT
            </Link>

            {/* Multi-user row */}
            <div className="border-t-4 border-white/20 pt-3 mt-1">
              <span className="text-xs font-black uppercase text-gray-400 block mb-2">CONNECT AS USER:</span>
              <div className="flex gap-2">
                <Link to="/user/user1" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">
                  U1
                </Link>
                <Link to="/user/user2" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">
                  U2
                </Link>
                <Link to="/user/user3" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">
                  U3
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer tagline */}
        <p className="text-xs font-bold text-black/50 uppercase tracking-widest mt-2">
          real-time vision &bull; depth analysis &bull; spatial audio
        </p>
      </div>

      {/* Ticker bottom */}
      <Ticker />
    </div>
  )
}

function MultiUserPanelWithId() {
  const { id } = useParams<{ id: string }>()
  return <MultiUserPanel userId={id ?? 'user1'} />
}

export default function App() {
  return (
    <FishjamProvider fishjamId="self-hosted">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/user" element={<UserPanel />} />
          <Route path="/user/:id" element={<MultiUserPanelWithId />} />
          <Route path="/caregiver" element={<CaregiverPanel />} />
          <Route path="/stats" element={<StatsPanel />} />
          <Route path="/multiassistant" element={<MultiAssistantPanel />} />
        </Routes>
      </BrowserRouter>
    </FishjamProvider>
  )
}
