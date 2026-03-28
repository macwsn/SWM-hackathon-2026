/**
 * VisionAssist – User App Component
 * Orchestrates camera, WebSocket, spatial pings, and UI.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useCamera } from './hooks/useCamera';
import { useWebSocket } from './hooks/useWebSocket';
import { useSpatialPing } from './hooks/useSpatialPing';
import CameraView from './components/CameraView';
import AlertPanel from './components/AlertPanel';
import StatusBar from './components/StatusBar';
import SettingsPanel from './components/SettingsPanel';

export default function UserApp() {
  const camera = useCamera();
  const ws = useWebSocket(null, 'user');
  const spatialPing = useSpatialPing();

  const [settings, setSettings] = useState({
    spatialAudioEnabled: true,
    showDepth: true,
    vibrationEnabled: true,
    depthMode: 'indoor',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset processing flag when data arrives OR on timeout
  useEffect(() => {
    if (ws.lastAnalysis) {
      setIsProcessing(false);
    }
  }, [ws.lastAnalysis]);

  // Fail-safe: Reset processing after 2 seconds if no response
  useEffect(() => {
    if (isProcessing) {
      const t = setTimeout(() => setIsProcessing(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isProcessing]);

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
    await camera.startCamera();
    await spatialPing.init();
    ws.connect();
    setIsRunning(true);
  }, [camera, ws, spatialPing]);

  const handleStop = useCallback(() => {
    camera.stopCamera();
    ws.disconnect();
    spatialPing.stop();
    setIsRunning(false);
  }, [camera, ws, spatialPing]);

  const handleFrameCapture = useCallback(
    (base64Data) => {
      if (!isProcessing) {
        setIsProcessing(true);
        ws.sendFrame(base64Data, settings.depthMode);
      }
    },
    [ws, isProcessing, settings.depthMode]
  );

  return (
    <div className="app">
      {/* Status Bar */}
      <StatusBar
        isActive={camera.isActive}
        fps={ws.lastAnalysis?.fps || 0}
        processingTime={ws.lastAnalysis?.ms || 0}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      {/* Camera View */}
      <CameraView
        videoRef={camera.videoRef}
        isActive={camera.isActive}
        analysis={ws.lastAnalysis}
        showDepth={settings.showDepth}
        onFrameCapture={isRunning ? handleFrameCapture : null}
      />

      {/* Alert Panel */}
      <AlertPanel alerts={ws.lastAnalysis?.alerts} />

      {/* Controls */}
      <div className="controls">
        {!isRunning ? (
          <button className="btn btn-start" onClick={handleStart} aria-label="Uruchom">
            <span className="btn-icon">▶</span>
            <span className="btn-label">Start</span>
          </button>
        ) : (
          <button className="btn btn-stop" onClick={handleStop} aria-label="Zatrzymaj">
            <span className="btn-icon">⏹</span>
            <span className="btn-label">Stop</span>
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={camera.switchCamera}
          disabled={!isRunning}
          aria-label="Przełącz kamerę"
        >
          <span className="btn-icon">🔄</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ustawienia"
        >
          <span className="btn-icon">⚙️</span>
        </button>
      </div>

      {/* Connection & Camera Errors */}
      <div className="system-alerts">
        {ws.error && <div className="system-alert error">🔌 Błąd połączenia: {ws.error}</div>}
        {camera.error && <div className="system-alert error">⚠️ Błąd kamery: {camera.error}</div>}
        {!isRunning && !camera.isActive && (
          <div className="system-alert info">ℹ️ Wskazówka: Kliknij Start, aby zacząć.</div>
        )}
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
