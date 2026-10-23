// Product catalogue: every option, its geometry parameters and its price (EUR, incl. VAT).
// Labels live in the locale dictionaries under opt.<kind>.<id>.

export const SIZES = [
  { id: 'armchair', seats: 1, seatWidth: 0.74, price: 890, maxPillows: 2 },
  { id: 'loveseat', seats: 2, seatWidth: 1.4, price: 1390, maxPillows: 3 },
  { id: 'sofa', seats: 3, seatWidth: 2.0, price: 1790, maxPillows: 4 },
];

export const ARMS = [
  { id: 'round', width: 0.22, radius: 0.1, price: 0 },
  { id: 'slim', width: 0.12, radius: 0.045, price: 0 },
  { id: 'none', width: 0, radius: 0, price: -70 },
];

export const DEPTHS = [
  { id: 'classic', depth: 0.92, price: 0 },
  { id: 'lounge', depth: 1.06, price: 140 },
];

// price is per seat; physical params feed MeshPhysicalMaterial; leadWeeks drives the delivery estimate
export const MATERIALS = [
  {
    id: 'boucle', price: 90, leadWeeks: [3, 4], martindale: 60000,
    roughness: 0.96, sheen: 0.7, sheenRoughness: 0.85, sheenTint: 0.35, clearcoat: 0, normal: 1.25, repeat: 5,
  },
  {
    id: 'velvet', price: 75, leadWeeks: [3, 4], martindale: 100000,
    roughness: 0.78, sheen: 1, sheenRoughness: 0.32, sheenTint: 0.45, clearcoat: 0, normal: 0.35, repeat: 3,
  },
  {
    id: 'leather', price: 210, leadWeeks: [5, 6], martindale: 90000,
    roughness: 0.56, sheen: 0.15, sheenRoughness: 0.6, sheenTint: 0.1, clearcoat: 0.12, normal: 0.7, repeat: 4,
  },
  {
    id: 'linen', price: 0, leadWeeks: [2, 3], martindale: 35000,
    roughness: 0.93, sheen: 0.35, sheenRoughness: 0.9, sheenTint: 0.25, clearcoat: 0, normal: 0.9, repeat: 7,
  },
];

export const COLORS = [
  { id: 'milk', hex: '#e8e2d6' },
  { id: 'sand', hex: '#c9b18f' },
  { id: 'blush', hex: '#d6a49a' },
  { id: 'terracotta', hex: '#b35a3a' },
  { id: 'mustard', hex: '#c8952a' },
  { id: 'sage', hex: '#879079' },
  { id: 'ocean', hex: '#2c5a70' },
  { id: 'bordeaux', hex: '#6b2232' },
  { id: 'graphite', hex: '#3a3a3d' },
];

export const LEG_STYLES = [
  { id: 'taper', height: 0.15, price: 0 },
  { id: 'sled', height: 0.16, price: 110 },
  { id: 'plinth', height: 0.07, price: 60 },
];

export const LEG_FINISHES = [
  { id: 'oak', type: 'wood', color: '#d2ab80', roughness: 0.55, price: 0 },
  { id: 'walnut', type: 'wood', color: '#6e4930', roughness: 0.5, price: 65 },
  { id: 'black', type: 'metal', color: '#1c1c1e', roughness: 0.38, price: 30 },
  { id: 'brass', type: 'metal', color: '#d0a85c', roughness: 0.22, price: 100 },
];

export const PILLOW_PRICE = 45;

export const PIPING = [
  { id: 'tone', price: 0 },
  { id: 'contrast', price: 45 },
  { id: 'none', price: 0 },
];

// price is per seat
export const TUFTING = [
  { id: 'off', price: 0 },
  { id: 'on', price: 65 },
];

export const INSTALMENTS = 10;

export const DEFAULTS = {
  size: 'loveseat',
  arms: 'round',
  depth: 'classic',
  material: 'boucle',
  color: 'milk',
  legStyle: 'taper',
  legFinish: 'oak',
  pillows: 2,
  pillowColor: 'terracotta',
  piping: 'tone',
  tufting: 'off',
};

export const PRESETS = [
  { id: 'cloud', cfg: { size: 'loveseat', material: 'boucle', color: 'milk', arms: 'round', depth: 'lounge', legStyle: 'plinth', legFinish: 'oak', pillows: 2, pillowColor: 'sand', piping: 'tone', tufting: 'off' } },
  { id: 'nordic', cfg: { size: 'sofa', material: 'linen', color: 'sage', arms: 'slim', depth: 'classic', legStyle: 'taper', legFinish: 'oak', pillows: 3, pillowColor: 'milk', piping: 'contrast', tufting: 'off' } },
  { id: 'retro', cfg: { size: 'loveseat', material: 'velvet', color: 'mustard', arms: 'round', depth: 'classic', legStyle: 'taper', legFinish: 'walnut', pillows: 2, pillowColor: 'terracotta', piping: 'contrast', tufting: 'on' } },
  { id: 'noir', cfg: { size: 'sofa', material: 'leather', color: 'graphite', arms: 'slim', depth: 'lounge', legStyle: 'sled', legFinish: 'black', pillows: 0, pillowColor: 'graphite', piping: 'tone', tufting: 'on' } },
  { id: 'ocean', cfg: { size: 'armchair', material: 'velvet', color: 'ocean', arms: 'round', depth: 'lounge', legStyle: 'sled', legFinish: 'brass', pillows: 1, pillowColor: 'mustard', piping: 'contrast', tufting: 'on' } },
];

export const byId = (list, id) => list.find((o) => o.id === id) ?? list[0];

// rows: { group, kind, id, value } — the UI renders "<group> · <option label>"
export function computePrice(cfg) {
  const size = byId(SIZES, cfg.size);
  const row = (group, kind, list, id, value) => ({ group, kind, id: byId(list, id).id, value });
  const rows = [
    row('base', 'size', SIZES, cfg.size, size.price),
    row('arms', 'arms', ARMS, cfg.arms, byId(ARMS, cfg.arms).price),
    row('depth', 'depth', DEPTHS, cfg.depth, byId(DEPTHS, cfg.depth).price),
    row('upholstery', 'material', MATERIALS, cfg.material, byId(MATERIALS, cfg.material).price * size.seats),
    row('legs', 'leg', LEG_STYLES, cfg.legStyle, byId(LEG_STYLES, cfg.legStyle).price),
    row('finish', 'finish', LEG_FINISHES, cfg.legFinish, byId(LEG_FINISHES, cfg.legFinish).price),
    row('piping', 'piping', PIPING, cfg.piping, byId(PIPING, cfg.piping).price),
    row('back', 'tufting', TUFTING, cfg.tufting, byId(TUFTING, cfg.tufting).price * size.seats),
    { group: 'pillows', count: cfg.pillows, value: cfg.pillows * PILLOW_PRICE },
  ];
  return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
}
