"""User-facing caption options (part of ExportSettings) and the bundled fonts."""

import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

FONTS_DIR = Path(__file__).parent / "fonts"

# How many CSS pixels of em one unit of ASS Fontsize gives: libass sizes a font by its OS/2
# usWinAscent+usWinDescent, so this is unitsPerEm / (winAscent + winDescent). Checked by rendering
# (tests/test_overlays.py). The browser previews use these to show text at its download size.
EM_PER_ASS_SIZE: dict[str, float] = {"montserrat": 0.643, "poppins": 0.564, "anton": 0.576, "bebas": 0.771}

# The caption fonts have no Arabic letters: text containing Arabic is drawn in this bundled
# font instead (family name as libass sees it, em per ASS size as above), sized to the same em.
ARABIC_FONT = ("Noto Sans Arabic ExtraBold", 0.461)
_ARABIC = re.compile("[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")


def has_arabic(text: str) -> bool:
    return bool(_ARABIC.search(text))

# id -> (family name as libass sees it, size multiplier so all fonts look similar in size)
FONTS: dict[str, tuple[str, float]] = {
    "montserrat": ("Montserrat ExtraBold", 1.0),
    "poppins": ("Poppins ExtraBold", 1.0),
    "anton": ("Anton", 1.1),
    "bebas": ("Bebas Neue", 1.25),
}


class CaptionSettings(BaseModel):
    font: Literal["montserrat", "poppins", "anton", "bebas"] = "montserrat"
    text_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    highlight_color: str = Field(default="#FFD400", pattern=r"^#[0-9A-Fa-f]{6}$")
    outline_color: str = Field(default="#000000", pattern=r"^#[0-9A-Fa-f]{6}$")
    size: Literal["small", "medium", "large"] = "medium"
    position: Literal["bottom", "middle", "top"] = "bottom"
    words_per_line: int = Field(default=3, ge=1, le=8)
    uppercase: bool = True
