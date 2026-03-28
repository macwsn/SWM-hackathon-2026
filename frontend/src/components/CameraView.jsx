/**
 * VisionAssist – CameraView Component
 * Displays camera feed with detection overlay and depth map visualization.
 */
import { useRef, useEffect } from 'react';

const SEVERITY_COLORS = {
  CRITICAL: '#ff3b5c',
  WARNING: '#ffb340',
  INFO: '#40c4ff',
};

export default function CameraView({
  videoRef,
  isActive,
  analysis,
  showDepth,
  onFrameCapture,
}) {
  const canvasRef = useRef(null);
  const depthImgRef = useRef(null);
  const captureInterval = useRef(null);

  const showDepthPanel = showDepth && Boolean(analysis?.depth_map);

  // Capture frames from video and send to backend
  useEffect(() => {
    if (!isActive || !onFrameCapture) return;

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    captureInterval.current = setInterval(() => {
      const vid = videoRef.current;
      if (vid && vid.readyState >= 2) {
        ctx.drawImage(vid, 0, 0, 480, 360);
        const base64 = canvas.toDataURL('image/jpeg', 0.5);
        onFrameCapture(base64);
      }
    }, 150); // ~7 FPS capture rate for better stability

    return () => {
      if (captureInterval.current) clearInterval(captureInterval.current);
    };
  }, [isActive, videoRef, onFrameCapture]);

  // Draw detection overlays
  useEffect(() => {
    if (!canvasRef.current || !analysis?.obstacles) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    if (!video) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

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
  }, [analysis, videoRef]);

  return (
    <div className={`camera-view ${showDepthPanel ? 'camera-view-split' : ''}`}>
      <div className="camera-panel">
        <video ref={videoRef} autoPlay playsInline muted className="camera-video" />

        <canvas ref={canvasRef} className="detection-overlay" />

        {!isActive && (
          <div className="camera-placeholder">
            <div className="camera-placeholder-icon">📷</div>
            <p>Kliknij "Start" aby uruchomić kamerę</p>
          </div>
        )}
      </div>

      {showDepthPanel && (
        <div className="depth-panel">
          <img
            ref={depthImgRef}
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
