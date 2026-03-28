import { useState, useEffect } from 'react';
import UserApp from './UserApp';
import GuardianApp from './GuardianApp';

export default function App() {
  const [role, setRole] = useState(null);

  // Check URL params for quick role setting
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    if (urlRole === 'user' || urlRole === 'guardian') {
      setRole(urlRole);
    }
  }, []);

  if (role === 'user') return <UserApp />;
  if (role === 'guardian') return <GuardianApp />;

  // Display Role Selection Screen
  return (
    <div className="app role-selector" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '20px', textAlign: 'center' }}>
      <h1>Wybierz tryb</h1>
      <p style={{ marginBottom: '40px', color: '#a0a0a0' }}>
        Wybierz, czy aplikacja ma uruchomić kamerę urządzenia, czy podgląd (dla opiekuna).
      </p>

      <button 
        className="btn btn-start" 
        style={{ width: '100%', maxWidth: '300px', marginBottom: '20px', padding: '20px', fontSize: '18px' }}
        onClick={() => setRole('user')}
      >
        📱 Użytkownik (Kamera)
      </button>

      <button 
        className="btn btn-secondary" 
        style={{ width: '100%', maxWidth: '300px', padding: '20px', fontSize: '18px' }}
        onClick={() => setRole('guardian')}
      >
        💻 Opiekun (Podgląd)
      </button>
    </div>
  );
}
