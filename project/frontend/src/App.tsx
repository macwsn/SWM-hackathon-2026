import { BrowserRouter, Route, Routes, Link, useParams } from 'react-router-dom'
import UserPanel from './pages/UserPanel'
import CaregiverPanel from './pages/CaregiverPanel'
import StatsPanel from './pages/StatsPanel'
import MultiAssistantPanel from './pages/MultiAssistantPanel'
import MultiUserPanel from './pages/MultiUserPanel'
import { FishjamProvider } from '@fishjam-cloud/react-client'

function Home() {
  return (
    <div className="min-h-screen bg-brutal-yellow flex flex-col items-center justify-center gap-6 p-8">
      <div className="card-brutal p-8 max-w-sm w-full text-center">
        <h1 className="text-4xl font-black uppercase mb-2">BLIND ASSIST</h1>
        <p className="text-sm font-bold mb-8 text-gray-600">SWM HACKATHON 2026</p>
        <div className="flex flex-col gap-4">
          <Link to="/user" className="btn-brutal bg-brutal-green text-black text-lg py-4 text-center">
            UŻYTKOWNIK
          </Link>
          <Link to="/caregiver" className="btn-brutal bg-brutal-blue text-white text-lg py-4 text-center">
            OPIEKUN
          </Link>
          <Link to="/stats" className="btn-brutal bg-brutal-pink text-black text-lg py-4 text-center">
            STATYSTYKI
          </Link>
          <Link to="/multiassistant" className="btn-brutal bg-black text-white text-lg py-4 text-center">
            MULTI ASSISTANT
          </Link>
          <div className="flex gap-2 mt-2">
            <Link to="/user/user1" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">USER 1</Link>
            <Link to="/user/user2" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">USER 2</Link>
            <Link to="/user/user3" className="btn-brutal bg-brutal-green text-black text-sm py-2 flex-1 text-center">USER 3</Link>
          </div>
        </div>
      </div>
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
