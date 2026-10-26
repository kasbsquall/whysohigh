"""Phone-photo versions of the rendered evaluation bills, for eval/billreader.ts --photos.

Each bill in eval/bills/png/ is laid on a table, turned, seen at an angle, lit
unevenly, blurred and saved as a compressed JPEG in eval/bills/photo/. The
distortions are seeded by the bill id, so the set is the same on every machine.
These are simulations of phone photos, not photos of real bills.

    python scripts/photo-bills.py
"""

from __future__ import annotations

import random
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SRC = Path("eval/bills/png")
OUT = Path("eval/bills/photo")
TABLE = (112, 100, 86)
LONG_SIDE = 1600


def perspective_coeffs(src: list[tuple[float, float]], dst: list[tuple[float, float]]) -> list[float]:
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(rows, dtype=float)
    b = np.array(dst, dtype=float).reshape(8)
    return list(np.linalg.solve(a, b))


def photo(path: Path) -> tuple[Image.Image, dict[str, float]]:
    rng = random.Random(zlib.crc32(path.stem.encode()))
    params = {
        "rotate_deg": round(rng.uniform(-6, 6), 2),
        "keystone": round(rng.uniform(0.0, 0.05), 3),
        "blur_px": round(rng.uniform(0.5, 1.6), 2),
        "brightness": round(rng.uniform(0.78, 1.04), 3),
        "shadow": round(rng.uniform(0.0, 0.35), 3),
        "jpeg_quality": rng.randint(55, 80),
    }
    bill = Image.open(path).convert("RGB")
    w, h = bill.size
    table = Image.new("RGB", (int(w * 1.22), int(h * 1.18)), TABLE)
    table.paste(bill, (int(w * 0.11), int(h * 0.09)))
    img = table.rotate(params["rotate_deg"], resample=Image.BICUBIC, fillcolor=TABLE)
    W, H = img.size
    k = params["keystone"]
    # The top edge is farther from the camera than the bottom one.
    coeffs = perspective_coeffs([(0, 0), (W, 0), (W, H), (0, H)], [(W * k, 0), (W * (1 - k), 0), (W, H), (0, H)])
    img = img.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=TABLE)
    img = img.filter(ImageFilter.GaussianBlur(params["blur_px"]))
    img = ImageEnhance.Brightness(img).enhance(params["brightness"])
    # A soft shadow across one side, as from a hand or a phone held at an angle.
    ramp = np.linspace(1 - params["shadow"], 1, W, dtype=float)
    if rng.random() < 0.5:
        ramp = ramp[::-1]
    arr = np.asarray(img, dtype=float) * ramp[None, :, None]
    arr[..., 2] *= 0.94  # warm indoor light
    img = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))
    scale = LONG_SIDE / max(img.size)
    if scale < 1:
        img = img.resize((round(img.size[0] * scale), round(img.size[1] * scale)), Image.LANCZOS)
    return img, params


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bills = sorted(SRC.glob("*.png"))
    if not bills:
        raise SystemExit("eval/bills/png is empty. Run python scripts/render-bills.py first.")
    lines = []
    for path in bills:
        img, params = photo(path)
        img.save(OUT / f"{path.stem}.jpg", quality=params["jpeg_quality"])
        lines.append(f"{path.stem} {params}")
    (OUT / "params.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {len(bills)} photos to {OUT}/")


if __name__ == "__main__":
    main()
