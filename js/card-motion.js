// A critically damped spring with an exact time step: same feel at 60/120 Hz.
export class CardSpring {
  constructor(value) { this.value = value; this.target = value; this.velocity = 0; }
  step(seconds, frequency = 15) {
    const dt = Math.min(seconds, .06);
    const displacement = this.value - this.target;
    const c = this.velocity + frequency * displacement;
    const decay = Math.exp(-frequency * dt);
    this.value = this.target + (displacement + c * dt) * decay;
    this.velocity = (this.velocity - frequency * c * dt) * decay;
    if (Math.abs(this.value - this.target) < .001 && Math.abs(this.velocity) < .01) {
      this.value = this.target; this.velocity = 0;
    }
    return this.value !== this.target || this.velocity !== 0;
  }
}

const rest = {x:50, y:50, light:0, rx:0, ry:0, scale:1};
const properties = ["--mx","--my","--px","--py","--hyp","--tilt-x","--tilt-y",
  "--pointer-x","--pointer-y","--pointer-from-center","--pointer-from-left","--pointer-from-top",
  "--card-opacity","--rotate-x","--rotate-y","--background-x","--background-y","--card-scale"];

export function createCardMotion({settings, reducedMotion, blocked}) {
  const cards = new Map();
  let active = null, frame = 0, previous = 0;
  function dispose(el) {
    el.classList.remove("lit", "settling");
    properties.forEach(name => el.style.removeProperty(name));
    cards.delete(el);
  }
  function clear() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    for (const el of cards.keys()) dispose(el);
    active = null;
  }
  function run() { if (!frame) { previous = 0; frame = requestAnimationFrame(tick); } }
  function release() {
    if (!active) return;
    const entry = cards.get(active);
    if (entry) {
      entry.hover = false;
      active.classList.remove("lit"); active.classList.add("settling");
      for (const [key,value] of Object.entries(rest)) entry.springs[key].target = value;
      if (reducedMotion()) dispose(active);
    }
    active = null;
    if (cards.size) run();
  }
  function tick(now) {
    frame = 0;
    const dt = previous ? (now - previous) / 1000 : 1/60;
    previous = now;
    let moving = false;
    for (const [el,entry] of cards) {
      if (!el.isConnected) { dispose(el); continue; }
      let settling = false;
      for (const spring of Object.values(entry.springs)) settling = spring.step(dt, entry.hover ? 16 : 11) || settling;
      const values = Object.fromEntries(Object.entries(entry.springs).map(([key,s])=>[key,s.value]));
      const x=values.x/100, y=values.y/100;
      const radius=Math.min(1,Math.hypot(x-.5,y-.5)*2);
      const set=(name,value)=>el.style.setProperty(name,String(value));
      set("--pointer-x",`${values.x}%`); set("--pointer-y",`${values.y}%`);
      set("--pointer-from-left",x); set("--pointer-from-top",y); set("--pointer-from-center",radius);
      set("--card-opacity",values.light); set("--card-scale",values.scale);
      set("--rotate-x",`${values.rx}deg`); set("--rotate-y",`${values.ry}deg`);
      set("--background-x",`${37+x*26}%`); set("--background-y",`${33+y*34}%`);
      set("--mx",`${values.x}%`); set("--my",`${values.y}%`);
      set("--px",x); set("--py",y); set("--hyp",radius);
      set("--tilt-x",`${values.ry}deg`); set("--tilt-y",`${values.rx}deg`);
      if (!entry.hover && !settling) dispose(el);
      moving = moving || settling;
    }
    if (moving) frame=requestAnimationFrame(tick);
  }
  function faceFrom(event) {
    const direct=event.target?.closest?.(".tcg");
    if (direct) return direct;
    const focus=event.target?.closest?.(".focus-card");
    return focus?.querySelector(focus.classList.contains("flipped") ? ".face-back .tcg" : ".face-front .tcg");
  }
  function point(event) {
    if (blocked() || (!settings().shine && !settings().tilt)) { clear(); return; }
    const face=faceFrom(event);
    if (face !== active) {
      release();
      if (!face) return;
      active=face;
      let entry=cards.get(face);
      if (!entry) {
        const rect=face.getBoundingClientRect();
        entry={springs:Object.fromEntries(Object.entries(rest).map(([key,n])=>[key,new CardSpring(n)])),rect};
        cards.set(face,entry);
      }
      entry.hover=true;
      face.classList.remove("settling"); face.classList.add("lit");
    }
    if (!active) return;
    const entry=cards.get(active), rect=entry.rect;
    const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    const tilt=settings().tilt && !reducedMotion();
    const targets={x:x*100,y:y*100,light:1,rx:tilt ? (0.5-x)*18 : 0,ry:tilt ? (y-.5)*18 : 0,scale:tilt ? 1.035 : 1};
    for (const [key,value] of Object.entries(targets)) {
      const s=entry.springs[key]; s.target=value;
      if (reducedMotion()) {s.value=value;s.velocity=0;}
    }
    run();
  }
  document.addEventListener("pointermove",point,{passive:true});
  document.addEventListener("pointerdown",point,{passive:true});
  document.addEventListener("pointerout",event=>{
    if (active && !active.contains(event.relatedTarget) && event.target?.closest?.(".tcg") === active) release();
  },{passive:true});
  document.addEventListener("pointerup",e=>{if(e.pointerType!=="mouse")release();});
  document.addEventListener("pointercancel",release);
  window.addEventListener("blur",release);
  window.addEventListener("scroll",release,true);
  window.addEventListener("resize",clear);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)clear();});
  return {clear,release};
}
