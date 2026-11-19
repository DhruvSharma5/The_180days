"""Bearer-authenticated scheduled entrypoints."""

import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException

from lib.reminders import dispatch_daily_reminders

router = APIRouter(prefix="/cron", tags=["cron"])
logger = logging.getLogger(__name__)


def _auth(authorization: str) -> None:
    secret = os.environ.get("CRON_SECRET") or os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Invalid cron credentials")


@router.api_route("/reminders", methods=["GET", "POST"])
async def cron_reminders(authorization: str = Header(default="")):
    _auth(authorization)
    sent, skipped = await dispatch_daily_reminders()
    logger.info("cron reminders completed (sent=%d, skipped=%d)", sent, skipped)
    return {"status": "completed", "sent": sent, "skipped": skipped}
