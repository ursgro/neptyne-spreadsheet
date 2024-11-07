from colorsys import hls_to_rgb, rgb_to_hls

import openpyxl

# From: https://stackoverflow.com/questions/58429823/getting-excel-cell-background-themed-color-as-hex-with-openpyxl/58443509#58443509

RGBMAX = 0xFF  # Corresponds to 255
HLSMAX = 240  # MS excel's tint function expects that HLS is base 240. see:
# https://social.msdn.microsoft.com/Forums/en-US/e9d8c136-6d62-4098-9b1b-dac786149f43/excel-color-tint-algorithm-incorrect?forum=os_binaryfile#d3c2ac95-52e0-476b-86f1-e2a697f24969


def rgb_to_ms_hls(
    red: str | float | tuple[float, float, float],
    green: float | None = None,
    blue: float | None = None,
) -> tuple[int, int, int]:
    """Converts rgb values in range (0,1) or a hex string of the form '[#aa]rrggbb' to HLSMAX based HLS, (alpha values are ignored)"""
    if isinstance(red, tuple):
        red, green, blue = red
    elif isinstance(red, str):
        if len(red) > 6:
            red = red[-6:]  # Ignore preceding '#' and alpha values
        blue = int(red[4:], 16) / RGBMAX
        green = int(red[2:4], 16) / RGBMAX
        red = int(red[0:2], 16) / RGBMAX

    h, ll, s = rgb_to_hls(red, green, blue)  # type: ignore
    return (int(round(h * HLSMAX)), int(round(ll * HLSMAX)), int(round(s * HLSMAX)))


def ms_hls_to_rgb(
    hue: float | tuple[float, float, float],
    lightness: float | None = None,
    saturation: float | None = None,
) -> tuple[float, float, float]:
    """Converts HLSMAX based HLS values to rgb values in the range (0,1)"""
    if isinstance(hue, tuple):
        hue, lightness, saturation = hue
    return hls_to_rgb(hue / HLSMAX, lightness / HLSMAX, saturation / HLSMAX)  # type: ignore


def rgb_to_hex(
    red: float | tuple[float, float, float],
    green: float | None = None,
    blue: float | None = None,
) -> str:
    """Converts (0,1) based RGB values to a hex string 'rrggbb'"""
    if isinstance(red, tuple):
        red, green, blue = red
    return (
        f"{int(round(red * RGBMAX)):02x}{int(round(green * RGBMAX)):02x}{int(round(blue * RGBMAX)):02x}"  # type: ignore
    ).upper()


def get_theme_colors(wb: openpyxl.Workbook) -> list[str]:
    """Gets theme colors from the workbook"""
    # see: https://groups.google.com/forum/#!topic/openpyxl-users/I0k3TfqNLrc
    if not wb.loaded_theme:
        return []
    from openpyxl.xml.functions import QName, fromstring

    xlmns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    root = fromstring(wb.loaded_theme)
    themeEl = root.find(QName(xlmns, "themeElements").text)
    colorSchemes = themeEl.findall(QName(xlmns, "clrScheme").text)
    firstColorScheme = colorSchemes[0]

    colors = []

    for c in [
        "lt1",
        "dk1",
        "lt2",
        "dk2",
        "accent1",
        "accent2",
        "accent3",
        "accent4",
        "accent5",
        "accent6",
    ]:
        accent = firstColorScheme.find(QName(xlmns, c).text)
        for i in list(accent):  # walk all child nodes, rather than assuming [0]
            if "window" in i.attrib["val"]:
                colors.append(i.attrib["lastClr"])
            else:
                colors.append(i.attrib["val"])

    return colors


def tint_luminance(tint: float, lum: float) -> int:
    """Tints a HLSMAX based luminance"""
    # See: http://ciintelligence.blogspot.co.uk/2012/02/converting-excel-theme-color-and-tint.html
    if tint < 0:
        return int(round(lum * (1.0 + tint)))
    else:
        return int(round(lum * (1.0 - tint) + (HLSMAX - HLSMAX * (1.0 - tint))))


def theme_and_tint_to_rgb(theme_colors: list[str], theme: int, tint: float) -> str:
    """Given a workbook, a theme number and a tint return a hex based rgb"""
    rgb = theme_colors[theme]
    h, ll, s = rgb_to_ms_hls(rgb)
    return rgb_to_hex(ms_hls_to_rgb(h, tint_luminance(tint, ll), s))
