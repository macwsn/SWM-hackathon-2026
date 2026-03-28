"""
VisionAssist – Abstract Provider Interfaces
Pluggable architecture: swap any provider without changing the rest of the code.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class Severity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class Direction(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


@dataclass
class Detection:
    """A single detected object or generic obstacle."""
    label: str
    confidence: float
    bbox: tuple[int, int, int, int] | None = None  # x1, y1, x2, y2
    distance: float | None = None     # Metric distance in meters (smaller = closer)
    direction: Direction = Direction.CENTER
    severity: Severity = Severity.INFO

UNKNOWN_OBSTACLE = "przeszkoda"
    
@dataclass
class SectorAnalysis:
    """Analysis result for a vertical slab of the view."""
    direction: Direction
    max_depth: float
    detection: Detection | None = None


@dataclass
class Alert:
    """A human-readable alert message."""
    text: str
    severity: Severity
    priority: int  # Lower = higher priority


@dataclass
class SceneContext:
    """Context for scene description (future use)."""
    detections: list[Detection] = field(default_factory=list)
    depth_map: np.ndarray | None = None
    frame: np.ndarray | None = None
    gps_location: tuple[float, float] | None = None


@dataclass
class AnalysisResult:
    """Complete analysis result for a single frame."""
    obstacles: list[Detection] = field(default_factory=list)
    alerts: list[Alert] = field(default_factory=list)
    depth_map: np.ndarray | None = None
    fps: float = 0.0
    timestamp: float = 0.0


# ── Abstract Providers ──────────────────────────────────────────────────


class DepthProvider(ABC):
    """Interface for depth estimation models."""

    @abstractmethod
    def load_model(self) -> None:
        """Load the model into memory."""
        ...

    @abstractmethod
    def estimate_depth(self, frame: np.ndarray) -> np.ndarray:
        """
        Estimate depth from a single RGB frame.
        Returns: depth map as numpy array in meters (smaller = closer).
        """
        ...


class DetectionProvider(ABC):
    """Interface for object detection models."""

    @abstractmethod
    def load_model(self) -> None:
        """Load the model into memory."""
        ...

    @abstractmethod
    def detect(self, frame: np.ndarray) -> list[Detection]:
        """
        Detect objects in a single RGB frame.
        Returns: list of Detection objects.
        """
        ...


class TTSProvider(ABC):
    """Interface for text-to-speech synthesis."""

    @abstractmethod
    def synthesize(self, text: str, lang: str = "pl") -> bytes | str:
        """
        Convert text to speech.
        Returns: audio bytes (WAV) or text string (for client-side TTS).
        """
        ...


class LLMProvider(ABC):
    """Interface for LLM-based scene description (future)."""

    @abstractmethod
    async def describe_scene(self, context: SceneContext) -> str:
        """
        Generate a natural language description of the scene.
        Returns: description string.
        """
        ...
