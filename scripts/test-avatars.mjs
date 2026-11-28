// Profile pictures: the style and id rules shared by the site and the Worker, and the generated catalogue.
//   node scripts/test-avatars.mjs
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {SHINY_OPEN,avatarId,avatarStyle,avatarKind,avatarShiny,avatarStyleOf,avatarPixel,avatarSrc,avatarFallback,AVATARS,DEFAULT_AVATAR} from '../js/cosmetics.js';
import {AVATAR_GROUPS,AVATAR_SHEET} from '../js/avatar-dex.js';

// Styles: three kinds; anything else is plain art. Old saves ("art", "pixel") are unchanged.
// Shiny ("-s") is a style like any other here; whether an account may wear it is the Worker's call (worker/shiny.js).
for (const s of ['art','pixel','anim']) { assert.equal(avatarStyle(s),s); assert.equal(avatarStyle(s+'-s'),SHINY_OPEN?s+'-s':s); }
for (const s of ['',null,'home','art-x','shiny','<img>']) assert.equal(avatarStyle(s),'art');
assert.equal(avatarKind('anim-s'),'anim'); assert.equal(avatarShiny('pixel'),false); assert.equal(avatarShiny('anim-s'),SHINY_OPEN);
assert.equal(avatarStyleOf('pixel',false),'pixel'); assert.equal(avatarPixel('art'),false); assert.equal(avatarPixel('anim'),true);

// Ids: the Pokédex, then PokeAPI's form ids. Everything else is Pikachu.
assert.equal(avatarId(1025),'1025'); assert.equal(avatarId('10034'),'10034');
for (const bad of [0,-3,1026,9999,11000,'x']) assert.equal(avatarId(bad),DEFAULT_AVATAR);

// Pictures. No document here, so motion counts as off and an animated avatar is its still sprite.
assert.match(avatarSrc(6,'art'),/official-artwork\/6\.png$/);
assert.match(avatarSrc(6,'pixel'),/pokemon\/6\.png$/);
assert.match(avatarSrc(6,'anim',{still:true}),/pokemon\/6\.png$/);
assert.match(avatarFallback('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/6.png'),/official-artwork\/6\.png$/);
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

// Which Pokémon a card shows (js/shiny.js): what a Black Label or a mastered set's pick unlocks.
const {cardSpecies,avatarSpecies,speciesInCards} = await import('../js/shiny.js');
const sp = (name) => cardSpecies(name).join(',');
assert.equal(sp('Dark Charizard'),'6'); assert.equal(sp("Blaine's Charizard"),'6'); assert.equal(sp('M Charizard-EX'),'6');
assert.equal(sp('Pikachu & Zekrom-GX'),'25,644'); assert.equal(sp('Mr. Mime'),'122'); assert.equal(sp('Mime Jr.'),'439');
assert.equal(sp('Porygon-Z'),'474'); assert.equal(sp('Porygon2'),'233'); assert.equal(sp('Ho-Oh ex'),'250'); assert.equal(sp('Nidoran ♀'),'29');
assert.equal(sp('Sirfetch’d'),'865'); assert.equal(sp('Type: Null'),'772'); assert.equal(sp('Flabébé'),'669'); assert.equal(sp('Mew ex'),'151');
assert.equal(sp('Ash-Greninja-EX'),'658'); assert.equal(sp("Professor's Research"),''); assert.equal(sp('Pokémon Catcher'),'');
assert.equal(avatarSpecies(25),25); assert.equal(avatarSpecies(10034),6); assert.equal(avatarSpecies(99999),0);
assert.deepEqual(speciesInCards([{name:'Mew ex',supertype:'Pokémon'},{name:'Bulbasaur'},{name:'Mewtwo',supertype:'Trainer'}]),[1,151]);
for (const group of AVATAR_GROUPS) for (const [id,,,of] of group.list) assert.ok(id<=10000 ? of===undefined : of>=1&&of<=1025,`form ${id} names its Pokémon`);
console.log('shiny rules ok');
