import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const start=source.indexOf('function openInspect(');
const end=source.indexOf('\nels.inspectInfo.addEventListener(',start);
let rendered;
const open=vm.runInNewContext(source.slice(start,end)+'\nopenInspect',{
  findCard:id=>({id,name:'Test ex',rarity:'Double Rare'}),
  ownedReverse:()=>true, // A reverse copy is owned as well as the normal copy.
  inspectCard:null,inspectRange:'',inspectOpenedAt:0,
  els:{inspectArt:{},inspectInfo:{}},tcgFace:card=>{rendered=card;return '';},
  numberLine:()=>'',esc:s=>s||'',rarityPips:()=>'',rarityLine:()=>'',
  paintInspect:()=>{},openDialog:()=>{},Date,
});
open('test-1',false);
assert.equal(Boolean(rendered.reverse),false,'normal card must stay normal even when a reverse copy is owned');
open('test-1',true,'pokeball');
assert.equal(rendered.reverseKind,'pokeball');
open('test-1',true,'masterball');
assert.equal(rendered.reverseKind,'masterball');
open('test-1',true,'cosmos');
assert.equal(rendered.reverseKind,'cosmos');
console.log('Inspector preserves the clicked normal, Poké Ball, Master Ball and regular reverse finish.');
