"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncMongoClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=10000,
    maxPoolSize=10,
)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("role", ASCENDING)], name="role"),
    ],
    "journeys": [
        IndexModel([("user_id", ASCENDING)], name="user_unique", unique=True),
        IndexModel([("status", ASCENDING), ("start_date", ASCENDING)], name="status_start"),
    ],
    "roadmap_days": [
        IndexModel([("day", ASCENDING)], name="day_unique", unique=True),
        IndexModel([("phase", ASCENDING)], name="phase"),
    ],
    "interview_days": [
        IndexModel([("day", ASCENDING)], name="day_unique", unique=True),
    ],
    "task_progress": [
        IndexModel([("user_id", ASCENDING), ("day", ASCENDING)], name="user_day", unique=True),
        IndexModel([("user_id", ASCENDING), ("day_status", ASCENDING)], name="user_status"),
    ],
    "weekly_mocks": [
        IndexModel([("user_id", ASCENDING), ("week", ASCENDING)], name="user_week", unique=True),
    ],
    "weekly_revisions": [
        IndexModel([("user_id", ASCENDING), ("week", ASCENDING)], name="user_week", unique=True),
    ],
    "monthly_checkpoints": [
        IndexModel([("user_id", ASCENDING), ("month", ASCENDING)], name="user_month", unique=True),
    ],
    "projects": [
        IndexModel([("user_id", ASCENDING), ("key", ASCENDING)], name="user_key", unique=True),
    ],
    "email_tokens": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_at", expireAfterSeconds=0),
    ],
    "analytics_events": [
        IndexModel([("ts", DESCENDING)], name="ts_desc"),
        IndexModel([("date", ASCENDING), ("type", ASCENDING)], name="date_type"),
        IndexModel([("date", ASCENDING), ("session_id", ASCENDING), ("type", ASCENDING)],
                   name="date_session_type", unique=True,
                   partialFilterExpression={"type": "visit"}),
        IndexModel([("user_id", ASCENDING), ("ts", DESCENDING)], name="user_ts"),
        IndexModel([("path", ASCENDING), ("type", ASCENDING)], name="path_type"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
