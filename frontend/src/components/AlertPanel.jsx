/**
 * VisionAssist – AlertPanel Component
 * Displays current alerts with severity-based styling and animations.
 */
const SEVERITY_CONFIG = {
  CRITICAL: { icon: '🔴', className: 'alert-critical', label: 'Krytyczny' },
  WARNING: { icon: '🟡', className: 'alert-warning', label: 'Ostrzeżenie' },
  INFO: { icon: '🔵', className: 'alert-info', label: 'Informacja' },
};

export default function AlertPanel({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="alert-panel alert-panel-empty">
        <div className="alert-safe">
          <span className="alert-safe-icon">✅</span>
          <span>Droga wolna</span>
        </div>
      </div>
    );
  }

  return (
    <div className="alert-panel">
      {alerts.map((alert, index) => {
        const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.INFO;
        return (
          <div
            key={`${alert.text}-${index}`}
            className={`alert-item ${config.className}`}
          >
            <span className="alert-icon">{config.icon}</span>
            <span className="alert-text">{alert.text}</span>
          </div>
        );
      })}
    </div>
  );
}
