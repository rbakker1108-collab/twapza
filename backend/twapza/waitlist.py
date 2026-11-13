"""Export the waitlist: ``python -m twapza.waitlist [--csv]`` (prints to stdout).

Remove someone (they asked to be forgotten): ``python -m twapza.waitlist --remove someone@example.com``.
"""

import argparse
import csv
import sys

from sqlmodel import Session, select

from twapza.db.models import WaitlistEntry
from twapza.db.session import get_engine, init_db


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remove", metavar="EMAIL", help="delete this address")
    args = parser.parse_args(argv)
    init_db()
    with Session(get_engine()) as session:
        if args.remove:
            entry = session.get(WaitlistEntry, args.remove.strip().lower())
            if entry:
                session.delete(entry)
                session.commit()
            print("removed" if entry else "not on the list")
            return 0
        writer = csv.writer(sys.stdout)
        writer.writerow(["email", "lang", "signed_up_at"])
        for e in session.exec(select(WaitlistEntry).order_by(WaitlistEntry.created_at)):
            writer.writerow([e.email, e.lang, e.created_at.isoformat()])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
