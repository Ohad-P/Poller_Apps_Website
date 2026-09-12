"""Generate the 1200x630 social sharing image for Poller Apps.

Requires Pillow only while regenerating this asset. The deployed website has no
Python or Pillow dependency.
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "social-card.png"
PAPER = "#f3f0e8"
INK = "#151719"
BLUE = "#3657db"
ORANGE = "#ff5c39"
ACID = "#d5f36b"


def font(name: str, size: int):
    windows_fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    try:
        return ImageFont.truetype(str(windows_fonts / name), size=size)
    except OSError:
        return ImageFont.load_default(size=size)


image = Image.new("RGB", (1200, 630), PAPER)
draw = ImageDraw.Draw(image)

for y in range(0, 630, 40):
    draw.line((0, y, 1200, y), fill="#e6e2d9", width=1)

draw.rectangle((0, 0, 26, 630), fill=INK)
draw.rectangle((775, 0, 1200, 630), fill=BLUE)
draw.ellipse((850, 85, 1120, 355), outline="#ffffff", width=2)
draw.ellipse((915, 150, 1055, 290), fill=ACID)
draw.rectangle((958, 193, 1012, 247), fill=INK)
draw.ellipse((1050, 390, 1170, 510), fill=ORANGE)

draw.text((78, 58), "POLLER APPS / 2026", fill=INK, font=font("courbd.ttf", 22))
draw.text((76, 176), "Small tools.", fill=INK, font=font("arialbd.ttf", 78))
draw.text((76, 264), "Carefully made.", fill=BLUE, font=font("georgiai.ttf", 76))
draw.line((78, 392, 675, 392), fill=INK, width=2)
draw.text(
    (78, 430),
    "Apps, experiments, and useful ideas\nbuilt one release at a time.",
    fill="#555a58",
    font=font("arial.ttf", 27),
    spacing=13,
)
draw.text((845, 555), "POLLERAPPS.COM", fill="#ffffff", font=font("courbd.ttf", 19))

image.save(OUTPUT, optimize=True)
print(f"Generated {OUTPUT}")
