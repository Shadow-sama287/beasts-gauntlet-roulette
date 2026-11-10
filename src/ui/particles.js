// src/ui/particles.js — Lightweight ambient mystical particle field
let animId = null;
let particles = [];

export function initParticles(canvas) {
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const count = Math.min(35, Math.floor(width / 35));
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 2 + 0.8,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -Math.random() * 0.4 - 0.15,
    alpha: Math.random() * 0.5 + 0.2,
    hue: Math.random() < 0.5 ? 42 : 270, // Gold or mystic violet
  }));

  function loop() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${p.alpha})`;
      ctx.shadowColor = `hsl(${p.hue}, 80%, 65%)`;
      ctx.shadowBlur = 8;
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    animId = requestAnimationFrame(loop);
  }

  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

