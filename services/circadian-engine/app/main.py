import os
import time
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()  # Load .env before any os.environ.get() calls
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .events import run_listener
from .logger import logger

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background tasks on startup."""
    run_listener()
    logger.info("Circadian engine started, listening for shift events")
    yield
    logger.info("Circadian engine shutting down")

app = FastAPI(title="NightFuel Circadian Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000)
    logger.info("Request processed", extra={
        "method": request.method,
        "url": str(request.url),
        "status_code": response.status_code,
        "duration_ms": duration_ms,
    })
    return response

app.include_router(router, prefix="/v1/circadian")
