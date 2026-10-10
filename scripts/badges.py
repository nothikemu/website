"""Generate the 88x31 buttons in public/badges/.

Text is converted to outlines from JetBrains Mono Nerd Font, so the images look the same
everywhere (an SVG loaded via <img> can't use the page's web fonts).

    pip install fonttools
    python3 scripts/badges.py path/to/JetBrainsMonoNerdFont-Bold.ttf path/to/JetBrainsMonoNerdFont-Regular.ttf
"""

import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent.parent / "public" / "badges"


class Face:
    def __init__(self, path: str):
        self.font = TTFont(path)
        self.cmap = self.font.getBestCmap()
        self.glyphs = self.font.getGlyphSet()
        self.upm = self.font["head"].unitsPerEm
        self.hmtx = self.font["hmtx"]

    def advance(self, ch: str, size: float) -> float:
        name = self.cmap.get(ord(ch))
        return (self.hmtx[name][0] if name else self.upm * 0.6) * size / self.upm

    def width(self, text: str, size: float, track: float = 0) -> float:
        return sum(self.advance(c, size) + track for c in text) - track

    def path(self, text: str, size: float, x: float, y: float, track: float = 0) -> str:
        pen = SVGPathPen(self.glyphs)
        s = size / self.upm
        for ch in text:
            name = self.cmap.get(ord(ch))
            if name:
                self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, y)))
            x += self.advance(ch, size) + track
        return pen.getCommands()


def text(face: Face, s: str, size: float, y: float, fill: str, x: float | None = None, track: float = 0) -> str:
    w = face.width(s, size, track)
    x = (88 - w) / 2 if x is None else x
    return f'<path fill="{fill}" d="{face.path(s, size, x, y, track)}"/>'


def badge(name: str, label: str, bg: str, body: str, border: str = "#ffffff40") -> None:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31" viewBox="0 0 88 31" role="img" aria-label="{label}">'
        f"<title>{label}</title>{bg}{body}"
        f'<rect x=".5" y=".5" width="87" height="30" fill="none" stroke="{border}"/></svg>'
    )
    (OUT / f"{name}.svg").write_text(svg)


def main() -> None:
    bold, regular = Face(sys.argv[1]), Face(sys.argv[2])
    OUT.mkdir(parents=True, exist_ok=True)
    grad = lambda gid, a, b: f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="88" height="31" fill="url(#{gid})"/>'
    solid = lambda c: f'<rect width="88" height="31" fill="{c}"/>'

    # hkmu.me
    w1, w2 = bold.width("hkmu", 14), regular.width(".me", 10)
    x = (88 - w1 - w2) / 2
    badge("hkmu", "hkmu.me", solid("#0b0e18"), text(bold, "hkmu", 14, 20.5, "#ebe7dd", x) + text(regular, ".me", 10, 20.5, "#b3beff", x + w1), "#b3beff66")

    # linux
    badge(
        "linux",
        "powered by linux",
        grad("g", "#f7d566", "#e2a128"),
        text(regular, "powered by", 7.5, 10.5, "#3a2a08") + text(bold, " LINUX", 11, 24, "#1b1408", track=0.4),
        "#7a5410",
    )

    # lanyard
    badge("lanyard", "discord presence via lanyard", grad("g", "#6973f5", "#4752c4"), text(regular, "presence via", 7.5, 10.5, "#dfe3ff") + text(bold, "lanyard", 12, 24, "#ffffff"), "#2b338f")

    # nerd fonts
    badge("nerdfonts", "set in nerd fonts", solid("#0f1726"), text(regular, "set in", 7.5, 10.5, "#7ee0b5") + text(bold, " nerd fonts", 10, 23.5, "#7ee0b5"), "#7ee0b566")

    # sakamoto
    badge("sakamoto", "sakamoto-san approved", grad("g", "#1d1f27", "#101116"), text(bold, "", 15, 21, "#e5483f", 6) + text(regular, "sakamoto", 8.5, 13, "#ebe7dd", 28) + text(regular, "approved", 8.5, 24, "#e5483f", 28), "#e5483f80")

    # no cookies
    stripes = '<defs><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#2c1c14"/><rect x="4" width="4" height="8" fill="#36241a"/></pattern></defs><rect width="88" height="31" fill="url(#p)"/>'
    badge("cookies", "no cookies, no trackers", stripes, text(bold, "NO", 11, 13.5, "#f3c79c") + text(regular, "cookies here", 7.5, 24, "#f3c79c"), "#f3c79c55")

    # any browser
    badge("browser", "best viewed with any browser", grad("g", "#e3e7ee", "#c7ccd6"), text(regular, "best viewed w/", 7.5, 10.5, "#2a2f3a") + text(bold, "ANY BROWSER", 9.5, 23.5, "#11151d"), "#7d8496")

    # magic
    sky = '<defs><radialGradient id="r" cx=".3" cy=".3" r=".9"><stop offset="0" stop-color="#4c3d8e"/><stop offset="1" stop-color="#191635"/></radialGradient></defs><rect width="88" height="31" fill="url(#r)"/>'
    badge("magic", "computers used to feel like magic", sky, text(regular, "computers r", 7.5, 10.5, "#cfc6ff") + text(bold, "magic", 13, 25, "#f1ecff"), "#8f80ff66")


if __name__ == "__main__":
    main()
