/** QR quiet zone in modules (ISO/IEC 18004 asks for 4); qrRows() has none, so every renderer adds it. */
export const QUIET_ZONE = 4;

/** QR colours for every renderer: pure black modules on a white quiet zone, never themed (scanners need the contrast). */
export const QR_DARK = "#000000";
export const QR_LIGHT = "#ffffff";
