"""
Obstacle detection based on metric depth map.

Detection logic:
- Focuses on the centre-forward region of the frame (user's walking path).
- Uses the 5th-percentile depth value to ignore noise/sensor artefacts.
- Alerts are throttled to once every MIN_ALERT_INTERVAL seconds.
"""

import time
import numpy as np
from config import OBSTACLE_THRESHOLD_INDOOR, OBSTACLE_THRESHOLD_OUTDOOR


class ObstacleDetector:
    MIN_ALERT_INTERVAL = 2.0  # seconds — matches UI "max every 2 seconds" requirement

    def __init__(self):
        self._last_alert_time = 0.0

    def detect(
        self, depth_map: np.ndarray, is_indoor: bool = False
    ) -> tuple[bool, float]:
        """
        Returns (obstacle_detected, closest_distance_m).

        Analyses centre 60% width × bottom 90% height of the depth map
        (the region most relevant to a forward-facing pedestrian camera).
        """
        h, w = depth_map.shape
        mw = int(w * 0.2)
        mh = int(h * 0.1)
        region = depth_map[mh:, mw : w - mw]

        min_dist = float(np.percentile(region, 5))
        threshold = OBSTACLE_THRESHOLD_INDOOR if is_indoor else OBSTACLE_THRESHOLD_OUTDOOR
        return min_dist < threshold, min_dist

    def should_alert(self) -> bool:
        now = time.time()
        if now - self._last_alert_time >= self.MIN_ALERT_INTERVAL:
            self._last_alert_time = now
            return True
        return False

    @staticmethod
    def format_alert(min_dist: float, is_indoor: bool) -> str:
        env = "wewnątrz" if is_indoor else "na zewnątrz"
        return f"UWAGA! Przeszkoda w odległości {min_dist:.1f} metrów. Jesteś {env}."


obstacle_detector = ObstacleDetector()
