"""
MOCK: Smelter video stream.

REAL DATA EXPECTED (to replace this module):
- Smelter receives RTMP/WHIP stream from user's phone camera
- Frames are H x W x 3 RGB numpy arrays at the camera framerate
- Resolution: typically 1280x720 or 1920x1080

TO ENABLE REAL SMELTER:
1. Start Smelter server:
   docker run -p 8090:8090 ghcr.io/software-mansion/smelter
2. Configure input stream (RTMP from phone) via Smelter HTTP API
3. Read frames from Smelter output stream instead of MP4 file
4. Replace get_current_frame() with Smelter frame capture

SETUP (mock):
- Place any .mp4 / .avi / .mov file in the video_input/ folder
- The mock loops the video and provides frames to the depth model
"""

import asyncio
import logging
import os
import numpy as np
import cv2
from config import VIDEO_INPUT_DIR

logger = logging.getLogger(__name__)


class SmelterMock:
    def __init__(self):
        self._current_frame: np.ndarray | None = None

    def get_current_frame(self) -> np.ndarray:
        if self._current_frame is None:
            return self._generate_test_pattern()
        return self._current_frame

    def _newest_video(self) -> str | None:
        """Returns path to the most recently modified video file, or None."""
        candidates = [
            os.path.join(VIDEO_INPUT_DIR, f)
            for f in os.listdir(VIDEO_INPUT_DIR)
            if f.lower().endswith((".mp4", ".avi", ".mov"))
        ]
        if not candidates:
            return None
        return max(candidates, key=os.path.getmtime)

    async def run(self):
        while True:
            video_path = self._newest_video()
            if not video_path:
                logger.warning("[Smelter mock] No video file in video_input/. Using test pattern.")
                self._current_frame = self._generate_test_pattern()
                await asyncio.sleep(0.1)
                continue

            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            frame_delay = 1.0 / fps
            logger.info(f"[Smelter mock] Playing {os.path.basename(video_path)} at {fps:.1f} FPS")

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                self._current_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                # Stop early if a newer file appeared
                if self._newest_video() != video_path:
                    logger.info("[Smelter mock] New video detected — switching.")
                    break
                await asyncio.sleep(frame_delay)

            cap.release()

    def _generate_test_pattern(self) -> np.ndarray:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:240, :320] = [200, 50, 50]
        frame[:240, 320:] = [50, 200, 50]
        frame[240:, :320] = [50, 50, 200]
        frame[240:, 320:] = [200, 200, 50]
        cv2.putText(
            frame, "NO VIDEO IN video_input/",
            (60, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2
        )
        return frame


smelter_mock = SmelterMock()
