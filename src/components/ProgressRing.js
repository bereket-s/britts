/**
 * Progress Ring — SVG animated score ring component
 */

export function createProgressRing(score, total, size = 120) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const radius = (size / 2) - 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return `
    <svg class="progress-ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${pct}% score">
      <circle
        cx="${size/2}" cy="${size/2}" r="${radius}"
        fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"
      />
      <circle
        cx="${size/2}" cy="${size/2}" r="${radius}"
        fill="none" stroke="${color}" stroke-width="10"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size/2} ${size/2})"
        style="transition: stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1);"
      />
      <text x="${size/2}" y="${size/2 - 4}" text-anchor="middle" class="progress-ring-text" style="font-size:${size < 100 ? 12 : 18}px; font-weight:800; fill:var(--text-primary); font-family: Outfit, sans-serif;">
        ${score}/${total}
      </text>
      <text x="${size/2}" y="${size/2 + 16}" text-anchor="middle" style="font-size:10px; fill:var(--text-muted); font-family: Inter, sans-serif;">
        ${pct}%
      </text>
    </svg>
  `;
}
