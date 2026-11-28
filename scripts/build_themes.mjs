// Writes the bold colour themes into css/themes.css, between the BEGIN/END markers.
//
//   node scripts/build_themes.mjs
//
// A bold theme brings its whole look: ground, boxes, lines, slab, key, hard
// shadow, the pattern on the ground and (optionally) slanted bands behind the
// page. Each one is light or dark by itself (`mode`), so the Light/Dark choice
// in Settings only moves Rotom. Add a theme here and to THEMES in js/themes.js
// (same id, its `mode`, and its ground colour), run this, bump themes.css?v=.
import {readFileSync, writeFileSync} from 'node:fs';

const dot = (c, r = 1.6) => `radial-gradient(${c} ${r}px, transparent ${r + 0.1}px)`;
const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16)).join(' ');
const stripes = (c) => `repeating-linear-gradient(104deg, ${c} 0 3px, transparent 3px 14px)`;
// Slanted bands across the screen, on the same 14 degree lean as every plate.
const bands = (...stops) => `linear-gradient(104deg, ${stops.join(', ')})`;

const BASE = {
  light: {'color-scheme': 'light', onk: '#ffffff', box: '#ffffff', badWash: '#ffe3e5', badWash2: '#ffc9cd', redText: '#d3202d', ok: '#1f9d44', gold: '#b98900', gold2: '#dba400', shade: '0 40 50', shadeA: [0.22, 0.2]},
  dark: {'color-scheme': 'dark', badWash: '#3d181d', badWash2: '#54212a', redText: '#ff6b76', ok: '#35d15a', gold: '#ffd21f', gold2: '#ffe26a', shade: '0 0 0', shadeA: [0.5, 0.45]},
};

/* k ink/lines/text, k2 k3 quieter text (must read on bg and on box), bg ground, box, box2 a cell in a box,
   rule rule2 dividers, slab, acc accent on a box (links, icons), wash accent wash, key keyHover, keyInk the
   key colour as lettering on an ink plate, well the deepest surface, drop the hard shadow (r g b / a),
   dots the tiled ground pattern (+ dotsSize), slabDots, art the fixed layer behind the page. */
const THEMES = {
  haunt: {mode: 'dark', k: '#f4edff', onk: '#1c0b3c', k2: '#cdbdf2', k3: '#b09ddd', bg: '#24104d', box: '#361a70', box2: '#40207f', rule: '#51309a', rule2: '#7350bd',
    slab: '#ff2f9e', acc: '#ff86cb', wash: '#4d1c63', key: '#c8ff3a', keyHover: '#dbff7c', keyInk: '#4c6a00', well: '#1a0a3a', drop: '8 0 30 / 0.55',
    dots: dot('rgb(255 47 158 / 0.22)'), art: bands('transparent 0 8%', '#2f1663 8% 34%', 'transparent 34% 58%', '#2f1663 58% 64%', 'transparent 64%')},
  rocket: {mode: 'dark', k: '#ffffff', onk: '#0d0d0e', k2: '#c4c4c9', k3: '#a0a0a8', bg: '#0d0d0e', box: '#1c1c1f', box2: '#252529', rule: '#35353a', rule2: '#55555c',
    slab: '#e3202b', acc: '#ff6a70', wash: '#3d1216', key: '#ff3640', keyHover: '#ff6a70', keyInk: '#b3121b', well: '#060606', drop: '227 32 43 / 0.55',
    dots: 'none', slabDots: stripes('rgb(255 255 255 / 0.16)'), dotsSize: 'auto',
    art: `${stripes('rgb(255 255 255 / 0.035)')}, ${bands('transparent 0 52%', '#2a0b0e 52% 80%', 'transparent 80% 93%', '#e3202b 93% 94.5%', 'transparent 94.5%')}`},
  emerald: {mode: 'dark', k: '#eafff6', onk: '#04261f', k2: '#b4e3d2', k3: '#8fcab6', bg: '#053b30', box: '#0a4c3e', box2: '#0e5a4a', rule: '#17705c', rule2: '#2f927a',
    slab: '#ff5b3d', acc: '#ffd21f', wash: '#0f5f4d', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#6b5200', well: '#032a22', drop: '0 20 15 / 0.55',
    dots: dot('rgb(255 210 31 / 0.16)'), art: bands('transparent 0 66%', '#0a4c3e 66% 82%', 'transparent 82% 93%', '#ffd21f 93% 94.5%', 'transparent 94.5%')},
  magma: {mode: 'dark', k: '#fff1e8', onk: '#2a0d08', k2: '#f0c2a8', k3: '#d49a7c', bg: '#2a0d08', box: '#3d150d', box2: '#4a1b11', rule: '#63281a', rule2: '#8a3d28',
    slab: '#ff7a1a', acc: '#ffb066', wash: '#5a2410', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#6b5200', well: '#1c0704', drop: '10 0 0 / 0.55',
    dots: dot('rgb(255 122 26 / 0.18)'), art: bands('transparent 0 10%', '#3a120a 10% 30%', 'transparent 30% 68%', '#3a120a 68% 76%', 'transparent 76% 93%', '#ff7a1a 93% 94.5%', 'transparent 94.5%')},
  goldstar: {mode: 'dark', k: '#fff8e1', onk: '#12100a', k2: '#d6c999', k3: '#b0a26f', bg: '#12100a', box: '#1f1b10', box2: '#2a2516', rule: '#3d361f', rule2: '#5e5330',
    slab: '#e0a800', acc: '#ffd35a', wash: '#3a2f0c', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#6b5200', well: '#0a0905', drop: '224 168 0 / 0.5',
    dots: dot('rgb(224 168 0 / 0.2)', 1.2), art: bands('transparent 0 58%', '#1c180e 58% 82%', 'transparent 82% 92%', '#e0a800 92% 92.8%', 'transparent 92.8% 94.4%', '#e0a800 94.4% 95.2%', 'transparent 95.2%')},
  prism: {mode: 'light', k: '#14171b', k2: '#4a4563', k3: '#5d5878', bg: '#f3d9ff', box2: '#f8f5ff', rule: '#e2dcf2', rule2: '#b9b0d6',
    slab: '#ffffff', acc: '#7a3fe0', wash: '#efe6ff', key: '#ff4fa3', keyHover: '#ff7dbb', keyInk: '#ff7dbb', well: '#eae4f6', drop: '80 30 140 / 0.25',
    dots: 'none', slabDots: dot('rgb(122 63 224 / 0.16)'),
    art: `${dot('rgb(255 255 255 / 0.55)')} 0 0 / 14px 14px, linear-gradient(104deg, #ff9fd0 0%, #ffc59a 18%, #fff09a 34%, #a8f3c0 52%, #9ad8ff 70%, #c5a8ff 88%, #ff9fd0 100%)`},
  dotmatrix: {mode: 'light', k: '#0f380f', k0: '#0f380f', onk: '#d3e29a', k2: '#1e4a1a', k3: '#2a5a24', bg: '#9bbc0f', box: '#d3e29a', box2: '#c6d886', rule: '#a9c04f', rule2: '#6f8f2a',
    slab: '#306230', acc: '#306230', wash: '#b9cf6e', key: '#f1f7c4', keyHover: '#ffffff', keyInk: '#d3e29a', well: '#b9cf6e', drop: '48 98 48 / 1', hp: '#306230',
    dots: 'conic-gradient(rgb(15 56 15 / 0.1) 25%, transparent 0 50%, rgb(15 56 15 / 0.1) 0 75%, transparent 0)', slabDots: 'conic-gradient(rgb(155 188 15 / 0.3) 25%, transparent 0 50%, rgb(155 188 15 / 0.3) 0 75%, transparent 0)', dotsSize: '8px 8px'},
  sunset: {mode: 'light', k: '#2a1020', k0: '#2a1020', k2: '#5a2a3c', k3: '#6b3447', bg: '#ffb27a', box2: '#fff3ea', rule: '#f3d9cc', rule2: '#d9a894',
    slab: '#9b6bff', acc: '#6a35c9', wash: '#ece2ff', key: '#ffe14a', keyHover: '#fff08a', keyInk: '#ffe14a', well: '#fbe4d6', drop: '90 20 40 / 0.28',
    dots: 'none', art: `${dot('rgb(255 255 255 / 0.3)')} 0 0 / 14px 14px, ${bands('#ffd08a 0 30%', '#ffa978 30% 55%', '#ff8f8f 55% 78%', '#f77fb5 78% 100%')}`},
  surf: {mode: 'light', k: '#14171b', k2: '#17434c', k3: '#1d5360', bg: '#27c6da', box2: '#eefafc', rule: '#cfe6ea', rule2: '#8fbcc4',
    slab: '#078399', acc: '#007f93', wash: '#d3f1f5', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#ffd21f', well: '#dff1f4', drop: '0 50 60 / 0.3',
    dots: dot('rgb(255 255 255 / 0.28)')},
  volt: {mode: 'light', k: '#14171b', k2: '#4d4210', k3: '#5f5216', bg: '#ffd426', box2: '#fffbe8', rule: '#eee3b4', rule2: '#c9b970',
    slab: '#ff9a1f', acc: '#b3261c', wash: '#ffe9e5', key: '#ff5b3d', keyHover: '#ff7d64', keyInk: '#ffd426', well: '#f8efc6', drop: '60 45 0 / 0.3',
    dots: 'none', slabDots: stripes('rgb(255 255 255 / 0.2)'), dotsSize: 'auto', art: stripes('rgb(20 23 27 / 0.05)')},
  rival: {mode: 'light', k: '#14171b', k2: '#12305c', k3: '#142f57', bg: '#4f9dff', box2: '#eff5ff', rule: '#d3e1f6', rule2: '#96b3dd',
    slab: '#ff4a3d', acc: '#1d5fd0', wash: '#dbe8ff', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#ffd21f', well: '#e1ebfd', drop: '0 25 80 / 0.32',
    dots: dot('rgb(255 255 255 / 0.22)')},
  berry: {mode: 'light', k: '#10231d', k0: '#10231d', k2: '#34564a', k3: '#456a5d', bg: '#b4ecd6', box2: '#f1fbf7', rule: '#d2e9df', rule2: '#9cc5b4',
    slab: '#ff5c8a', acc: '#cf2c63', wash: '#ffe1ea', key: '#ffd21f', keyHover: '#ffe26a', keyInk: '#ffd21f', well: '#e0f2ea', drop: '0 60 40 / 0.25',
    dots: 'linear-gradient(rgb(16 35 29 / 0.07) 1.5px, transparent 1.5px), linear-gradient(90deg, rgb(16 35 29 / 0.07) 1.5px, transparent 1.5px)'},
};

function block(id, t) {
  const b = {...BASE[t.mode], ...t};
  const dropSm = b.drop.replace(/\/ ([\d.]+)$/, (m, a) => `/ ${Math.max(0, a - 0.05).toFixed(2).replace(/0$/, '')}`);
  const v = {
    'color-scheme': b['color-scheme'],
    '--k': b.k, '--on-k': b.onk, ...(b.k0 ? {'--k0': b.k0} : {}), '--k-2': b.k2, '--k-3': b.k3,
    '--bg': b.bg, '--box': b.box, '--box-rgb': rgb(b.box), '--box-2': b.box2, '--rule': b.rule, '--rule-2': b.rule2,
    '--cy': b.slab, '--slab': b.slab, '--cy-2': b.acc, '--cy-3': b.wash,
    '--yel': b.key, '--yel-2': b.keyHover, '--yel-k': b.keyInk, ...(b.hp ? {'--hp': b.hp} : {}),
    '--graphite': b.box2, '--well': b.well, '--ink-2': b.k2, '--surface-2': b.box2, '--surface-3': b.rule, '--counter': b.box2, '--felt': b.well, '--key-off': b.box2,
    '--bad-wash': b.badWash, '--bad-wash-2': b.badWash2, '--red-text': b.redText, '--bad': b.redText, '--ok': b.ok, '--gold': b.gold, '--gold-2': b.gold2, '--ty-secret': b.k,
    '--hl': rgb(b.k), '--ambient': rgb(b.slab),
    '--dots': b.dots, '--dots-light': b.slabDots || dot('rgb(255 255 255 / 0.22)'), '--dots-size': b.dotsSize || '14px 14px',
    '--drop': `6px 8px 0 rgb(${b.drop})`, '--drop-sm': `3px 4px 0 rgb(${dropSm})`,
    '--ground-art': b.art || 'none',
  };
  const body = Object.entries(v).map(([k, val]) => `${k}: ${val};`).join(' ');
  return `/* ${id} */\n[data-palette="${id}"], html[data-theme] [data-palette="${id}"], html[data-theme][data-palette="${id}"] { ${body} }`;
}

const out = Object.entries(THEMES).map(([id, t]) => block(id, t)).join('\n');
const file = new URL('../css/themes.css', import.meta.url);
const css = readFileSync(file, 'utf8');
const BEGIN = '/* BEGIN bold themes: written by scripts/build_themes.mjs, edit there */';
const END = '/* END bold themes */';
const head = css.includes(BEGIN) ? css.slice(0, css.indexOf(BEGIN)) : css.replace(/\n*$/, '\n');
const tail = css.includes(END) ? css.slice(css.indexOf(END) + END.length) : '\n';
writeFileSync(file, `${head}${BEGIN}\n${out}\n${END}${tail}`);
console.log(`${Object.keys(THEMES).length} themes written`);
