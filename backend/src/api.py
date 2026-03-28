import os
import re
import threading
import time
from datetime import datetime
from enum import Enum
from typing import Optional, List

import weave
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import firestore
from pydantic import BaseModel
from contextlib import asynccontextmanager

from .db import initialize_db
from .main import run_pipeline
from .prompt_builder import build_satellite_prompt
from .worldlabs import generate_world, get_operation, get_world

def pipeline_loop():
    """Runs the ingestion pipeline repeatedly in the background."""
    while True:
        try:
            run_pipeline()
        except Exception as e:
            print(f"Background pipeline encountered an error: {e}")
        # Wait 5 minutes between runs
        time.sleep(300)

def _init_weave_if_configured() -> None:
    """Initialize Weave tracing for the API process if WANDB_API_KEY is set."""
    project = "spaceguard-orbital-risk"
    api_key = (os.getenv("WANDB_API_KEY") or "").strip()
    if not api_key:
        print("ℹ Weave/W&B tracing disabled for API (WANDB_API_KEY not set).")
        return
    try:
        weave.init(project)
        print(f"✅ Weave tracing initialized for API project '{project}'.")
    except Exception as exc:
        print(f"⚠ Weave init failed in API (non-fatal): {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context used as the parent Weave trace for the live backend.

    This is where the ingestion pipeline is started; nested Weave
    ops from the orbital physics engine and scenario analyst will appear beneath
    this context in the Weights & Biases dashboard.
    """
    _init_weave_if_configured()

    print("Starting background data ingestion pipeline...")
    thread = threading.Thread(target=pipeline_loop, daemon=True)
    thread.start()

    yield
    print("Shutting down API...")


app = FastAPI(title="SpaceGuard Simulation API", lifespan=lifespan)

# CORS: Use CORS_ORIGINS env (comma-separated) or allow all for local dev
_cors_origins = os.getenv("CORS_ORIGINS", "*")
if _cors_origins == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in _cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firestore
db = initialize_db()

# Models
from .matching_engine import OrderOutcome, OrderAction, OrderStatus, place_order_transaction

class OrderRequest(BaseModel):
    user_id: str
    market_id: str
    outcome: OrderOutcome
    action: OrderAction
    price_cents: int
    quantity: int

class ResolveRequest(BaseModel):
    outcome: OrderOutcome

class WorldSimulationRequest(BaseModel):
    event: dict
    branch: dict
    rerun: bool = False

class WorldSimulationStartResponse(BaseModel):
    operation_id: str
    prompt: str
    display_name: str
    cached: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    expires_at: Optional[str] = None
    progress_status: Optional[str] = None
    progress_description: Optional[str] = None
    world_id: Optional[str] = None
    thumbnail_url: Optional[str] = None
    pano_url: Optional[str] = None
    splat_urls: Optional[List[str]] = None
    world_marble_url: Optional[str] = None
    caption: Optional[str] = None

class WorldSimulationStatusResponse(BaseModel):
    done: bool
    operation_id: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    expires_at: Optional[str] = None
    progress_status: Optional[str] = None
    progress_description: Optional[str] = None
    world_id: Optional[str] = None
    thumbnail_url: Optional[str] = None
    pano_url: Optional[str] = None
    splat_urls: Optional[List[str]] = None
    world_marble_url: Optional[str] = None
    caption: Optional[str] = None
    raw_operation: dict


def _sanitize_doc_id(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("_") or "default"


def _simulation_doc_id(event_id: str, branch_id: str) -> str:
    return f"{_sanitize_doc_id(event_id)}__{_sanitize_doc_id(branch_id)}"


def _simulation_payload(
    *,
    event_id: str,
    branch_id: str,
    display_name: str,
    prompt: str,
    operation_id: str,
    done: bool,
    world_id: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    pano_url: Optional[str] = None,
    splat_urls: Optional[List[str]] = None,
    world_marble_url: Optional[str] = None,
    caption: Optional[str] = None,
) -> dict:
    return {
        "event_id": event_id,
        "branch_id": branch_id,
        "display_name": display_name,
        "prompt": prompt,
        "operation_id": operation_id,
        "done": done,
        "world_id": world_id,
        "thumbnail_url": thumbnail_url,
        "pano_url": pano_url,
        "splat_urls": splat_urls or [],
        "world_marble_url": world_marble_url,
        "caption": caption,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


def _get_cached_simulation(event_id: str, branch_id: str) -> Optional[dict]:
    doc = db.collection("world_simulations").document(_simulation_doc_id(event_id, branch_id)).get()
    if not doc.exists:
        return None
    return doc.to_dict()


def _save_cached_simulation(data: dict) -> None:
    event_id = str(data["event_id"])
    branch_id = str(data["branch_id"])
    db.collection("world_simulations").document(_simulation_doc_id(event_id, branch_id)).set(data, merge=True)


def _normalize_splat_urls(value) -> list[str]:
    if isinstance(value, dict):
        return [url for url in value.values() if isinstance(url, str)]
    if isinstance(value, list):
        return [url for url in value if isinstance(url, str)]
    return []

@app.get("/")
def read_root():
    return {"message": "Welcome to SpaceGuard Simulation API"}

@app.post("/simulation/worlds/generate", response_model=WorldSimulationStartResponse)
def start_world_simulation(req: WorldSimulationRequest):
    event_id = str(req.event.get("id") or req.event.get("asset_id") or req.event.get("asset_name") or "event")
    branch_id = str(req.branch.get("id") or req.branch.get("label") or "branch")
    cached = _get_cached_simulation(event_id, branch_id)
    if cached and cached.get("done") and not req.rerun:
        return {
            "operation_id": cached.get("operation_id", ""),
            "prompt": cached.get("prompt", ""),
            "display_name": cached.get("display_name", ""),
            "cached": True,
            "created_at": cached.get("created_at"),
            "updated_at": cached.get("updated_at"),
            "expires_at": cached.get("expires_at"),
            "progress_status": cached.get("progress_status"),
            "progress_description": cached.get("progress_description"),
            "world_id": cached.get("world_id"),
            "thumbnail_url": cached.get("thumbnail_url"),
            "pano_url": cached.get("pano_url"),
            "splat_urls": _normalize_splat_urls(cached.get("splat_urls")),
            "world_marble_url": cached.get("world_marble_url"),
            "caption": cached.get("caption"),
        }

    branch_label = req.branch.get("label", "Scenario Branch")
    event_name = req.event.get("name") or req.event.get("asset_name") or "Satellite Event"
    display_name = f"{event_name} - {branch_label}"
    prompt = build_satellite_prompt(req.event, req.branch)

    try:
        result = generate_world(display_name=display_name, prompt=prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    operation_id = result.get("operation_id") or result.get("id")
    progress = (result.get("metadata") or {}).get("progress") or {}
    if not operation_id:
        raise HTTPException(status_code=502, detail="World generation did not return an operation id.")

    payload = _simulation_payload(
        event_id=event_id,
        branch_id=branch_id,
        display_name=display_name,
        prompt=prompt,
        operation_id=operation_id,
        done=False,
    )
    _save_cached_simulation(payload)

    return {
        "operation_id": operation_id,
        "prompt": prompt,
        "display_name": display_name,
        "cached": False,
        "created_at": result.get("created_at"),
        "updated_at": result.get("updated_at"),
        "expires_at": result.get("expires_at"),
        "progress_status": progress.get("status"),
        "progress_description": progress.get("description"),
    }

@app.get("/simulation/worlds/cache")
def get_cached_world_simulation(event_id: str, branch_id: str):
    cached = _get_cached_simulation(event_id, branch_id)
    if not cached:
        raise HTTPException(status_code=404, detail="No cached simulation found.")
    return cached

@app.get("/simulation/worlds/operations/{operation_id}", response_model=WorldSimulationStatusResponse)
def get_world_simulation_status(operation_id: str):
    try:
        operation = get_operation(operation_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    done = bool(operation.get("done"))
    metadata = operation.get("metadata") or {}
    progress = metadata.get("progress") or {}
    if not done:
        return {
            "done": False,
            "operation_id": operation_id,
            "created_at": operation.get("created_at"),
            "updated_at": operation.get("updated_at"),
            "expires_at": operation.get("expires_at"),
            "progress_status": progress.get("status"),
            "progress_description": progress.get("description"),
            "world_id": metadata.get("world_id"),
            "raw_operation": operation,
        }

    response = operation.get("response") or {}
    world_id = (
        response.get("world_id")
        or response.get("id")
        or metadata.get("world_id")
    )
    if not world_id:
        return {
            "done": True,
            "operation_id": operation_id,
            "raw_operation": operation,
        }

    try:
        world = get_world(world_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    assets = world.get("assets") or {}
    imagery = assets.get("imagery") or {}
    splats = assets.get("splats") or {}
    thumbnail_url = world.get("thumbnail_url") or assets.get("thumbnail_url")
    world_marble_url = world.get("world_marble_url")
    caption = assets.get("caption")

    payload = {
        "done": True,
        "operation_id": operation_id,
        "created_at": operation.get("created_at"),
        "updated_at": operation.get("updated_at"),
        "expires_at": operation.get("expires_at"),
        "progress_status": progress.get("status"),
        "progress_description": progress.get("description"),
        "world_id": world_id,
        "thumbnail_url": thumbnail_url,
        "pano_url": imagery.get("pano_url"),
        "splat_urls": _normalize_splat_urls(splats.get("spz_urls")),
        "world_marble_url": world_marble_url,
        "caption": caption,
        "raw_operation": operation,
    }

    cache_query = db.collection("world_simulations").where("operation_id", "==", operation_id).limit(1)
    docs = list(cache_query.stream())
    if docs:
        existing = docs[0].to_dict()
        _save_cached_simulation(
            _simulation_payload(
                event_id=existing["event_id"],
                branch_id=existing["branch_id"],
                display_name=existing.get("display_name", ""),
                prompt=existing.get("prompt", ""),
                operation_id=operation_id,
                done=True,
                world_id=world_id,
                thumbnail_url=thumbnail_url,
                pano_url=imagery.get("pano_url"),
                splat_urls=_normalize_splat_urls(splats.get("spz_urls")),
                world_marble_url=world_marble_url,
                caption=caption,
            )
        )

    return payload

@app.post("/users/{user_id}/init")
def init_user(user_id: str):
    """Initialize a new user with starting balance if they don't exist."""
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    
    if user_doc.exists:
        return user_doc.to_dict()
    
    new_user = {
        "id": user_id,
        "balance": 10000.0, # Start with $10k fake USD
        "created_at": datetime.now()
    }
    user_ref.set(new_user)
    return new_user

@app.get("/users/{user_id}")
def get_user(user_id: str):
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
        
    return user_doc.to_dict()

@app.post("/orders")
def create_order(req: OrderRequest):
    """Place a limit order."""
    transaction = db.transaction()
    try:
        result = place_order_transaction(
            transaction, db, req.user_id, req.market_id, 
            req.outcome.value, req.action.value, req.price_cents, req.quantity
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/orders/{user_id}")
def get_user_orders(user_id: str):
    orders_ref = db.collection('orders').where("user_id", "==", user_id).order_by("created_at", direction=firestore.Query.DESCENDING)
    docs = orders_ref.stream()
    return [doc.to_dict() for doc in docs]

@app.get("/portfolio/{user_id}")
def get_user_portfolio(user_id: str):
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
        
    pos_ref = db.collection('positions').where("user_id", "==", user_id)
    positions = [doc.to_dict() for doc in pos_ref.stream()]
    
    # Also fetch open orders to calculate locked cash
    from .matching_engine import get_available_balance
    orders_ref = db.collection('orders').where("user_id", "==", user_id).where("status", "==", OrderStatus.OPEN.value)
    open_orders = [doc.to_dict() for doc in orders_ref.stream()]
    
    avail_cash = get_available_balance(user_doc.to_dict(), open_orders)
    
    return {
        "user": user_doc.to_dict(),
        "available_balance": avail_cash,
        "positions": positions,
        "open_orders": open_orders
    }

@app.get("/markets/{market_id}/orderbook")
def get_orderbook(market_id: str):
    orders_ref = db.collection('orders').where("market_id", "==", market_id).where("status", "==", OrderStatus.OPEN.value)
    open_orders = [doc.to_dict() for doc in orders_ref.stream()]
    
    book = {
        "YES_BUY": {}, "YES_SELL": {},
        "NO_BUY": {}, "NO_SELL": {}
    }
    for o in open_orders:
        key = f"{o['outcome']}_{o['action']}"
        p = o['price_cents']
        qty = o['quantity'] - o['filled']
        if qty > 0:
            book[key][p] = book[key].get(p, 0) + qty
            
    result = {}
    for k, v in book.items():
        rev = "BUY" in k
        arr = [{"price_cents": price, "quantity": qty} for price, qty in v.items()]
        arr.sort(key=lambda x: x['price_cents'], reverse=rev)
        result[k] = arr
        
    return result

@app.post("/markets/{market_id}/resolve")
def resolve_market(market_id: str, req: ResolveRequest):
    """Admin endpoint to resolve a market and pay out winning shares."""
    pos_ref = db.collection('positions').where("market_id", "==", market_id)
    positions = [doc.to_dict() for doc in pos_ref.stream()]
    
    orders_ref = db.collection('orders').where("market_id", "==", market_id).where("status", "==", OrderStatus.OPEN.value)
    
    batch = db.batch()
    for doc in orders_ref.stream():
        batch.update(doc.reference, {"status": OrderStatus.CANCELLED.value})
        
    for pos in positions:
        user_id = pos['user_id']
        yes_qty = pos.get('yes_shares', 0)
        no_qty = pos.get('no_shares', 0)
        
        payout_cents = 0
        if req.outcome.value == "YES":
            payout_cents = yes_qty * 100
        else:
            payout_cents = no_qty * 100
            
        if payout_cents > 0:
            user_ref = db.collection('users').document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                current_balance = user_doc.to_dict().get('balance', 0)
                batch.update(user_ref, {"balance": current_balance + (payout_cents / 100.0)})
                
        pos_doc_ref = db.collection('positions').document(f"{user_id}_{market_id}")
        batch.update(pos_doc_ref, {"yes_shares": 0, "no_shares": 0})
        
    batch.commit()
    return {"message": f"Market {market_id} resolved to {req.outcome.value}. Paid out {len(positions)} positions."}
