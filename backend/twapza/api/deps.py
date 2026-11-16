"""Who is logged in (from the session cookie)."""

from datetime import UTC

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from twapza.accounts.passwords import token_hash
from twapza.db.models import AuthSession, User, utcnow
from twapza.db.session import get_session

COOKIE = "twapza_session"
LOGIN_REQUIRED = "Please log in."


def optional_user(request: Request, session: Session = Depends(get_session)) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    auth = session.get(AuthSession, token_hash(token))
    if auth is None:
        return None
    expires = auth.expires_at if auth.expires_at.tzinfo else auth.expires_at.replace(tzinfo=UTC)
    if expires <= utcnow():
        session.delete(auth)
        session.commit()
        return None
    return session.get(User, auth.user_id)


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_REQUIRED)
    return user
