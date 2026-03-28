/**
 * VisionAssist – Guardian App Component
 * Orchestrates WebSocket, spatial pings, and UI for remote viewing.
 */
import { useState, useCallback, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSpatialPing } from './hooks/useSpatialPing';
import GuardianCameraView from './components/GuardianCameraView';
import AlertPanel from './components/AlertPanel';
import StatusBar from './components/StatusBar';

export default function GuardianApp() {
  const ws = useWebSocket(null, 'guardian');
  const spatialPing = useSpatialPing();

  const [settings, setSettings] = useState({
    spatialAudioEnabled: true,
    showDepth: true,
    vibrationEnabled: true,
  });
  const [isRunning, setIsRunning] = useState(false);

  // Play spatial pings for warning/critical obstacles only.
  useEffect(() => {
    if (!settings.spatialAudioEnabled || !ws.lastAnalysis?.obstacles) return;

    const prioritized = [...ws.lastAnalysis.obstacles]
      .filter((o) => o.severity !== 'INFO')
      .sort((a, b) => {
        const rank = { CRITICAL: 0, WARNING: 1 };
        const severityDiff = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
        if (severityDiff !== 0) return severityDiff;
        return (a.distance ?? 999) - (b.distance ?? 999);
      });

    if (prioritized.length > 0) {
      const top = prioritized[0];
      spatialPing.playObstaclePing(top);

      // Vibration only for critical warnings.
      if (
        settings.vibrationEnabled &&
        navigator.vibrate &&
        top.severity === 'CRITICAL'
      ) {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }, [ws.lastAnalysis, settings.spatialAudioEnabled, settings.vibrationEnabled, spatialPing]);

  useEffect(() => {
    if (settings.spatialAudioEnabled !== spatialPing.isEnabled) {
      spatialPing.toggle();
    }
  }, [settings.spatialAudioEnabled, spatialPing]);

  const handleStart = useCallback(async () => {
    await spatialPing.init();
    ws.connect();
    setIsRunning(true);
  }, [ws, spatialPing]);

  const handleStop = useCallback(() => {
    ws.disconnect();
    spatialPing.stop();
    setIsRunning(false);
  }, [ws, spatialPing]);

  return (
    <div className="app">
      {/* Status Bar */}
      <StatusBar
        isActive={isRunning}
        fps={ws.lastAnalysis?.fps || 0}
        processingTime={ws.lastAnalysis?.ms || 0}
        onSettingsClick={null} // Guardian settings maybe later
      />

      {/* Camera View for Guardian */}
      <GuardianCameraView
        lastFrame={ws.lastFrame}
        isActive={isRunning}
        analysis={ws.lastAnalysis}
        showDepth={settings.showDepth}
      />

      {/* Alert Panel */}
      <AlertPanel alerts={ws.lastAnalysis?.alerts} />

      {/* Controls */}
      <div className="controls">
        {!isRunning ? (
          <button className="btn btn-start" onClick={handleStart} aria-label="Uruchom podgląd">
            <span className="btn-icon">▶</span>
            <span className="btn-label">Start Podglądu</span>
          </button>
        ) : (
          <button className="btn btn-stop" onClick={handleStop} aria-label="Zatrzymaj podgląd">
            <span className="btn-icon">⏹</span>
            <span className="btn-label">Stop Podglądu</span>
          </button>
        )}
      </div>

      {/* Connection Errors */}
      <div className="system-alerts">
        {ws.error && <div className="system-alert error">🔌 Błąd połączenia: {ws.error}</div>}
        {!isRunning && (
          <div className="system-alert info">ℹ️ Wskazówka: Kliknij Start, aby zacząć podgląd z telefonu.</div>
        )}
      </div>
    </div>
  );
}
