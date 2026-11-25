/**
 * BAT (bon à tirer) : copie basse définition + filigrane + bandeau « BAT — ne pas imprimer » SOUS l'image (il ne cache rien).
 * Intensités (Paramètres) : la basse définition est la vraie protection, le filigrane signale que ce n'est pas le fichier final.
 * - bande (défaut) : bande sombre en travers du centre (visages), 800 px : lisible pour valider, inutilisable sur un téléphone ;
 * - discret : un seul grand « BAT » en diagonale, très transparent (le montage reste lisible) ;
 * - normal  : motif espacé, transparent ;
 * - fort    : motif serré sur toute l'image.
 * Anti-IA : trame fine irrégulière sur toute l'image + petites marques à des places et angles aléatoires.
 * Sans canvas (tests) : les octets sont rendus tels quels.
 */
export type ProofStyle = 'bande' | 'discret' | 'normal' | 'fort';
export const PROOF_STYLES: Record<ProofStyle, string> = { bande: 'Bande centrale — « BAT · NE PAS UTILISER » sur les visages (conseillé)', discret: 'Discret — un grand « BAT » transparent', normal: 'Normal — motif espacé', fort: 'Fort — motif serré' };
export const DEFAULT_PROOF_STYLE: ProofStyle = 'bande';
/** Short names for the choice made when adding a BAT. */
export const PROOF_STYLE_SHORT: Record<ProofStyle, string> = { bande: 'Bande centrale', discret: 'Discret', normal: 'Normal', fort: 'Fort' };

const STYLE: Record<ProofStyle, { max: number; quality: number; size: number; fill: number; stroke: number; spacing: number | null; hatch: number; scatter: number; band?: number }> = {
  // band: opacity of a dark strip (20 % of the height) across the centre, where faces usually are
  bande: { max: 800, quality: 0.55, size: 0.2, fill: 0.9, stroke: 0, spacing: null, hatch: 0.06, scatter: 0, band: 0.55 },
  discret: { max: 1000, quality: 0.55, size: 0.24, fill: 0.15, stroke: 0.08, spacing: null, hatch: 0.05, scatter: 7 },
  normal: { max: 1100, quality: 0.55, size: 0.032, fill: 0.2, stroke: 0.12, spacing: 2.4, hatch: 0.07, scatter: 5 },
  fort: { max: 1400, quality: 0.6, size: 0.045, fill: 0.42, stroke: 0.28, spacing: 1, hatch: 0.08, scatter: 0 },
};

export async function makeProof(bytes: Uint8Array, o: { mark: string; banner: string; style?: ProofStyle }): Promise<Uint8Array> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return bytes;
  const st = STYLE[o.style ?? DEFAULT_PROOF_STYLE] ?? STYLE[DEFAULT_PROOF_STYLE];
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const k = Math.min(1, st.max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const band = Math.max(26, Math.round(Math.min(w, h) * 0.045));
    const c = document.createElement('canvas');
    c.width = w; c.height = h + band;
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'medium';
    x.drawImage(bmp, 0, 0, w, h);
    x.save();
    x.beginPath(); x.rect(0, 0, w, h); x.clip();
    x.translate(w / 2, h / 2); x.rotate(-Math.atan2(h, w) * (st.band != null ? 0.55 : 1));
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const draw = (text: string, xx: number, yy: number, fs: number) => {
      x.lineWidth = Math.max(1, fs / 18); x.strokeStyle = `rgba(0,0,0,${st.stroke})`; x.strokeText(text, xx, yy);
      x.fillStyle = `rgba(255,255,255,${st.fill})`; x.fillText(text, xx, yy);
    };
    // Against automatic removal (AI « watermark removers » erase isolated, regular marks well): a very fine irregular
    // hatch over the WHOLE image (nothing clean left to copy from) + small marks at random places / angles.
    const span0 = Math.hypot(w, h), gap = Math.max(6, Math.round(Math.min(w, h) / 90));
    x.lineWidth = 1;
    for (let p = -span0, i = 0; p <= span0; p += gap + ((i * 7919) % 3), i++) {
      x.strokeStyle = i % 2 ? `rgba(255,255,255,${st.hatch})` : `rgba(0,0,0,${st.hatch})`;
      x.beginPath(); x.moveTo(-span0, p + Math.sin(i) * gap * 0.4); x.lineTo(span0, p - Math.cos(i) * gap * 0.4); x.stroke();
    }
    const small = Math.max(11, Math.round(Math.min(w, h) * 0.022));
    x.font = `600 ${small}px Helvetica, Arial, sans-serif`;
    for (let i = 0; i < st.scatter; i++) {
      x.save();
      x.translate((Math.random() - 0.5) * w * 0.9, (Math.random() - 0.5) * h * 0.9); x.rotate((Math.random() - 0.5) * 0.9);
      draw(o.mark, 0, 0, small);
      x.restore();
    }
    if (st.band != null) {
      // dark strip across the centre with « BAT · NE PAS UTILISER · reference » repeated
      const bh = Math.round(h * st.size), span = Math.hypot(w, h);
      x.fillStyle = `rgba(20,20,22,${st.band})`; x.fillRect(-span, -bh / 2, span * 2, bh);
      const fs = Math.round(bh * 0.42), t = `BAT · NE PAS UTILISER · ${o.mark.replace(/^BAT · /, '')} · `;
      x.font = `700 ${fs}px Helvetica, Arial, sans-serif`; x.textAlign = 'left'; x.fillStyle = `rgba(255,255,255,${Math.min(0.9, st.band + 0.35)})`;
      const tw = x.measureText(t).width;
      for (let xx = -span; xx < span; xx += tw) x.fillText(t, xx, 0);
    } else if (st.spacing == null) {
      // one big « BAT » across the image + the reference, small, under it
      const fs = Math.round(Math.min(w, h) * st.size);
      x.font = `700 ${fs}px Helvetica, Arial, sans-serif`; draw('BAT', 0, 0, fs);
      const fs2 = Math.max(12, Math.round(fs * 0.16));
      x.font = `600 ${fs2}px Helvetica, Arial, sans-serif`; draw(o.mark, 0, fs * 0.62, fs2);
    } else {
      const fs = Math.max(14, Math.round(Math.min(w, h) * st.size));
      x.font = `600 ${fs}px Helvetica, Arial, sans-serif`;
      const stepX = (x.measureText(o.mark).width + fs * 2.5) * st.spacing, stepY = fs * 3.2 * st.spacing, span = Math.hypot(w, h);
      for (let yy = -span, row = 0; yy <= span; yy += stepY, row++)
        for (let xx = -span + (row % 2 ? stepX / 2 : 0); xx <= span; xx += stepX) draw(o.mark, xx, yy, fs);
    }
    x.restore();
    // banner under the image (outside the montage)
    x.fillStyle = '#141416'; x.fillRect(0, h, w, band);
    x.fillStyle = '#d8c08f'; x.font = `600 ${Math.round(band * 0.45)}px Helvetica, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(o.banner, w / 2, h + band / 2, w - 20);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', st.quality));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bmp.close(); }
}
