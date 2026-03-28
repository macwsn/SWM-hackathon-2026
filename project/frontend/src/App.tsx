import { BrowserRouter, Route, Routes, Link, useParams } from 'react-router-dom'
import UserPanel from './pages/UserPanel'
import CaregiverPanel from './pages/CaregiverPanel'
import StatsPanel from './pages/StatsPanel'
import MultiAssistantPanel from './pages/MultiAssistantPanel'
import MultiUserPanel from './pages/MultiUserPanel'
import { FishjamProvider } from '@fishjam-cloud/react-client'

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
  const text = 'BLIND ASSIST \u2588 SWM HACKATHON 2026 \u2588 REAL-TIME OBSTACLE DETECTION \u2588 DEPTH ANALYSIS \u2588 SPATIAL AUDIO \u2588 VOICE ASSISTANCE \u2588 AI-POWERED NAVIGATION \u2588 '
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

          <h1 className="text-6xl md:text-7xl font-black uppercase animate-glitch tracking-tight">
            BLIND
          </h1>
          <h1 className="text-6xl md:text-7xl font-black uppercase tracking-tight -mt-2">
            ASSIST
          </h1>
          <div className="mt-2 inline-block bg-black px-4 py-1">
            <span className="text-brutal-yellow font-black text-sm tracking-[0.3em]">SWM HACKATHON 2026</span>
          </div>
        </div>

        {/* Navigation card */}
        <div className="card-brutal p-6 max-w-sm w-full bg-brutal-dark relative corner-brackets">
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
