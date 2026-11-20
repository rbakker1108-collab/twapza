"""Waitlist sign-ups from the marketing site ("Get early access").

``POST /api/waitlist`` only stores the address (and the site language, to email people in
their own language). There is deliberately no endpoint that lists the addresses: export them
on the server with ``python -m twapza.waitlist``.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from twapza.api.schemas import WaitlistRequest
from twapza.db.models import WaitlistEntry
from twapza.db.session import get_session

router = APIRouter(prefix="/api/waitlist", tags=["waitlist"])

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


@router.post("", status_code=status.HTTP_201_CREATED)
def join_waitlist(body: WaitlistRequest, session: Session = Depends(get_session)) -> dict:
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please enter a valid email address.")
    if session.get(WaitlistEntry, email) is None:  # signing up twice is fine
        session.add(WaitlistEntry(email=email, lang=body.lang))
        session.commit()
    return {"ok": True}
