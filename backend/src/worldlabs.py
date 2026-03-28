import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from dotenv import load_dotenv

from .utils import get_logger

logger = get_logger("worldlabs")

WORLDLABS_API_BASE = "https://api.worldlabs.ai"

_backend_dir = Path(__file__).resolve().parents[1]
load_dotenv(_backend_dir / ".env")
load_dotenv()


def get_worldlabs_api_key() -> str:
    api_key = (os.getenv("WORLDLABS_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "WORLDLABS_API_KEY is not set. Add it to backend/.env to enable world generation."
        )
    return api_key


def worldlabs_headers() -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "WLT-Api-Key": get_worldlabs_api_key(),
    }


def generate_world(
    *,
    display_name: str,
    prompt: str,
    seed: Optional[int] = None,
    tags: Optional[list[str]] = None,
) -> Dict[str, Any]:
    base_payload: Dict[str, Any] = {
        "display_name": display_name,
        "tags": tags or ["spaceguard", "satellite", "simulation"],
        "permission": {
            "public": False,
            "allowed_readers": [],
            "allowed_writers": [],
        },
        "world_prompt": {
            "type": "text",
            "text_prompt": prompt,
            "disable_recaption": True,
        },
    }

    if seed is not None:
        base_payload["seed"] = seed

    models_to_try = ["Marble 0.1-plus", "Marble 0.1-mini"]
    last_error: Optional[requests.HTTPError] = None

    for model_name in models_to_try:
        payload = {**base_payload, "model": model_name}
        response = requests.post(
            f"{WORLDLABS_API_BASE}/marble/v1/worlds:generate",
            headers=worldlabs_headers(),
            json=payload,
            timeout=60,
        )
        if response.status_code < 400:
            data = response.json()
            data["model_used"] = model_name
            if model_name != models_to_try[0]:
                logger.warning(f"World Labs fallback succeeded with {model_name}")
            return data

        error = requests.HTTPError(
            f"{response.status_code} Client Error: {response.text}",
            response=response,
        )
        last_error = error

        should_try_fallback = (
            model_name == "Marble 0.1-plus"
            and response.status_code == 402
            and "insufficient credits" in response.text.lower()
        )
        if should_try_fallback:
            logger.warning("World Labs Marble 0.1-plus unavailable due to credits; retrying with Marble 0.1-mini")
            continue

        raise error

    if last_error is not None:
        raise last_error
    raise RuntimeError("World generation failed without a response.")


def get_operation(operation_id: str) -> Dict[str, Any]:
    response = requests.get(
        f"{WORLDLABS_API_BASE}/marble/v1/operations/{operation_id}",
        headers=worldlabs_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def get_world(world_id: str) -> Dict[str, Any]:
    response = requests.get(
        f"{WORLDLABS_API_BASE}/marble/v1/worlds/{world_id}",
        headers=worldlabs_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
