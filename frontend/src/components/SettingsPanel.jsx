/**
 * VisionAssist – SettingsPanel Component
 * Toggleable panel for app settings (TTS, depth overlay, etc.)
 */
export default function SettingsPanel({ isOpen, onClose, settings, onSettingsChange }) {
  if (!isOpen) return null;

  const handleToggle = (key) => {
    onSettingsChange({ ...settings, [key]: !settings[key] });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Ustawienia</h2>
          <button className="settings-close" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </div>

        <div className="settings-body">
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">🎧 Ping przestrzenny</span>
              <span className="setting-desc">Ostrzegaj pingiem zamiast mowy</span>
            </div>
            <button
              className={`setting-toggle ${settings.spatialAudioEnabled ? 'active' : ''}`}
              onClick={() => handleToggle('spatialAudioEnabled')}
              aria-label="Przełącz ping przestrzenny"
            >
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">🌈 Mapa głębi</span>
              <span className="setting-desc">Pokaż wizualizację głębi</span>
            </div>
            <button
              className={`setting-toggle ${settings.showDepth ? 'active' : ''}`}
              onClick={() => handleToggle('showDepth')}
              aria-label="Przełącz mapę głębi"
            >
              <span className="toggle-knob" />
            </button>
          </div>

          <div className="setting-item setting-item-column">
            <div className="setting-info">
              <span className="setting-label">🧭 Model głębi</span>
              <span className="setting-desc">Przełącz Indoor / Outdoor</span>
            </div>
            <div className="depth-mode-selector" role="group" aria-label="Wybór modelu głębi">
              <button
                className={`depth-mode-btn ${settings.depthMode === 'indoor' ? 'active' : ''}`}
                onClick={() => onSettingsChange({ ...settings, depthMode: 'indoor' })}
                aria-label="Wybierz model indoor"
              >
                Indoor
              </button>
              <button
                className={`depth-mode-btn ${settings.depthMode === 'outdoor' ? 'active' : ''}`}
                onClick={() => onSettingsChange({ ...settings, depthMode: 'outdoor' })}
                aria-label="Wybierz model outdoor"
              >
                Outdoor
              </button>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">📳 Wibracje</span>
              <span className="setting-desc">Haptyczny feedback przy zagrożeniu</span>
            </div>
            <button
              className={`setting-toggle ${settings.vibrationEnabled ? 'active' : ''}`}
              onClick={() => handleToggle('vibrationEnabled')}
              aria-label="Przełącz wibracje"
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-footer">
          <p>VisionAssist v0.1.0</p>
        </div>
      </div>
    </div>
  );
}
