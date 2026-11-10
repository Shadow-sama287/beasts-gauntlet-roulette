// src/ui/wheelCanvas.js — Razor-sharp canvas wheel renderer with tier colors and beast art
import { TIER_COLORS } from '../roulette.js';

// Cache preloaded images so wheel renders thumbnails
const imageCache = new Map();

export function preloadBeastImages(beasts) {
  beasts.forEach((b) => {
    if (b.art && !imageCache.has(b.id)) {
      const img = new Image();
      img.src = b.art;
      imageCache.set(b.id, img);
    }
  });
}

/**
 * Draws the roulette wheel on a canvas element.
 * Slice 0 starts at 12 o'clock (-PI / 2) and proceeds clockwise.
 */
export function drawWheel(canvas, slices) {
  if (!canvas || !slices || slices.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.clientWidth || 360, 440);
  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 10;
  const innerRadius = radius * 0.28;

  ctx.clearRect(0, 0, size, size);

  // Offset so angle 0 is at 12 o'clock (-Math.PI / 2)
  const angleOffset = -Math.PI / 2;

  slices.forEach((slice) => {
    const startRad = angleOffset + slice.startAngleRad;
    const endRad = angleOffset + slice.endAngleRad;
    const midRad = (startRad + endRad) / 2;
    const spanDeg = slice.endAngle - slice.startAngle;
    const tierColor = TIER_COLORS[slice.rarity] || '#f2f2f2';

    // Slice background
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startRad, endRad);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, radius);
    grad.addColorStop(0, '#161622');
    grad.addColorStop(0.65, '#1e1c2e');
    grad.addColorStop(1, tierColor);
    ctx.fillStyle = grad;
    ctx.fill();

    // Slice border
    ctx.lineWidth = slices.length > 50 ? 0.75 : 1.5;
    ctx.strokeStyle = '#2a2a3a';
    ctx.stroke();

    // Draw content inside slice
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midRad);

    if (spanDeg >= 12) {
      // Wide slices (low slice count): draw tangential text and thumbnail
      const textRadius = radius * 0.68;
      const imgRadius = radius * 0.44;

      const img = imageCache.get(slice.beast.id);
      if (img && img.complete && img.naturalWidth > 0) {
        const imgSize = Math.min(30, radius * 0.18);
        ctx.save();
        ctx.translate(imgRadius, 0);
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, imgSize / 2, 0, Math.PI * 2);
        ctx.clip();
        try {
          ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
        } catch {}
        ctx.restore();
      }

      ctx.save();
      ctx.translate(textRadius, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      const shortName = slice.beast.name.length > 10 ? slice.beast.name.slice(0, 9) + '…' : slice.beast.name;
      ctx.fillText(shortName, 0, -5);

      ctx.fillStyle = tierColor;
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText(`T${slice.rarity}`, 0, 7);
      ctx.restore();
    } else if (spanDeg >= 4.5) {
      // Medium slices: write name and tier radially pointing outwards
      ctx.save();
      ctx.translate(innerRadius + 14, 0);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 3;
      const maxLen = spanDeg < 7 ? 6 : 9;
      const shortName = slice.beast.name.length > maxLen ? slice.beast.name.slice(0, maxLen - 1) + '…' : slice.beast.name;
      ctx.fillText(shortName, 0, 0);

      // Tier pip near the rim
      ctx.beginPath();
      ctx.arc(radius - innerRadius - 18, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = tierColor;
      ctx.fill();
      ctx.restore();
    } else {
      // Ultra-narrow slices (high density): draw glowing tier ray near rim
      ctx.beginPath();
      ctx.arc(radius - 12, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = tierColor;
      ctx.fill();
    }

    ctx.restore();
  });

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3a3852';
  ctx.stroke();

  // Decorative outer rim dots (capped at 48 dots)
  const numDots = Math.min(48, Math.max(24, Math.floor(slices.length / 2)));
  for (let i = 0; i < numDots; i++) {
    const angle = (i / numDots) * Math.PI * 2;
    const dotX = cx + (radius - 1) * Math.cos(angle);
    const dotY = cy + (radius - 1) * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c542';
    ctx.fill();
  }

  // Inner hub disc
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
  hubGrad.addColorStop(0, '#2e264a');
  hubGrad.addColorStop(0.8, '#14141f');
  hubGrad.addColorStop(1, '#0b0b10');
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f5c542';
  ctx.stroke();

  // Hub center text
  ctx.fillStyle = '#f5c542';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPIN', cx, cy);
}

