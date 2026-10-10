"""User-facing caption options (part of ExportSettings) and the bundled fonts."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

FONTS_DIR = Path(__file__).parent / "fonts"

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
