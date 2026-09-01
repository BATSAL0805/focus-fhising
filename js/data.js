/* 손맛 — 어종 카탈로그 및 랜덤 포획 로직 */

const RARITY = {
  common: { key: 'common', label: '일반' },
  rare: { key: 'rare', label: '희귀' },
  legendary: { key: 'legendary', label: '전설' }
};

const RARITY_ORDER = ['common', 'rare', 'legendary'];

const FISH = [
  { id: 'bunou', name: '붕어', rarity: 'common', color: '#4f9aa0', sizeMin: 15, sizeMax: 26 },
  { id: 'piramy', name: '피라미', rarity: 'common', color: '#5c7bb5', sizeMin: 8, sizeMax: 17 },
  { id: 'mikkuragi', name: '미꾸라지', rarity: 'common', color: '#6b5842', sizeMin: 10, sizeMax: 16 },
  { id: 'saeu', name: '민물새우', rarity: 'common', color: '#c9915f', sizeMin: 4, sizeMax: 9 },
  { id: 'hwanggeumbungou', name: '황금붕어', rarity: 'rare', color: '#e0a03c', sizeMin: 26, sizeMax: 38 },
  { id: 'megi', name: '메기', rarity: 'rare', color: '#8a5a2e', sizeMin: 35, sizeMax: 55 },
  { id: 'mujigaesongeo', name: '무지개송어', rarity: 'rare', color: '#7a9fd1', sizeMin: 22, sizeMax: 36 },
  { id: 'hyangeo', name: '향어', rarity: 'rare', color: '#9fae5c', sizeMin: 30, sizeMax: 46 },
  { id: 'ingeo', name: '잉어', rarity: 'legendary', color: '#2a7a80', sizeMin: 45, sizeMax: 68 },
  { id: 'yongwangbungou', name: '용왕붕어', rarity: 'legendary', color: '#d4af37', sizeMin: 60, sizeMax: 90 }
];

const BAITS = [
  { id: 'dduckbap', name: '떡밥 미끼' },
  { id: 'jireongi', name: '지렁이 미끼' }
];

function fishById(id) {
  return FISH.find(f => f.id === id) || null;
}

function fishByRarity(rarity) {
  return FISH.filter(f => f.rarity === rarity);
}

function pickRarityByDuration(durationMin) {
  let weights;
  if (durationMin < 20) weights = { common: 70, rare: 27, legendary: 3 };
  else if (durationMin <= 35) weights = { common: 55, rare: 38, legendary: 7 };
  else weights = { common: 38, rare: 47, legendary: 15 };

  const total = weights.common + weights.rare + weights.legendary;
  let r = Math.random() * total;
  if (r < weights.common) return 'common';
  r -= weights.common;
  if (r < weights.rare) return 'rare';
  return 'legendary';
}

function pickCatch(durationMin) {
  const rarity = pickRarityByDuration(durationMin);
  const pool = fishByRarity(rarity);
  const fish = pool[Math.floor(Math.random() * pool.length)];
  const sizeCm = Math.round((fish.sizeMin + Math.random() * (fish.sizeMax - fish.sizeMin)) * 10) / 10;
  return { fish, sizeCm };
}

/* 물고기 실루엣 SVG (도감/결과/통계 공용) */
function fishSvg(color, opts) {
  opts = opts || {};
  const w = opts.w || 64;
  const h = opts.h || 36;
  const showEye = opts.showEye !== false;
  const eyeColor = opts.eyeColor || '#0d2438';
  return `<svg width="${opts.dispW || w}" height="${opts.dispH || h}" viewBox="0 0 64 36">
    <ellipse cx="26" cy="18" rx="22" ry="14" fill="${color}"></ellipse>
    <path d="M46 18 L64 6 L64 30 Z" fill="${color}"></path>
    ${showEye ? `<circle cx="14" cy="14" r="2.6" fill="${eyeColor}"></circle>` : ''}
  </svg>`;
}

function fishSvgLarge(color) {
  return `<svg width="150" height="90" viewBox="0 0 150 90">
    <ellipse cx="60" cy="45" rx="52" ry="32" fill="${color}"></ellipse>
    <path d="M108 45 L146 20 L146 70 Z" fill="${color}"></path>
    <path d="M30 30 Q60 20 90 32" stroke="#c98a2e" stroke-width="3" fill="none" opacity="0.6"></path>
    <circle cx="30" cy="38" r="5" fill="#1c2b2f"></circle>
  </svg>`;
}

function silhouetteSvg() {
  return `<svg width="52" height="29" viewBox="0 0 64 36">
    <ellipse cx="26" cy="18" rx="22" ry="14" fill="#c9bda8"></ellipse>
    <path d="M46 18 L64 6 L64 30 Z" fill="#c9bda8"></path>
  </svg>`;
}
