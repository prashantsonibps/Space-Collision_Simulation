import os
from pathlib import Path
from typing import Any, Dict

import requests
from dotenv import load_dotenv

from .utils import get_logger

logger = get_logger("prompt_builder")

_backend_dir = Path(__file__).resolve().parents[1]
load_dotenv(_backend_dir / ".env")
load_dotenv()


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
        f"Photoreal low Earth orbit collision-operations scene centered on {event_name} and "
        f"{counterpart}. Show the '{branch_label}' branch as a real in-progress LEO event, not a "
        f"posed hero shot. Include a clear Earth limb with atmosphere, sunlight from one direction, "
        f"hard orbital shadows, sparse stars in deep black space, and realistic spacecraft scale. "
        f"Focus on separation geometry, relative motion, and credible orbital positioning. Branch "
        f"intent: {summary} {recommendation} Target miss distance: {miss_distance} km. Collision "
        f"probability: {collision_probability}. Fuel cost: {fuel_cost} kg. Mission delay: {delay} "
        f"minutes. No text in scene, no HUD, no fantasy, no extra planets, no exaggerated nebulae, "
        f"no cartoon styling. Make it look like premium aerospace simulation imagery."
    )

    if not _gemini_api_key():
        logger.info("Gemini prompt refinement skipped because GEMINI_API_KEY is missing.")
        return base_prompt

    try:
        response = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            headers={
                "x-goog-api-key": _gemini_api_key(),
                "Content-Type": "application/json",
            },
            json={
                "system_instruction": {
                    "parts": [
                        {
                            "text": (
                                "You write premium visual prompts for world-generation systems. "
                                "Your prompts should produce realistic, technically grounded orbital "
                                "scenes with physically plausible spacecraft scale, LEO lighting, "
                                "clear Earth atmosphere, sunlight, stars, and ongoing motion. "
                                "Avoid fantasy, concept-art language, cinematic fluff, or any UI "
                                "elements baked into the scene."
                            )
                        }
                    ]
                },
                "contents": [
                    {
                        "parts": [
                            {
                                "text": (
                                    "Rewrite this into a concise premium-quality world-generation prompt. "
                                    "Keep it under 120 words. Prioritize realistic LEO motion, clear Earth "
                                    "limb, sunlight direction, sparse star background, premium spacecraft "
                                    "detail, and a sense that an orbital event is actively unfolding. Avoid "
                                    "generic cinematic wording and avoid text overlays or HUDs:\n\n"
                                    f"{base_prompt}"
                                )
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.7,
                    "topP": 0.9,
                    "maxOutputTokens": 180,
                },
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
        if candidate:
            logger.info("Gemini prompt refinement succeeded.")
            return candidate
        logger.warning("Gemini returned an empty prompt; using base prompt.")
        return base_prompt
    except Exception as exc:
        logger.warning(f"Gemini prompt refinement failed; using base prompt: {exc}")
        return base_prompt
