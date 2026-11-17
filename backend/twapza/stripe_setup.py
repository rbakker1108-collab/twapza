"""Create Twapza's products, prices and customer-portal settings in Stripe.

    python -m twapza.stripe_setup              # uses TWAPZA_STRIPE_SECRET_KEY from .env

Run it once in test mode (sk_test_… key) and once in live mode (sk_live_… key). It prints the
lines to put in .env. Running it again creates new objects, so only run it again on purpose
(e.g. after changing prices; old prices keep working for existing subscribers).
"""

import argparse
import sys

from twapza.accounts.billing import BillingError, Stripe, get_billing
from twapza.config import get_settings

# Keep in sync with frontend/src/marketing/plans.ts (yearly = 12 x the "per month, billed yearly" price).
PRODUCTS = {
    "creator": {"name": "Twapza Creator", "monthly": 1500, "yearly": 14400,
                "description": "300 video minutes per month, no watermark, clip editor extras, AI titles and descriptions."},
    "pro": {"name": "Twapza Pro", "monthly": 2900, "yearly": 27600,
            "description": "1,200 video minutes per month, videos up to 3 hours, priority rendering, download all clips."},
}
# Stripe tax code for "Software as a service (SaaS) - personal use"; needed to tax it correctly.
TAX_CODE = "txcd_10103000"


def create_all(stripe: Stripe, public_url: str, currency: str = "usd") -> dict[str, str]:
    env: dict[str, str] = {}
    portal_products = []
    for plan, spec in PRODUCTS.items():
        product = stripe._request("POST", "/products", {
            "name": spec["name"], "description": spec["description"], "tax_code": TAX_CODE,
            "metadata": {"twapza_plan": plan},
        })
        price_ids = []
        for period, interval in (("monthly", "month"), ("yearly", "year")):
            price = stripe._request("POST", "/prices", {
                "product": product["id"], "currency": currency, "unit_amount": spec[period],
                "recurring": {"interval": interval}, "tax_behavior": "exclusive",
                "lookup_key": f"twapza_{plan}_{period}", "transfer_lookup_key": True,
                "metadata": {"twapza_plan": plan, "twapza_period": period},
            })
            env[f"TWAPZA_STRIPE_PRICE_{plan.upper()}_{period.upper()}"] = price["id"]
            price_ids.append(price["id"])
        portal_products.append({"product": product["id"], "prices": price_ids})

    portal = stripe._request("POST", "/billing_portal/configurations", {
        "business_profile": {"headline": "Twapza: manage your subscription",
                             "privacy_policy_url": f"{public_url.rstrip('/')}/privacy",
                             "terms_of_service_url": f"{public_url.rstrip('/')}/terms"},
        "default_return_url": f"{public_url.rstrip('/')}/account",
        "features": {
            "customer_update": {"enabled": True, "allowed_updates": ["email", "address", "tax_id"]},
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "subscription_cancel": {"enabled": True, "mode": "at_period_end"},
            "subscription_update": {"enabled": True, "default_allowed_updates": ["price"],
                                    "proration_behavior": "create_prorations",
                                    "products": portal_products},
        },
    })
    env["TWAPZA_STRIPE_PORTAL_CONFIGURATION"] = portal["id"]
    return env


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--currency", default="usd")
    args = parser.parse_args(argv)
    settings = get_settings()
    stripe = get_billing(settings)
    if stripe is None:
        print("Set TWAPZA_STRIPE_SECRET_KEY in .env first (sk_test_… for test mode).", file=sys.stderr)
        return 1
    try:
        env = create_all(stripe, settings.public_url, args.currency)
    except BillingError as exc:
        print(f"Stripe refused: {exc} The API log line above has Stripe's reason.", file=sys.stderr)
        return 1
    print("Created. Add these lines to .env, then restart Twapza:\n")
    for key, value in env.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
