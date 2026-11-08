"""User-facing caption options (part of ExportSettings) and the bundled fonts."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

FONTS_DIR = Path(__file__).parent / "fonts"

# How many CSS pixels of em one unit of ASS Fontsize gives (libass sizes fonts by their
# ascent+descent, not the em). Measured by rendering a capital H with libass and dividing its
# height by the font's OS/2 cap height (tests/test_overlays.py checks it). The browser previews
# use these to show text at the size it will have in the download.
EM_PER_ASS_SIZE: dict[str, float] = {"montserrat": 0.643, "poppins": 0.564, "anton": 0.576, "bebas": 0.771}

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
