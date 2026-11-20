"""Accounts: sign up, log in/out, the current account, password reset, delete account.

Logins are server-side sessions: the browser gets a random token in an HttpOnly, SameSite=Lax
cookie (``twapza_session``); the database stores only its SHA-256 hash.
"""

import logging
from datetime import UTC, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlmodel import Session, delete

from twapza.accounts import ratelimit
from twapza.accounts.billing import BillingError
from twapza.accounts.mail import send_email
from twapza.accounts.passwords import hash_password, new_token, password_problem, token_hash, verify_password
from twapza.accounts.users import account_read, create_user, delete_user, find_user, is_verified, normalize_email
from twapza.api.deps import COOKIE, current_user
from twapza.api.schemas import (
    AccountRead, ChangePasswordRequest, DeleteAccountRequest, ForgotPasswordRequest, LoginRequest,
    ResetPasswordRequest, SignupRequest, VerifyEmailRequest,
)
from twapza.config import Settings, get_settings
from twapza.db.models import AuthSession, EmailVerification, PasswordReset, User, utcnow
from twapza.db.session import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

RESET_HOURS = 1
VERIFY_HOURS = 48
WRONG_LOGIN = "That email and password don't match an account."


def _start_session(response: Response, session: Session, user: User, settings: Settings) -> None:
    token, hashed = new_token()
    expires = utcnow() + timedelta(days=settings.session_days)
    session.add(AuthSession(token_hash=hashed, user_id=user.id, expires_at=expires))
    session.commit()
    response.set_cookie(COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
                        samesite="lax", secure=settings.public_url.startswith("https://"), path="/")


def send_verification(session: Session, user: User, settings: Settings) -> None:
    """Email a link that confirms the address (a new one each time; older links stay valid)."""
    token, hashed = new_token()
    session.add(EmailVerification(token_hash=hashed, user_id=user.id,
                                  expires_at=utcnow() + timedelta(hours=VERIFY_HOURS)))
    session.commit()
    link = f"{settings.public_url.rstrip('/')}/verify-email?token={token}"
    try:
        send_email(user.email, "Confirm your email address for Twapza",
                   f"Welcome to Twapza!\n\nConfirm your email address to start turning your videos into Shorts "
                   f"(the link works for {VERIFY_HOURS} hours):\n{link}\n\n"
                   f"Didn't create a Twapza account? Then you can ignore this email.")
    except Exception:  # noqa: BLE001 - the account works; they can ask for a new email
        log.exception("couldn't send the verification email")


@router.post("/signup", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, request: Request, response: Response,
           session: Session = Depends(get_session), settings: Settings = Depends(get_settings)) -> AccountRead:
    ratelimit.hit(f"signup:{ratelimit.client_ip(request)}", 20, 3600)
    email = normalize_email(body.email)
    if email is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please enter a valid email address.")
    if problem := password_problem(body.password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    if find_user(session, email):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "There is already an account with this email. Log in instead.")
    user = create_user(session, email, body.password, body.lang)
    _start_session(response, session, user, settings)
    if settings.email_verification:
        send_verification(session, user, settings)
    return account_read(session, user)


@router.post("/verify-email", response_model=AccountRead)
def verify_email(body: VerifyEmailRequest, response: Response, session: Session = Depends(get_session),
                 settings: Settings = Depends(get_settings)) -> AccountRead:
    """The link from the confirmation email. Also logs the person in on this device."""
    link = session.get(EmailVerification, token_hash(body.token))
    expires = link.expires_at.replace(tzinfo=link.expires_at.tzinfo or UTC) if link else None
    user = session.get(User, link.user_id) if link else None
    if link is None or user is None or expires <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This confirmation link has expired or was already used. Log in to get a new one.")
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
        session.add(user)
    session.exec(delete(EmailVerification).where(EmailVerification.user_id == user.id))
    session.commit()
    _start_session(response, session, user, settings)
    return account_read(session, user)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(user: User = Depends(current_user), session: Session = Depends(get_session),
                        settings: Settings = Depends(get_settings)) -> dict:
    if is_verified(user):
        return {"ok": True, "already": True}
    ratelimit.hit(f"verify:{user.id}", 3, 3600)
    send_verification(session, user, settings)
    return {"ok": True}


@router.post("/login", response_model=AccountRead)
def login(body: LoginRequest, request: Request, response: Response,
          session: Session = Depends(get_session), settings: Settings = Depends(get_settings)) -> AccountRead:
    email = body.email.strip().lower()
    ratelimit.hit(f"login:{email}", 10, 900)
    ratelimit.hit(f"login-ip:{ratelimit.client_ip(request)}", 50, 900)
    user = find_user(session, email)
    if not verify_password(body.password, user.password_hash if user else None) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG_LOGIN)
    _start_session(response, session, user, settings)
    return account_read(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, session: Session = Depends(get_session)) -> None:
    if token := request.cookies.get(COOKIE):
        auth = session.get(AuthSession, token_hash(token))
        if auth:
            session.delete(auth)
            session.commit()
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=AccountRead)
def me(user: User = Depends(current_user), session: Session = Depends(get_session)) -> AccountRead:
    return account_read(session, user)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(body: ForgotPasswordRequest, request: Request, session: Session = Depends(get_session),
                    settings: Settings = Depends(get_settings)) -> dict:
    """Email a reset link. Always answers the same, so it doesn't reveal who has an account."""
    email = body.email.strip().lower()
    ratelimit.hit(f"forgot:{email}", 5, 3600)
    ratelimit.hit(f"forgot-ip:{ratelimit.client_ip(request)}", 20, 3600)
    user = find_user(session, email)
    if user is not None:
        token, hashed = new_token()
        session.add(PasswordReset(token_hash=hashed, user_id=user.id,
                                  expires_at=utcnow() + timedelta(hours=RESET_HOURS)))
        session.commit()
        link = f"{settings.public_url.rstrip('/')}/reset-password?token={token}"
        try:
            send_email(user.email, "Reset your Twapza password",
                       f"Someone (hopefully you) asked to reset the password of your Twapza account.\n\n"
                       f"Choose a new password here (the link works for {RESET_HOURS} hour):\n{link}\n\n"
                       f"Didn't ask for this? Then you can ignore this email.")
        except Exception:  # noqa: BLE001 - don't reveal anything; the log has the details
            log.exception("couldn't send the password reset email")
    return {"ok": True}


@router.post("/reset-password", response_model=AccountRead)
def reset_password(body: ResetPasswordRequest, response: Response, session: Session = Depends(get_session),
                   settings: Settings = Depends(get_settings)) -> AccountRead:
    reset = session.get(PasswordReset, token_hash(body.token))
    expires = reset.expires_at.replace(tzinfo=reset.expires_at.tzinfo or UTC) if reset else None
    if reset is None or reset.used or expires <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This reset link has expired or was already used. Ask for a new one.")
    if problem := password_problem(body.password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    user = session.get(User, reset.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account no longer exists.")
    user.password_hash = hash_password(body.password)
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()  # the reset link reached their inbox
    reset.used = True
    session.add_all([user, reset])
    session.exec(delete(AuthSession).where(AuthSession.user_id == user.id))  # log out everywhere
    session.commit()
    _start_session(response, session, user, settings)
    return account_read(session, user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, request: Request, user: User = Depends(current_user),
                    session: Session = Depends(get_session)) -> None:
    ratelimit.hit(f"login:{user.email}", 10, 900)
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password isn't right.")
    if problem := password_problem(body.new_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    user.password_hash = hash_password(body.new_password)
    session.add(user)
    # Log out other devices, keep this one.
    keep = token_hash(request.cookies.get(COOKIE, ""))
    session.exec(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.token_hash != keep))
    session.commit()


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: DeleteAccountRequest, response: Response, user: User = Depends(current_user),
                   session: Session = Depends(get_session)) -> None:
    """Delete the account and everything in it; a running subscription is cancelled."""
    ratelimit.hit(f"login:{user.email}", 10, 900)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your password isn't right.")
    try:
        delete_user(session, user)
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            f"{exc} Your subscription has to be cancelled before the account can be deleted.") from None
    response.delete_cookie(COOKIE, path="/")
