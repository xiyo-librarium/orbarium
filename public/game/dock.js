// 寄った画面の下の丸（家・部屋・芽・地形・設備）と、丸を押すと出る道具。11/27 の試作（?proto・&ui=2）
export const CAT_ICON = {
  house: '<path d="M4 11.5 12 4.5l8 7"/><path d="M6 10v9.5h12V10"/><path d="M3.5 19.5h17"/>',
  room: '<path d="M4 20V5h16v15"/><path d="M12 5v7"/><path d="M12 15v5"/><path d="M6.5 16h3"/><path d="M15 9.5h2.5"/>',
  life: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5z"/><path d="M12 15.5c0-3-2-5-5.5-5 0 3 2 5 5.5 5z"/><path d="M7 21h10"/>',
  land: '<path d="M2.5 19.5h19"/><path d="M2.5 19.5v-5h5v-4h5v4h4v-7h5v12"/>',
  equip: '<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1.2M8 12.3v1.2M2.5 8h1.2M12.3 8h1.2M4.1 4.1l.9.9M11 11l.9.9M4.1 11.9l.9-.9M11 5l.9-.9"/><path d="M14 13h6.5v8H14z"/><path d="M15.5 16.5h3.5"/>'
};
export const CATS = [
  { id: 'house', name: '家' }, { id: 'room', name: '部屋' }, { id: 'life', name: '芽' }, { id: 'land', name: '地形' }, { id: 'equip', name: '設備' }
];
// 道具の小さな絵
export const TOOL_ICON = {
  build: '<path d="M4 20h16"/><path d="M6 20v-8l6-5 6 5v8"/><path d="M12 3v3"/><path d="M10.5 4.5h3"/>',
  field: '<path d="M3 18c3-2 6-2 9 0s6 2 9 0"/><path d="M3 13c3-2 6-2 9 0s6 2 9 0"/><path d="M3 8c3-2 6-2 9 0s6 2 9 0"/>',
  fruit: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21"/><circle cx="10" cy="8" r=".9" fill="currentColor"/><circle cx="14" cy="10.5" r=".9" fill="currentColor"/>',
  hedge: '<path d="M3 18h18"/><path d="M4 18v-5a3 3 0 0 1 5-2 3 3 0 0 1 6 0 3 3 0 0 1 5 2v5"/>',
  coop: '<path d="M4 11 12 5l8 6v9H4z"/><circle cx="12" cy="14.5" r="2.2"/><path d="M11 17v2.5M13 17v2.5"/>',
  heap: '<path d="M3 20h18"/><path d="M5 20c1-5 3.5-8 7-8s6 3 7 8"/><path d="M9 16l1.5-1.5M13 15l1.5 1"/>',
  up: '<path d="M3 20h18"/><path d="M6 20v-6h12v6"/><path d="M12 11V4"/><path d="M9 7l3-3 3 3"/>',
  down: '<path d="M3 13h5v7h8v-7h5"/><path d="M12 4v7"/><path d="M9 8l3 3 3-3"/>',
  level: '<path d="M3 15h18"/><path d="M3 19h18"/><path d="M6 11l3-3 3 3 3-3 3 3"/>',
  stone: '<path d="M3 20h18"/><path d="M4 20v-4h6v4M10 16v-4h6v8M16 12h4v8"/>',
  pv: '<path d="M3 17l3-9h14l-3 9z"/><path d="M4.5 12.5h14M9.5 8l-2 9M14.5 8l-2 9"/><path d="M12 17v4"/>',
  batt: '<rect x="6" y="5" width="12" height="16" rx="1.5"/><path d="M10 3h4"/><path d="M12.5 9l-2 4h3l-2 4"/>',
  tank: '<path d="M6 6h12v14H6z"/><path d="M6 10h12"/><path d="M12 3v3"/><path d="M9 15c1 1.2 2 1.2 3 0s2-1.2 3 0"/>',
  pump: '<rect x="5" y="11" width="9" height="9" rx="1.5"/><path d="M14 14h4V5h-4"/><circle cx="9.5" cy="15.5" r="2"/>',
  pond: '<path d="M3 14c2.5 4 15.5 4 18 0"/><path d="M5 14c2-1.5 12-1.5 14 0"/><path d="M8 10c1-1 2-1 3 0M13 8c1-1 2-1 3 0"/>',
  filter: '<path d="M7 4c-1.5 2-2.5 3.5-2.5 5a2.5 2.5 0 0 0 5 0c0-1.5-1-3-2.5-5z"/><path d="M17 12c-1.5 2-2.5 3.5-2.5 5a2.5 2.5 0 0 0 5 0c0-1.5-1-3-2.5-5z"/><path d="M10 9.5c2 0 3 .8 4 2.5"/><circle cx="17" cy="17" r=".7" fill="currentColor"/><circle cx="16" cy="15.5" r=".5" fill="currentColor"/>'
};
// パネルの目次のタイル
Object.assign(TOOL_ICON, {
  t_floor: '<path d="M3 16l9-5 9 5-9 5z"/><path d="M7.5 13.5l9 5M16.5 13.5l-9 5" opacity=".5"/><path d="M12 3v5M9.5 5.5 12 3l2.5 2.5"/>',
  t_method: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 10h16M4 14.5h16M9 5v5M15 10v4.5M9 14.5V19"/>',
  t_roof: '<path d="M2.5 13 12 5l9.5 8"/><path d="M6 11v8h12v-8"/><path d="M12 5V2.5"/>',
  t_open: '<rect x="4" y="4" width="10" height="16"/><rect x="6.5" y="7" width="5" height="5"/><path d="M17 20V8h4v12"/><circle cx="18" cy="14.5" r=".6" fill="currentColor"/>',
  t_deep: '<path d="M3 9h18"/><path d="M6 9v11M18 9v11M12 9v11"/><path d="M3 20h18" stroke-dasharray="2 2"/><path d="M6 4h12v5H6z"/>',
  t_use: '<path d="M3 20h18"/><path d="M5 20v-8l7-5 7 5v8"/><path d="M9 20v-5h6v5"/>',
  t_part: '<rect x="3" y="4" width="18" height="16"/><path d="M12 4v6M12 14v6"/><path d="M14.5 12h0" stroke-linecap="round" stroke-width="2.4"/>',
  t_water: '<path d="M7 4v5a5 5 0 0 0 10 0V4"/><path d="M12 14v6M8 20h8"/><path d="M10 7c0 1 .8 2 2 2"/>',
  t_stove: '<path d="M4 20h16"/><path d="M5 20V10h14v10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/><path d="M12 7c-1-1-1-2 0-3 1 1 1 2 0 3z"/>',
  t_furn: '<path d="M4 12h16v4H4z"/><path d="M5 16v3M19 16v3"/><path d="M6 12V8h12v4"/>'
});
// 丸ごとの道具。tool/sub は main の道具（なぞる・押す）に渡す。act は main で受ける
export const CAT_TOOLS = {
  house: [{ id: 'build', name: '建てる', tool: 'house', how: 'なぞる' }],
  room: [],
  life: [
    { id: 'field', name: '畑', tool: 'field', how: 'なぞる' },
    { id: 'fruit', name: '果樹', tool: 'tree', sub: 'tree', how: '押す・なぞる' },
    { id: 'hedge', name: '生け垣', tool: 'tree', sub: 'hedge', how: 'なぞる' },
    { id: 'coop', name: 'ニワトリ', tool: 'shed', sub: 'coop', how: '押す' },
    { id: 'heap', name: '堆肥小屋', tool: 'shed', sub: 'heap', how: 'なぞる' }
  ],
  land: [
    { id: 'up', name: '上げる', tool: 'terrain', sub: 'up', how: 'なぞる' },
    { id: 'down', name: '下げる', tool: 'terrain', sub: 'down', how: 'なぞる' },
    { id: 'level', name: '平らに', tool: 'terrain', sub: 'level', how: 'なぞる' },
    { id: 'stone', name: '石垣', tool: 'terrain', sub: 'stone', how: '段のふちをなぞる' }
  ],
  equip: [
    { id: 'pv', name: '太陽光', act: 'pv', learn: 'offgrid' },
    { id: 'batt', name: '蓄電池', act: 'batt', learn: 'offgrid' },
    { id: 'tank', name: 'タンク', tool: 'water', sub: 'tank', how: '押す' },
    { id: 'pump', name: 'ポンプ', tool: 'water', sub: 'pump', how: '押す' },
    { id: 'pond', name: '池', tool: 'water', sub: 'pond', how: 'なぞる' },
    { id: 'filter', name: '浄化設備', tool: 'water', sub: 'filter', how: 'なぞる' }
  ]
};
// 押した物は、どの丸の物か
export function catOf(p, cut) {
  if (!p) return null;
  if (p.kind === 'building') return cut ? 'room' : 'house';
  if (['tank', 'batt', 'pump', 'pond', 'filter', 'settle', 'pvg'].includes(p.kind)) return 'equip';
  if (['beds', 'tree', 'trees', 'heap', 'coop'].includes(p.kind)) return 'life';
  return null;
}
