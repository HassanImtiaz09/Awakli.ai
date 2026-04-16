"""
CLIP Inference Service — FastAPI wrapper around openai/clip-vit-base-patch32

Endpoints:
  POST /embed         — Get CLIP embedding for an image URL or text
  POST /similarity    — Cosine similarity between two images
  POST /batch-similarity — Compare one image against multiple references
  POST /safety        — NSFW/content safety classification
  GET  /health        — Health check with model status

The model is loaded once at startup and kept in memory.
All image downloads are cached for the duration of the request.
"""

import io
import os
import time
import hashlib
from typing import Optional
from contextlib import asynccontextmanager

import clip
import torch
import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import requests as http_requests

# ─── Global State ───────────────────────────────────────────────────────

MODEL = None
PREPROCESS = None
DEVICE = "cpu"
MODEL_NAME = "ViT-B/32"

# NSFW concept embeddings (computed at startup)
SAFETY_CONCEPTS = None

NSFW_TEXT_PROMPTS = [
    "a photo of nudity",
    "a photo of explicit sexual content",
    "a photo of pornography",
    "a photo of graphic violence",
    "a photo of gore",
    "a photo of a weapon pointed at the viewer",
    "a photo of self-harm",
    "a photo of child exploitation",
]

SAFE_TEXT_PROMPTS = [
    "a photo of a person",
    "a photo of an anime character",
    "a photo of a landscape",
    "a photo of a building",
    "a photo of food",
    "a photo of an animal",
    "a photo of artwork",
    "a photo of a cartoon",
]


# ─── Startup / Shutdown ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global MODEL, PREPROCESS, SAFETY_CONCEPTS
    print(f"[CLIP] Loading model {MODEL_NAME} on {DEVICE}...")
    start = time.time()
    MODEL, PREPROCESS = clip.load(MODEL_NAME, device=DEVICE)
    MODEL.eval()

    # Pre-compute safety concept embeddings
    nsfw_tokens = clip.tokenize(NSFW_TEXT_PROMPTS).to(DEVICE)
    safe_tokens = clip.tokenize(SAFE_TEXT_PROMPTS).to(DEVICE)
    with torch.no_grad():
        nsfw_embeds = MODEL.encode_text(nsfw_tokens)
        safe_embeds = MODEL.encode_text(safe_tokens)
        nsfw_embeds = nsfw_embeds / nsfw_embeds.norm(dim=-1, keepdim=True)
        safe_embeds = safe_embeds / safe_embeds.norm(dim=-1, keepdim=True)
    SAFETY_CONCEPTS = {
        "nsfw": nsfw_embeds.cpu().numpy(),
        "safe": safe_embeds.cpu().numpy(),
    }

    elapsed = time.time() - start
    print(f"[CLIP] Model loaded in {elapsed:.2f}s ({MODEL_NAME}, {DEVICE})")
    yield
    print("[CLIP] Shutting down...")


app = FastAPI(
    title="Awakli CLIP Inference Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Helpers ────────────────────────────────────────────────────────────

_image_cache: dict[str, Image.Image] = {}


def _download_image(url: str) -> Image.Image:
    """Download and cache an image from a URL."""
    cache_key = hashlib.md5(url.encode()).hexdigest()
    if cache_key in _image_cache:
        return _image_cache[cache_key]

    try:
        resp = http_requests.get(url, timeout=15, stream=True)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        _image_cache[cache_key] = img
        # Keep cache bounded
        if len(_image_cache) > 100:
            oldest = next(iter(_image_cache))
            del _image_cache[oldest]
        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download image: {str(e)}")


def _get_image_embedding(url: str) -> np.ndarray:
    """Get normalized CLIP embedding for an image URL."""
    img = _download_image(url)
    img_input = PREPROCESS(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        embedding = MODEL.encode_image(img_input)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding.cpu().numpy()[0]


def _get_text_embedding(text: str) -> np.ndarray:
    """Get normalized CLIP embedding for a text prompt."""
    tokens = clip.tokenize([text]).to(DEVICE)
    with torch.no_grad():
        embedding = MODEL.encode_text(tokens)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)
    return embedding.cpu().numpy()[0]


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two normalized vectors."""
    return float(np.dot(a, b))


# ─── Request/Response Models ───────────────────────────────────────────

class EmbedRequest(BaseModel):
    url: Optional[str] = Field(None, description="Image URL to embed")
    text: Optional[str] = Field(None, description="Text to embed")


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimension: int
    input_type: str  # "image" or "text"


class SimilarityRequest(BaseModel):
    image_url_a: str = Field(..., description="First image URL")
    image_url_b: str = Field(..., description="Second image URL")


class SimilarityResponse(BaseModel):
    similarity: float = Field(..., description="Cosine similarity [-1, 1]")
    score: int = Field(..., description="Mapped score [0-100]")


class BatchSimilarityRequest(BaseModel):
    target_url: str = Field(..., description="Target image URL to compare")
    reference_urls: list[str] = Field(..., description="Reference image URLs")


class BatchSimilarityResponse(BaseModel):
    similarities: list[float]
    max_similarity: float
    avg_similarity: float
    max_score: int
    avg_score: int


class TextSimilarityRequest(BaseModel):
    image_url: str = Field(..., description="Image URL")
    text: str = Field(..., description="Text description to compare")


class TextSimilarityResponse(BaseModel):
    similarity: float
    score: int


class SafetyRequest(BaseModel):
    image_url: str = Field(..., description="Image URL to check")


class SafetyResponse(BaseModel):
    is_safe: bool
    safety_score: float = Field(..., description="0-1, higher = safer")
    max_nsfw_similarity: float
    max_safe_similarity: float
    flagged_concepts: list[str]


class HealthResponse(BaseModel):
    status: str
    model: str
    device: str
    safety_concepts_loaded: bool


# ─── Endpoints ──────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if MODEL is not None else "loading",
        model=MODEL_NAME,
        device=DEVICE,
        safety_concepts_loaded=SAFETY_CONCEPTS is not None,
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    if not req.url and not req.text:
        raise HTTPException(status_code=400, detail="Either 'url' or 'text' must be provided")

    if req.url:
        emb = _get_image_embedding(req.url)
        return EmbedResponse(
            embedding=emb.tolist(),
            dimension=len(emb),
            input_type="image",
        )
    else:
        emb = _get_text_embedding(req.text)
        return EmbedResponse(
            embedding=emb.tolist(),
            dimension=len(emb),
            input_type="text",
        )


@app.post("/similarity", response_model=SimilarityResponse)
async def similarity(req: SimilarityRequest):
    emb_a = _get_image_embedding(req.image_url_a)
    emb_b = _get_image_embedding(req.image_url_b)
    sim = _cosine_similarity(emb_a, emb_b)
    # Map similarity to 0-100: >= 0.85 = 100, <= 0.50 = 0
    score = max(0, min(100, int(((sim - 0.50) / 0.35) * 100)))
    return SimilarityResponse(similarity=round(sim, 6), score=score)


@app.post("/batch-similarity", response_model=BatchSimilarityResponse)
async def batch_similarity(req: BatchSimilarityRequest):
    if not req.reference_urls:
        raise HTTPException(status_code=400, detail="At least one reference URL required")

    target_emb = _get_image_embedding(req.target_url)
    similarities = []

    for ref_url in req.reference_urls:
        ref_emb = _get_image_embedding(ref_url)
        sim = _cosine_similarity(target_emb, ref_emb)
        similarities.append(round(sim, 6))

    max_sim = max(similarities)
    avg_sim = sum(similarities) / len(similarities)

    def sim_to_score(s: float) -> int:
        return max(0, min(100, int(((s - 0.50) / 0.35) * 100)))

    return BatchSimilarityResponse(
        similarities=similarities,
        max_similarity=max_sim,
        avg_similarity=round(avg_sim, 6),
        max_score=sim_to_score(max_sim),
        avg_score=sim_to_score(avg_sim),
    )


@app.post("/text-similarity", response_model=TextSimilarityResponse)
async def text_similarity(req: TextSimilarityRequest):
    img_emb = _get_image_embedding(req.image_url)
    txt_emb = _get_text_embedding(req.text)
    sim = _cosine_similarity(img_emb, txt_emb)
    score = max(0, min(100, int(((sim - 0.15) / 0.25) * 100)))  # text-image range is lower
    return TextSimilarityResponse(similarity=round(sim, 6), score=score)


@app.post("/safety", response_model=SafetyResponse)
async def safety(req: SafetyRequest):
    if SAFETY_CONCEPTS is None:
        raise HTTPException(status_code=503, detail="Safety concepts not loaded yet")

    img_emb = _get_image_embedding(req.image_url)
    img_emb_tensor = img_emb.reshape(1, -1)

    # Compare against NSFW concepts
    nsfw_sims = np.dot(SAFETY_CONCEPTS["nsfw"], img_emb_tensor.T).flatten()
    safe_sims = np.dot(SAFETY_CONCEPTS["safe"], img_emb_tensor.T).flatten()

    max_nsfw = float(np.max(nsfw_sims))
    max_safe = float(np.max(safe_sims))

    # Flag concepts with high similarity
    flagged = []
    for i, sim in enumerate(nsfw_sims):
        if sim > 0.25:  # threshold for flagging
            flagged.append(NSFW_TEXT_PROMPTS[i].replace("a photo of ", ""))

    # Safety score: higher = safer
    # If max_nsfw > max_safe, likely unsafe
    safety_score = max(0.0, min(1.0, (max_safe - max_nsfw + 0.3) / 0.6))
    is_safe = safety_score > 0.4 and max_nsfw < 0.28

    return SafetyResponse(
        is_safe=is_safe,
        safety_score=round(safety_score, 4),
        max_nsfw_similarity=round(max_nsfw, 6),
        max_safe_similarity=round(max_safe, 6),
        flagged_concepts=flagged,
    )


# ─── Run ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("CLIP_SERVICE_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
