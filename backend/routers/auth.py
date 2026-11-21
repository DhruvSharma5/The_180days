"""Authentication: signup (with verification email), login, logout, me,
forgot/reset/change password, email verification. All under /api/auth/*."""

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    User,
    clear_session_cookie,
    create_session_token,
    get_current_user,
    get_current_user_allow_unverified,
    hash_password,
    new_token,
    rate_limit,
    set_session_cookie,
    token_sha256,
    verification_code_hash,
    verify_password,
    decode_token,
)
from lib.db import db
from lib.emailer import (
    password_reset_email,
    send_email,
    verification_code_email,
)
from lib.observability import log_event
from models.models import (
    AuthOut,
    ChangePasswordIn,
    ForgotIn,
    LoginChallengeOut,
    LoginIn,
    LoginVerifyIn,
    MessageOut,
    ResetIn,
    SignupIn,
    TokenIn,
    UserOut,
    VerificationCodeIn,
    utcnow,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD_LENGTH:
        return "Password must be at least 8 characters"
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "Password must contain at least one letter and one number"
    return None


async def store_email_token(
    token: str, user_id: str, purpose: str, hours: float
) -> None:
    await db.email_tokens.insert_one(
        {
            "token_hash": token_sha256(token),
            "user_id": user_id,
            "purpose": purpose,
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=hours),
            "created_at": utcnow(),
        }
    )


async def issue_email_token(user_id: str, purpose: str, hours: float) -> str:
    token = new_token()
    await store_email_token(token, user_id, purpose, hours)
    return token


async def consume_email_token(token: str, purpose: str) -> dict | None:
    doc = await db.email_tokens.find_one_and_update(
        {
            "token_hash": token_sha256(token),
            "purpose": purpose,
            "used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        {"$set": {"used": True}},
    )
    return doc


def generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def store_verification_code(user_id: str, code: str) -> None:
    await db.email_tokens.update_many(
        {"user_id": user_id, "purpose": "verify", "used": False},
        {"$set": {"used": True}},
    )
    await db.email_tokens.insert_one(
        {
            "token_hash": verification_code_hash(code),
            "user_id": user_id,
            "purpose": "verify",
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "created_at": utcnow(),
        }
    )


async def issue_verification_code(user_id: str) -> str:
    code = generate_verification_code()
    await store_verification_code(user_id, code)
    return code


async def store_login_code(user_id: str, code: str) -> None:
    await db.email_tokens.update_many(
        {"user_id": user_id, "purpose": "login", "used": False},
        {"$set": {"used": True}},
    )
    await db.email_tokens.insert_one(
        {
            "token_hash": verification_code_hash(code),
            "user_id": user_id,
            "purpose": "login",
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "created_at": utcnow(),
        }
    )


async def consume_verification_code(user_id: str, code: str) -> dict | None:
    return await db.email_tokens.find_one_and_update(
        {
            "token_hash": verification_code_hash(code),
            "user_id": user_id,
            "purpose": "verify",
            "used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        {"$set": {"used": True}},
    )


def user_out(doc: dict) -> UserOut:
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        role=doc.get("role", "user"),
        email_verified=doc.get("email_verified", False),
        timezone=doc.get("timezone", "UTC"),
        notify_daily=doc.get("notify_daily", False),
        notify_incomplete=doc.get("notify_incomplete", False),
        notify_weekly=doc.get("notify_weekly", False),
        notify_monthly=doc.get("notify_monthly", False),
        created_at=doc.get("created_at") or utcnow(),
    )


@router.post("/signup", response_model=AuthOut, status_code=201)
async def signup(body: SignupIn, request: Request, response: Response):
    rate_limit("signup", request)
    if body.password != body.confirm_password:
        raise HTTPException(status_code=422, detail="Passwords do not match")
    if problem := password_problem(body.password):
        raise HTTPException(status_code=422, detail=problem)
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )
    user_doc = {
        "id": uuid.uuid4().hex,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "user",  # never assignable from the request — admins are seeded server-side
        "email_verified": False,
        "timezone": os.environ.get("APP_TZ", "UTC"),
        "notify_daily": False,
        "notify_incomplete": False,
        "notify_weekly": False,
        "notify_monthly": False,
        "session_epoch": 0,
        "created_at": utcnow(),
        "last_login_at": None,
    }
    await db.users.insert_one(user_doc)
    verification_email_sent = False
    try:
        code = generate_verification_code()
        subject, html = verification_code_email(user_doc["name"], code)
        await send_email(to=email, subject=subject, html=html)
        await store_verification_code(user_doc["id"], code)
        verification_email_sent = True
    except HTTPException as exc:
        log_event(
            logger,
            logging.WARNING,
            "email.verification_unavailable",
            status_code=exc.status_code,
        )
    fresh, max_age = create_session_token(user_doc["id"])
    set_session_cookie(response, fresh, max_age, request)
    return AuthOut(
        user=user_out(user_doc),
        verification_email_sent=verification_email_sent,
    )


@router.post("/login", response_model=LoginChallengeOut)
async def login(body: LoginIn, request: Request):
    rate_limit("login", request)
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    code = generate_verification_code()
    subject, html = verification_code_email(user["name"], code)
    try:
        await send_email(to=email, subject=subject, html=html)
        await store_login_code(user["id"], code)
    except HTTPException as exc:
        log_event(
            logger,
            logging.WARNING,
            "email.login_otp_unavailable",
            status_code=exc.status_code,
        )
        raise
    return LoginChallengeOut(
        message="Sign-in verification code sent — check your inbox.",
        email=email,
    )


@router.post("/verify-login-code", response_model=AuthOut)
async def verify_login_code(
    body: LoginVerifyIn,
    request: Request,
    response: Response,
):
    rate_limit("verify", request)
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired sign-in code")
    doc = await db.email_tokens.find_one_and_update(
        {
            "token_hash": verification_code_hash(body.code),
            "user_id": user["id"],
            "purpose": "login",
            "used": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired sign-in code")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verified": True, "last_login_at": utcnow()}},
    )
    fresh, max_age = create_session_token(
        user["id"],
        remember=body.remember,
        session_epoch=user.get("session_epoch", 0),
    )
    set_session_cookie(response, fresh, max_age, request)
    user["email_verified"] = True
    user["last_login_at"] = utcnow()
    return AuthOut(user=user_out(user))


@router.post("/logout", response_model=MessageOut)
async def logout(request: Request, response: Response):
    clear_session_cookie(response, request)
    return MessageOut(message="Signed out")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user_allow_unverified)):
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return user_out(doc)


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(body: ForgotIn, request: Request):
    rate_limit("forgot", request)
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:  # response is identical either way — no account enumeration
        try:
            token = new_token()
            subject, html = password_reset_email(user["name"], token)
            await send_email(to=email, subject=subject, html=html)
            await store_email_token(token, user["id"], "reset", 1)
        except HTTPException as exc:
            log_event(
                logger,
                logging.WARNING,
                "email.password_reset_unavailable",
                status_code=exc.status_code,
            )
    return MessageOut(
        message="If an account exists for that email, a reset link is on its way."
    )


@router.post("/reset-password", response_model=MessageOut)
async def reset_password(body: ResetIn):
    if problem := password_problem(body.password):
        raise HTTPException(status_code=422, detail=problem)
    doc = await consume_email_token(body.token, "reset")
    if not doc:
        raise HTTPException(
            status_code=400, detail="This reset link is invalid or has expired"
        )
    await db.users.update_one(
        {"id": doc["user_id"]},
        {
            "$set": {"password_hash": hash_password(body.password)},
            "$inc": {"session_epoch": 1},
        },
    )
    return MessageOut(message="Password updated — sign in with your new password.")


@router.post("/verify-email", response_model=MessageOut)
async def verify_email(body: TokenIn, request: Request):
    rate_limit("verify", request)
    doc = await consume_email_token(body.token, "verify")
    if not doc:
        raise HTTPException(
            status_code=400, detail="This verification link is invalid or has expired"
        )
    await db.users.update_one(
        {"id": doc["user_id"]}, {"$set": {"email_verified": True}}
    )
    return MessageOut(message="Email verified — your account is fully activated.")


@router.post("/verify-email-code", response_model=MessageOut)
async def verify_email_code(
    body: VerificationCodeIn,
    request: Request,
    user: User = Depends(get_current_user_allow_unverified),
):
    rate_limit("verify", request)
    if user.email_verified:
        return MessageOut(message="Your email is already verified.")
    doc = await consume_verification_code(user.id, body.code)
    if not doc:
        raise HTTPException(
            status_code=400, detail="This verification code is invalid or has expired"
        )
    await db.users.update_one({"id": user.id}, {"$set": {"email_verified": True}})
    return MessageOut(message="Email verified — your account is fully activated.")


@router.post(
    "/resend-verification",
    response_model=MessageOut,
)
async def resend_verification(
    request: Request,
    user: User = Depends(get_current_user_allow_unverified),
):
    rate_limit("resend", request)
    if user.email_verified:
        return MessageOut(message="Your email is already verified.")
    try:
        code = generate_verification_code()
        subject, html = verification_code_email(user.name, code)
        await send_email(to=user.email, subject=subject, html=html)
        await store_verification_code(user.id, code)
    except HTTPException as exc:
        log_event(
            logger,
            logging.WARNING,
            "email.verification_unavailable",
            status_code=exc.status_code,
        )
        raise
    return MessageOut(message="Verification email sent — check your inbox.")


@router.post("/change-password", response_model=MessageOut)
async def change_password(
    body: ChangePasswordIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
):
    if problem := password_problem(body.new_password):
        raise HTTPException(status_code=422, detail=problem)
    doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if not doc or not verify_password(
        body.current_password, doc.get("password_hash", "")
    ):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    await db.users.update_one(
        {"id": user.id},
        {
            "$set": {"password_hash": hash_password(body.new_password)},
            "$inc": {"session_epoch": 1},
        },
    )
    fresh, max_age = create_session_token(
        user.id,
        remember=bool(
            (decode_token(request.cookies.get("sid", "")) or {}).get("remember", False)
        ),
        session_epoch=doc.get("session_epoch", 0) + 1,
    )
    set_session_cookie(response, fresh, max_age, request)
    return MessageOut(message="Password changed. Other sessions were signed out.")
