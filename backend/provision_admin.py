"""Create a first admin account without changing an existing user."""

import argparse
import asyncio
import os
import uuid

from pymongo.errors import DuplicateKeyError

from lib.auth import hash_password
from lib.db import client, db, ensure_indexes
from models.models import utcnow


async def provision_admin() -> bool:
    email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not email or not password:
        raise ValueError(
            "Set ADMIN_EMAIL and ADMIN_PASSWORD in the private environment"
        )
    if (
        len(password) < 8
        or not any(c.isalpha() for c in password)
        or not any(c.isdigit() for c in password)
    ):
        raise ValueError(
            "ADMIN_PASSWORD must be at least 8 characters with a letter and digit"
        )

    await ensure_indexes()
    existing = await db.users.find_one({"email": email}, {"_id": 0, "role": 1})
    if existing:
        if existing.get("role") == "admin":
            return False
        raise ValueError("That email already exists; no account or role was changed")

    try:
        await db.users.insert_one(
            {
                "id": uuid.uuid4().hex,
                "name": "Owner",
                "email": email,
                "password_hash": hash_password(password),
                "role": "admin",
                "email_verified": True,
                "timezone": os.environ.get("APP_TZ", "Asia/Kolkata"),
                "notify_daily": False,
                "notify_incomplete": False,
                "notify_weekly": False,
                "notify_monthly": False,
                "session_epoch": 0,
                "created_at": utcnow(),
                "last_login_at": None,
            }
        )
    except DuplicateKeyError as exc:
        raise ValueError(
            "That email already exists; no account or role was changed"
        ) from exc
    return True


async def run() -> bool:
    try:
        return await provision_admin()
    finally:
        await client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm",
        action="store_true",
        required=True,
        help="Explicitly confirm creation of a new admin account",
    )
    parser.parse_args()
    created = asyncio.run(run())
    if created:
        print("Admin account created. The password was not displayed.")
    else:
        print("An admin account already exists; no changes were made.")


if __name__ == "__main__":
    main()
