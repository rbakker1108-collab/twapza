"""Manage accounts on the server: ``python -m twapza.users <command>``.

  list                         all accounts with their plan and this month's minutes
  set-plan EMAIL PLAN          give an account a plan by hand (free | creator | pro), e.g. for
                               friends, testers or yourself; "free" removes a hand-set plan
  delete EMAIL                 delete the account and everything in it
"""

import argparse
import sys

from sqlmodel import Session, select

from twapza.accounts.plans import PLANS
from twapza.accounts.usage import plan_of, usage_of
from twapza.accounts.users import delete_user, find_user
from twapza.db.models import User
from twapza.db.session import get_engine, init_db


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    set_plan = sub.add_parser("set-plan")
    set_plan.add_argument("email")
    set_plan.add_argument("plan", choices=sorted(PLANS))
    remove = sub.add_parser("delete")
    remove.add_argument("email")
    args = parser.parse_args(argv)

    init_db()
    with Session(get_engine()) as session:
        if args.command == "list":
            for user in session.exec(select(User).order_by(User.created_at)):
                usage = usage_of(session, user)
                print(f"{user.email}\t{plan_of(user).id}\t{user.subscription_status or '-'}\t"
                      f"{usage.used_seconds / 60:.0f}/{usage.limit_seconds / 60:.0f} min\t"
                      f"since {user.created_at:%Y-%m-%d}")
            return 0
        user = find_user(session, args.email)
        if user is None:
            print(f"No account with email {args.email}", file=sys.stderr)
            return 1
        if args.command == "set-plan":
            if user.subscription_status not in (None, "manual", "canceled", "incomplete_expired") and args.plan != user.plan:
                print("This account has a paid subscription; change it in Stripe instead.", file=sys.stderr)
                return 1
            user.plan = args.plan
            user.subscription_status = None if args.plan == "free" else "manual"
            user.period = None
            session.add(user)
            session.commit()
            print(f"{user.email} now has the {args.plan} plan")
        elif args.command == "delete":
            delete_user(session, user)
            print(f"deleted {args.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
