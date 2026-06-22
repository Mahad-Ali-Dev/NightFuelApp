import time
import traceback
from dotenv import load_dotenv
load_dotenv()  # Populate os.environ from .env BEFORE any other imports read it

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import get_settings
from .routes import router
from .logger import logger
from .cache import init_semantic_cache
from .rate_limiter import RateLimitExceeded
from contextlib import asynccontextmanager

settings = get_settings()
ALLOWED_ORIGINS = settings.ALLOWED_ORIGINS.split(",")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Semantic Caching
    init_semantic_cache()
    yield
    # Shutdown

app = FastAPI(title="Zeitra AI Pipeline", lifespan=lifespan)

from fastapi.exceptions import RequestValidationError


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    # Exact contract: HTTP 429 with body {error, retryAfterSeconds}.
    # Coerce retry_after to a plain int rather than reading it straight off the
    # exception into the response: it severs CodeQL's exception->response taint
    # flow (py/stack-trace-exposure) and is defensively correct — the body is a
    # fixed string + a bare integer, never any exception/traceback text.
    retry_after = int(getattr(exc, "retry_after_seconds", 0) or 0)
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded. Please slow down and try again later.",
            "retryAfterSeconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, RequestValidationError):
        logger.error(f"Validation Error: {exc}")
        return JSONResponse(status_code=422, content={"detail": exc.errors()})
    # Security: never reflect the exception message or traceback on the wire.
    # The full traceback is logged server-side only; the client gets a fixed,
    # redacted body — matching the TS services' redaction posture.
    tb = traceback.format_exc()
    logger.error(f"Unhandled exception: {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

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

app.include_router(router, prefix="/v1/ai")
