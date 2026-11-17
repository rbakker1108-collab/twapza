"""Create Twapza's subscription products in Creem.

    python -m twapza.creem_setup              # uses TWAPZA_CREEM_API_KEY from .env

Run it once with a test key (creem_test_…) and once with the live key. It prints the lines to put
in .env. Running it again with the same key returns the products it created before (they are
identified by an idempotency key), so it is safe to repeat.
"""

import argparse
import sys

from twapza.accounts.billing import BillingError, Creem, get_billing
from twapza.config import get_settings

# Keep in sync with frontend/src/marketing/plans.ts (yearly = 12 x the "per month, billed yearly" price).
PRODUCTS = {
    "creator": {"name": "Twapza Creator", "monthly": 1500, "yearly": 14400,
                "description": "300 video minutes per month, no watermark, clip editor extras, AI titles and descriptions."},
    "pro": {"name": "Twapza Pro", "monthly": 2900, "yearly": 27600,
            "description": "1,200 video minutes per month, videos up to 3 hours, priority rendering, download all clips."},
}
PERIODS = {"monthly": ("every-month", "Monthly"), "yearly": ("every-year", "Yearly")}


def create_all(creem: Creem, public_url: str, currency: str = "USD") -> dict[str, str]:
    env: dict[str, str] = {}
    for plan, spec in PRODUCTS.items():
        for period, (billing_period, label) in PERIODS.items():
            key = f"twapza_{plan}_{period}"
            product = creem.create_product({
                "name": f"{spec['name']} ({label})",
                "description": spec["description"],
                "price": spec[period],
                "currency": currency,
                "billing_type": "recurring",
                "billing_period": billing_period,
                "tax_mode": "exclusive",
                "tax_category": "saas",
                "default_success_url": f"{public_url.rstrip('/')}/account?upgraded=1",
                "external_id": key,
                "metadata": {"twapza_plan": plan, "twapza_period": period},
            }, idempotency_key=key)
            env[f"TWAPZA_CREEM_PRODUCT_{plan.upper()}_{period.upper()}"] = product["id"]
    return env


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--currency", default="USD", choices=["USD", "EUR"])
    args = parser.parse_args(argv)
    settings = get_settings()
    creem = get_billing(settings)
    if creem is None:
        print("Set TWAPZA_CREEM_API_KEY in .env first (creem_test_… for test mode).", file=sys.stderr)
        return 1
    try:
        env = create_all(creem, settings.public_url, args.currency)
    except BillingError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    mode = "TEST" if settings.creem_test_mode else "LIVE"
    print(f"Created the {mode} products. Add these lines to .env, then restart Twapza:\n")
    for key, value in env.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
