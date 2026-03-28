import asyncio
import io
import logging
import os

import cv2
import numpy as np
from fastapi import APIRouter
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image

from config import VIDEO_INPUT_DIR
from mocks.smelter_mock import smelter_mock

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)


@router.get("/stream")
async def video_stream():
    """
    Serve MP4 from video_input/ for the browser <video> element (Smelter mock).

    MOCK:  Reads first .mp4 / .avi / .mov file from VIDEO_INPUT_DIR.
    REAL:  Replace with Smelter output stream URL or WHEP endpoint.
    """
    candidates = [
        os.path.join(VIDEO_INPUT_DIR, f)
        for f in os.listdir(VIDEO_INPUT_DIR)
        if f.lower().endswith((".mp4", ".avi", ".mov"))
    ]
    if candidates:
        path = max(candidates, key=os.path.getmtime)   # newest file
        return FileResponse(
            path,
            media_type="video/mp4",
            headers={
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            },
        )

    # No file — return animated MJPEG test pattern
    return StreamingResponse(
        _test_pattern_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/frame")
async def current_frame():
    """
    Returns the current camera frame as JPEG (used by depth model pipeline).

    MOCK:  Returns current frame from SmelterMock.
    REAL:  Capture frame from Smelter output pipeline.
    """
    frame = smelter_mock.get_current_frame()
    img = Image.fromarray(frame)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")


async def _test_pattern_generator():
    idx = 0
    while True:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        v = int((idx % 90) / 90 * 255)
        frame[:240, :320] = [v, 50, 50]
        frame[:240, 320:] = [50, v, 50]
        frame[240:, :320] = [50, 50, v]
        frame[240:, 320:] = [v, v, 50]
        cv2.putText(frame, "NO VIDEO FILE IN video_input/",
                    (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        _, jpeg = cv2.imencode(".jpg", cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
        idx += 1
        await asyncio.sleep(1 / 10)
