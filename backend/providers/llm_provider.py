"""
VisionAssist – LLM Provider (Future)
Placeholder for LLM-based scene description.
"""

from providers.base import LLMProvider, SceneContext


class PlaceholderLLMProvider(LLMProvider):
    """Placeholder – will be replaced with Gemini or other LLM."""

    async def describe_scene(self, context: SceneContext) -> str:
        # Generate a simple description from detections
        if not context.detections:
            return "Nie wykryto żadnych obiektów w scenie."

        objects = [d.label for d in context.detections]
        unique = list(set(objects))
        return f"W scenie wykryto: {', '.join(unique)}."
