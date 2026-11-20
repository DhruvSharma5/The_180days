import asyncio
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
from starlette.middleware.cors import CORSMiddleware


logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("180days")

ROOT_DIR = Path(__file__).parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

from lib.observability import log_event, safe_stack_frames

_REQUIRED_ENV = ("MONGO_URL", "DB_NAME", "JWT_SECRET")
_missing_env = [name for name in _REQUIRED_ENV if not os.environ.get(name, "").strip()]
if _missing_env:
    log_event(
        logger,
        logging.ERROR,
        "startup.missing_configuration",
        missing_variables=_missing_env,
    )
    raise RuntimeError("Missing required application configuration")

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    app.state.index_task.cancel()  # stop a build still running before its client closes
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    await client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(PyMongoError)
async def handle_database_error(request: Request, exc: PyMongoError):
    request_id = getattr(request.state, "request_id", uuid.uuid4().hex)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    error_code = (
        "database_unavailable"
        if isinstance(exc, ServerSelectionTimeoutError)
        else "database_operation_failed"
    )
    log_event(
        logger,
        logging.ERROR,
        "request.database_error",
        error_code=error_code,
        exception_type=type(exc).__name__,
        method=request.method,
        request_id=request_id,
        route=route,
        stack=safe_stack_frames(exc),
        status_code=503,
    )
    return JSONResponse(
        status_code=503,
        content={"detail": "Database temporarily unavailable", "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", uuid.uuid4().hex)
    route = getattr(request.scope.get("route"), "path", "unmatched")
    log_event(
        logger,
        logging.ERROR,
        "request.unhandled_exception",
        exception_type=type(exc).__name__,
        method=request.method,
        request_id=request_id,
        route=route,
        stack=safe_stack_frames(exc),
        status_code=500,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Feature routers — each owns one resource under /api.
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.journey import router as journey_router
from routers.roadmap import router as roadmap_router
from routers.progress import router as progress_router
from routers.mocks import router as mocks_router
from routers.revision import router as revision_router
from routers.checkpoints import router as checkpoints_router
from routers.projects import router as projects_router
from routers.interview import router as interview_router
from routers.analytics import router as analytics_router
from routers.admin import router as admin_router
from routers.cron import router as cron_router

for _router in (auth_router, users_router, journey_router, roadmap_router, progress_router,
                mocks_router, revision_router, checkpoints_router, projects_router,
                interview_router, analytics_router, admin_router, cron_router):
    api_router.include_router(_router)


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.get("/health/live")
async def health_live():
    return {"status": "ok"}


@api_router.get("/health/ready")
async def health_ready():
    await client.admin.command("ping")
    return {"status": "ready"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in os.environ.get(
            "CORS_ORIGINS", "http://localhost:3000"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dist = ROOT_DIR.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.frontend("/", directory=frontend_dist, fallback="index.html")
