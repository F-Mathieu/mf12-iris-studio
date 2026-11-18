/**
 * BAT (bon à tirer) : copie basse définition (1400 px max, JPEG compressé) avec un filigrane répété en diagonale
 * et un bandeau « BAT — ne pas imprimer ». Protection minimale : le client ne reçoit jamais le fichier exploitable.
 * Sans canvas (tests) : les octets sont rendus tels quels.
 */
export async function makeProof(bytes: Uint8Array, o: { mark: string; banner: string; max?: number; quality?: number }): Promise<Uint8Array> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return bytes;
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const k = Math.min(1, (o.max ?? 1400) / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const band = Math.max(28, Math.round(Math.min(w, h) * 0.05));
    const c = document.createElement('canvas');
    c.width = w; c.height = h + band;
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'medium';
    x.drawImage(bmp, 0, 0, w, h);
    // repeated diagonal watermark over the whole image
    const fs = Math.max(18, Math.round(Math.min(w, h) * 0.045));
    x.save();
    x.translate(w / 2, h / 2); x.rotate(-Math.PI / 6);
    x.font = `600 ${fs}px Helvetica, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const stepX = x.measureText(o.mark).width + fs * 2.5, stepY = fs * 3.2, span = Math.hypot(w, h);
    for (let yy = -span; yy <= span; yy += stepY)
      for (let xx = -span + ((yy / stepY) % 2 ? stepX / 2 : 0); xx <= span; xx += stepX) {
        x.lineWidth = Math.max(1, fs / 14); x.strokeStyle = 'rgba(0,0,0,0.28)'; x.strokeText(o.mark, xx, yy);
        x.fillStyle = 'rgba(255,255,255,0.42)'; x.fillText(o.mark, xx, yy);
      }
    x.restore();
    // bottom banner
    x.fillStyle = '#141416'; x.fillRect(0, h, w, band);
    x.fillStyle = '#d8c08f'; x.font = `600 ${Math.round(band * 0.45)}px Helvetica, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(o.banner, w / 2, h + band / 2, w - 20);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', o.quality ?? 0.6));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bmp.close(); }
}
