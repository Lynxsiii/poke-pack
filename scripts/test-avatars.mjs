// Profile pictures: the style and id rules shared by the site and the Worker, and the generated catalogue.
//   node scripts/test-avatars.mjs
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {avatarId,avatarStyle,avatarKind,avatarShiny,avatarStyleOf,avatarPixel,avatarSrc,avatarFallback,AVATARS,DEFAULT_AVATAR} from '../js/cosmetics.js';
import {AVATAR_GROUPS,AVATAR_SHEET} from '../js/avatar-dex.js';

// Styles: three kinds, each with a shiny; anything else is plain art. Old saves ("art", "pixel") are unchanged.
for (const s of ['art','pixel','anim','art-s','pixel-s','anim-s']) assert.equal(avatarStyle(s),s);
for (const s of ['',null,'home','art-x','shiny','<img>']) assert.equal(avatarStyle(s),s==='art-x'?'art':'art');
assert.equal(avatarKind('anim-s'),'anim'); assert.equal(avatarShiny('anim-s'),true); assert.equal(avatarShiny('pixel'),false);
assert.equal(avatarStyleOf('pixel',true),'pixel-s'); assert.equal(avatarPixel('art-s'),false); assert.equal(avatarPixel('anim'),true);

// Ids: the Pokédex, then PokeAPI's form ids. Everything else is Pikachu.
assert.equal(avatarId(1025),'1025'); assert.equal(avatarId('10034'),'10034');
for (const bad of [0,-3,1026,9999,11000,'x','25; DROP']) assert.equal(avatarId(bad),bad==='25; DROP'?'25':DEFAULT_AVATAR);

// Pictures. No document here, so motion counts as off and an animated avatar is its still sprite.
assert.match(avatarSrc(6,'art-s'),/official-artwork\/shiny\/6\.png$/);
assert.match(avatarSrc(6,'pixel'),/pokemon\/6\.png$/);
assert.match(avatarSrc(6,'anim-s',{still:true}),/pokemon\/shiny\/6\.png$/);
assert.match(avatarFallback(avatarSrc(6,'art-s')),/official-artwork\/6\.png$/);
assert.equal(avatarFallback(avatarSrc(6,'art')),'');
assert.equal(avatarFallback('https://example.com/6.png'),'');

// The catalogue: every Pokédex number once, every entry has art, ids are ones avatarId accepts, sheets exist.
const seen=new Set(); let count=0;
for (const group of AVATAR_GROUPS) {
  for (const kind of ['art','shiny']) assert.ok(existsSync(new URL(`../assets/avatars/${kind}-${group.id}-v${AVATAR_SHEET.version}.webp`,import.meta.url)),`${kind} sheet for ${group.id}`);
  for (const [id,name,flags] of group.list) {
    assert.ok(!seen.has(id),`duplicate ${id}`); seen.add(id); count++;
    assert.equal(avatarId(id),String(id)); assert.ok(name&&flags&1,`${id} has a name and art`);
  }
}
for (let n=1;n<=1025;n++) assert.ok(seen.has(n),`Pokédex #${n} is missing`);
for (const [id] of AVATARS) assert.ok(seen.has(id),`favourite ${id} is in the catalogue`);
console.log(`avatars ok: ${count} pictures in ${AVATAR_GROUPS.length} groups`);
