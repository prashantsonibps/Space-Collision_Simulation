import os
from typing import Any, Dict, Optional

import requests

from .utils import get_logger

logger = get_logger("worldlabs")

WORLDLABS_API_BASE = "https://api.worldlabs.ai"


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
    payload: Dict[str, Any] = {
        "display_name": display_name,
        "model": "Marble 0.1-mini",
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
        payload["seed"] = seed

    response = requests.post(
        f"{WORLDLABS_API_BASE}/marble/v1/worlds:generate",
        headers=worldlabs_headers(),
        json=payload,
        timeout=60,
    )
    if response.status_code >= 400:
        raise requests.HTTPError(
            f"{response.status_code} Client Error: {response.text}",
            response=response,
        )
    return response.json()


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
