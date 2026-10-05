/** Centre square crop rectangle for a width × height image. */
export function squareCropRect(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size };
}

/** Browser only: centre-crops an image file to a square WebP blob. */
export async function cropToSquareWebp(file: File, outSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, size } = squareCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, outSize, outSize);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), "image/webp", 0.9),
  );
}
