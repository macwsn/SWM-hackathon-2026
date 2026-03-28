"""
VisionAssist – Obstacle Analyzer (Sector-Based)
Divided the view into vertical sectors to detect ANY obstacles, even those missed by YOLO.
Prioritizes raw depth analysis for safety.
"""

import logging
import time
from typing import List

import numpy as np

from config import config
from providers.base import Detection, Direction, Severity, UNKNOWN_OBSTACLE

logger = logging.getLogger(__name__)


class ObstacleAnalyzer:
    """
    Analyzes the image by vertical sectors (Left, Center, Right).
    Finds the closest point in each sector and uses YOLO for labeling if available.
    """

    def __init__(self):
        # Cooldown tracker: {label_direction: last_alert_timestamp}
        self._cooldowns: dict[str, float] = {}

    def analyze(
        self,
        depth_map: np.ndarray,
    ) -> List[Detection]:
        """
        Analyze the raw depth map by sectors.
        
        Args:
            depth_map: Metric depth map (H, W) in meters, lower = closer.

        Returns:
            List of obstacles detected in various sectors.
        """
        h, w = depth_map.shape[:2]
        
        # Divide into 3 sectors
        w1, w2 = w // 3, 2 * w // 3
        
        sector_bounds = [
            (0, w1, Direction.LEFT),
            (w1, w2, Direction.CENTER),
            (w2, w, Direction.RIGHT),
        ]
        
        obstacles: List[Detection] = []
        
        # We ignore the bottom 30% of the depth map which is usually the floor/ground
        # near the user's feet.
        crop_h = int(h * 0.7)
        
        for start_x, end_x, direction in sector_bounds:
            sector_depth = depth_map[:crop_h, start_x:end_x]
            if sector_depth.size == 0:
                continue
            
            # Use 5th percentile to find near obstacles while reducing single-pixel noise.
            min_p = float(np.percentile(sector_depth, 5))

            logger.debug(f"Sector {direction.value}: min_p={min_p:.2f}m")

            # Skip if the closest point is still too far.
            if min_p > config.alert.info_distance_m:
                continue
                
            # Determine severity
            severity = Severity.INFO
            if min_p <= config.alert.critical_distance_m:
                severity = Severity.CRITICAL
            elif min_p <= config.alert.warning_distance_m:
                severity = Severity.WARNING
            
            # Create generic obstacle entry
            obstacles.append(Detection(
                label=UNKNOWN_OBSTACLE,
                confidence=1.0,
                bbox=None,
                distance=min_p,
                direction=direction,
                severity=severity
            ))
            
        # Final sort: Critical first, then nearest first.
        severity_rank = {Severity.CRITICAL: 0, Severity.WARNING: 1, Severity.INFO: 2}
        obstacles.sort(key=lambda d: (severity_rank.get(d.severity, 3), d.distance or float("inf")))
        
        return obstacles

    def filter_cooldowns(self, detections: List[Detection]) -> List[Detection]:
        """Filter alerts by cooldown per sector/label."""
        now = time.time()
        filtered: List[Detection] = []

        for det in detections:
            key = f"{det.label}_{det.direction.value}"
            last_alert = self._cooldowns.get(key, 0.0)

            if now - last_alert >= config.alert.alert_cooldown:
                self._cooldowns[key] = now
                filtered.append(det)

        return filtered
