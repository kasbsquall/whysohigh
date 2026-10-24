# Renders the evaluation bills (eval/bills/<id>.html, written by eval/generate.ts)
# to eval/bills/png/<id>.png with headless Chromium, for eval/billreader.ts.
# These are clean renders of a synthetic layout, not phone photos of real bills.
#   pip install playwright && python -m playwright install chromium
#   python scripts/render-bills.py

from pathlib import Path

from playwright.sync_api import sync_playwright

SOURCE = Path("eval/bills")
TARGET = SOURCE / "png"


def main() -> None:
    bills = sorted(SOURCE.glob("*.html"))
    if not bills:
        raise SystemExit("No bills in eval/bills. Run npm run eval:generate first.")
    TARGET.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 850, "height": 700}, device_scale_factor=1)
        for bill in bills:
            page.goto(bill.resolve().as_uri())
            page.screenshot(path=str(TARGET / f"{bill.stem}.png"), full_page=True)
        browser.close()
    print(f"Rendered {len(bills)} bills to {TARGET}")


if __name__ == "__main__":
    main()
