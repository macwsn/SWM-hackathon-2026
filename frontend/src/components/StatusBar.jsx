/**
 * VisionAssist – StatusBar Component
 * Shows connection status, FPS, processing time, and detected objects count.
 */
const STATUS_CONFIG = {
  connected: { icon: '🟢', label: 'Połączono', className: 'status-connected' },
  reconnecting: { icon: '🟡', label: 'Łączenie...', className: 'status-reconnecting' },
  disconnected: { icon: '🔴', label: 'Rozłączono', className: 'status-disconnected' },
};

export default function StatusBar({ wsStatus, analysis, cameraActive }) {
  const statusCfg = STATUS_CONFIG[wsStatus] || STATUS_CONFIG.disconnected;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className={`status-indicator ${statusCfg.className}`}>
          {statusCfg.icon} {statusCfg.label}
        </span>
      </div>
      <div className="status-bar-center">
        {cameraActive && (
          <span className="status-camera-active">
            <span className="recording-dot"></span> LIVE
          </span>
        )}
      </div>
      <div className="status-bar-right">
        {analysis && (
          <>
            <span className="status-fps">{analysis.fps || 0} FPS</span>
            <span className="status-separator">│</span>
            <span className="status-time">{analysis.processing_time_ms || 0}ms</span>
            <span className="status-separator">│</span>
            <span className="status-objects">{analysis.obstacles?.length || 0} obj</span>
          </>
        )}
      </div>
    </div>
  );
}
