import os
from typing import Any, Dict

import requests

from .utils import get_logger

logger = get_logger("prompt_builder")


def _gemini_api_key() -> str:
    return (os.getenv("GEMINI_API_KEY") or "").strip()


def build_satellite_prompt(event: Dict[str, Any], branch: Dict[str, Any]) -> str:
    event_name = event.get("name") or event.get("asset_name") or "tracked satellite"
    counterpart = event.get("secondary_name") or "orbital debris"
    risk_level = event.get("risk_level") or "UNKNOWN"
    branch_label = branch.get("label") or "Scenario Branch"
    summary = branch.get("summary") or "Compare future outcomes for this branch."
    recommendation = branch.get("recommendation") or ""

    metrics = branch.get("metrics") or {}
    miss_distance = metrics.get("missDistanceKm", "unknown")
    collision_probability = metrics.get("collisionProbability", "unknown")
    fuel_cost = metrics.get("fuelCostKg", "unknown")
    delay = metrics.get("scheduleDelayMin", "unknown")

    base_prompt = (
        f"A cinematic near-future orbital operations visualization centered on {event_name} "
        f"and {counterpart}. Show the '{branch_label}' branch of a satellite collision-avoidance "
        f"simulation. The current risk level is {risk_level}. Visualize Earth from orbit, the "
        f"satellite trajectory, nearby debris tracks, mission control overlays, and a clear sense "
        f"of branching future outcomes. This branch is described as: {summary} {recommendation} "
        f"Target simulated miss distance: {miss_distance} km. Target collision probability: "
        f"{collision_probability}. Fuel cost: {fuel_cost} kg. Mission delay: {delay} minutes. "
        "The style should feel credible, technical, high-stakes, and world-model-driven rather "
        "than sci-fi fantasy."
    )

    if not _gemini_api_key():
        return base_prompt

    try:
        response = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            params={"key": _gemini_api_key()},
            json={
                "contents": [
                    {
                        "parts": [
                            {
                                "text": (
                                    "Rewrite this into a concise, high-quality visual world-generation prompt "
                                    "for an orbital simulation scene. Keep it under 140 words, preserve the "
                                    "technical details, and avoid fantasy language:\n\n"
                                    f"{base_prompt}"
                                )
                            }
                        ]
                    }
                ]
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        candidate = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )
        return candidate or base_prompt
    except Exception as exc:
        logger.warning(f"Gemini prompt refinement failed; using base prompt: {exc}")
        return base_prompt
