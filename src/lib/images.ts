/** Resizes an image file in the browser (off the main thread when OffscreenCanvas is available). */
async function resize(bmp: ImageBitmap, max: number, quality: number): Promise<{ data: string; w: number; h: number }> {
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  return { data: c.toDataURL('image/jpeg', quality), w, h };
}

/** Returns a thumbnail (480px) and a display version (2048px) as JPEG data URLs. */
export async function processImage(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  try {
    const full = await resize(bmp, 2048, 0.86);
    const thumb = await resize(bmp, 480, 0.8);
    return { thumb: thumb.data, full: full.data, width: full.w, height: full.h };
  } finally { bmp.close(); }
}

export const mimeOf = (name: string) =>
  ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff' } as Record<string, string>)[
    name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
