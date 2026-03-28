/**
 * VisionAssist – GuardianCameraView Component
 * Displays remote camera feed with detection overlay and depth map visualization.
 */
import { useRef, useEffect } from 'react';

const SEVERITY_COLORS = {
  CRITICAL: '#ff3b5c',
  WARNING: '#ffb340',
  INFO: '#40c4ff',
};

export default function GuardianCameraView({
  lastFrame,
  isActive,
  analysis,
  showDepth,
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const showDepthPanel = showDepth && Boolean(analysis?.depth_map);

  // Draw detection overlays
  useEffect(() => {
    if (!canvasRef.current || !analysis?.obstacles || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;

    // Use a default size if naturalWidth is 0
    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale factors (detections are for 640x480)
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    for (const obs of analysis.obstacles) {
      const color = SEVERITY_COLORS[obs.severity] || '#40c4ff';
      const label = `${obs.label} ${obs.distance ? `${obs.distance.toFixed(1)} m` : ''}`;

      if (obs.bbox) {
        const [x1, y1, x2, y2] = obs.bbox;
        const sx = x1 * scaleX;
        const sy = y1 * scaleY;
        const sw = (x2 - x1) * scaleX;
        const sh = (y2 - y1) * scaleY;

        // Bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(sx, sy, sw, sh);

        // Label background
        ctx.font = 'bold 14px Inter, sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(sx, sy - 24, textWidth + 12, 22);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#000';
        ctx.fillText(label, sx + 6, sy - 8);
      } else {
        // Render sector highlighted without bbox
        const sectorWidth = canvas.width / 3;
        let sx = 0;
        if (obs.direction === 'center') sx = sectorWidth;
        if (obs.direction === 'right') sx = sectorWidth * 2;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.fillRect(sx, 0, sectorWidth, canvas.height);
        
        ctx.globalAlpha = 0.85;
        ctx.fillRect(sx, canvas.height - 40, sectorWidth, 30);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, sx + sectorWidth / 2, canvas.height - 20);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1.0;
      }
    }
  }, [analysis, lastFrame]);

  return (
    <div className={`camera-view ${showDepthPanel ? 'camera-view-split' : ''}`}>
      <div className="camera-panel">
        {lastFrame ? (
          <img
            ref={imgRef}
            src={lastFrame}
            alt="Strumień kamery użytkownika"
            className="camera-video"
          />
        ) : (
          <div className="camera-placeholder" style={{ backgroundColor: '#000', width: '100%', height: '100%' }}>
          </div>
        )}

        <canvas ref={canvasRef} className="detection-overlay" />

        {!isActive && !lastFrame && (
          <div className="camera-placeholder">
            <div className="camera-placeholder-icon">👁️</div>
            <p>Oczekuję na wideo od Użytkownika...</p>
          </div>
        )}
      </div>

      {showDepthPanel && (
        <div className="depth-panel">
          <img
            src={analysis.depth_map}
            alt="Mapa głębi"
            className="depth-heatmap"
          />
          <div className="depth-metrics">
            <div className="depth-metric-item">
              <span className="depth-metric-label">Najbliżej</span>
              <strong>
                {typeof analysis.depth_min_m === 'number' ? analysis.depth_min_m.toFixed(2) : '--'} m
              </strong>
            </div>
            <div className="depth-metric-item">
              <span className="depth-metric-label">Najdalej</span>
              <strong>
                {typeof analysis.depth_max_m === 'number' ? analysis.depth_max_m.toFixed(2) : '--'} m
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
