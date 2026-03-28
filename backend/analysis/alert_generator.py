"""
VisionAssist – Alert Generator
Generates human-readable Polish alert messages from obstacle detections.
"""

import logging

from config import config
from providers.base import Alert, Detection, Direction, Severity

logger = logging.getLogger(__name__)

# Polish translations for COCO class labels
LABEL_PL: dict[str, str] = {
    "person": "osoba",
    "bicycle": "rower",
    "car": "samochód",
    "motorcycle": "motocykl",
    "bus": "autobus",
    "truck": "ciężarówka",
    "traffic light": "sygnalizacja",
    "stop sign": "znak stop",
    "bench": "ławka",
    "chair": "krzesło",
    "dog": "pies",
    "cat": "kot",
    "backpack": "plecak",
    "umbrella": "parasol",
    "handbag": "torebka",
    "suitcase": "walizka",
    "bottle": "butelka",
    "cup": "kubek",
    "fire hydrant": "hydrant",
    "przeszkoda": "przeszkoda",
}

DIRECTION_PL: dict[Direction, str] = {
    Direction.LEFT: "po lewej",
    Direction.CENTER: "na wprost",
    Direction.RIGHT: "po prawej",
}

SEVERITY_PREFIX: dict[Severity, str] = {
    Severity.CRITICAL: "Uwaga!",
    Severity.WARNING: "Ostrożnie,",
    Severity.INFO: "",
}


class AlertGenerator:
    """Generates Polish alert messages from enriched detections."""

    def generate(self, detections: list[Detection]) -> list[Alert]:
        """
        Create alert messages from obstacle detections.

        Args:
            detections: Enriched detections with distance and severity.

        Returns:
            List of Alert objects, limited to max_alerts_per_cycle.
        """
        alerts: list[Alert] = []

        for det in detections[: config.alert.max_alerts_per_cycle]:
            if det.severity == Severity.INFO:
                continue

            label_pl = LABEL_PL.get(det.label, det.label)
            direction_pl = DIRECTION_PL.get(det.direction, "")
            prefix = SEVERITY_PREFIX.get(det.severity, "")

            # Build distance description
            distance_text = self._distance_text(det.distance)

            # Compose message
            parts = [p for p in [prefix, label_pl, direction_pl, distance_text] if p]
            text = " ".join(parts)

            priority = {Severity.CRITICAL: 0, Severity.WARNING: 1, Severity.INFO: 2}.get(
                det.severity, 2
            )

            alerts.append(Alert(text=text, severity=det.severity, priority=priority))

        return alerts

    @staticmethod
    def _distance_text(distance: float | None) -> str:
        """Convert metric depth to a human-readable distance phrase."""
        if distance is None:
            return ""
        return f"{distance:.1f} m"
