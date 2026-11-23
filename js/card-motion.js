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

// The presented card (the one a pack just turned, the one the inspector shows) moves its own light when nobody is
// touching it: on a phone a finger covers the card it lights, so a foil never showed what it does. The light walks a
// slow closed path for AUTO_SECONDS, then the card comes to rest; a touch takes over and hands back on release.
const AUTO_SECONDS = 22, AUTO_X = 6.5, AUTO_Y = 9.1;
function autoPose(t) {
  const x = 50 + 32 * Math.sin(2 * Math.PI * t / AUTO_X);
  const y = 44 + 24 * Math.sin(2 * Math.PI * t / AUTO_Y + .9);
  return {x, y};
}

export function createCardMotion({settings, reducedMotion, blocked}) {
  const cards = new Map();
  let active = null, frame = 0, previous = 0, ticks = 0;
  const autoAllowed = () => {
    const s = settings();
    return s.shine && (s.motion !== false || gyro.on) && !s.lite && !reducedMotion();
  };
  function dispose(el) {
    el.classList.remove("lit", "settling");
    properties.forEach(name => el.style.removeProperty(name));
    cards.delete(el);
  }
  function clear() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    for (const el of cards.keys()) dispose(el);
    active = null; presented = null;
  }
  function run() { if (!frame) { previous = 0; frame = requestAnimationFrame(tick); } }
  function release() {
    if (!active) return;
    const entry = cards.get(active);
    if (entry) {
      entry.hover = false;
      if (entry.auto && autoAllowed()) {
        // The presented card takes its own light back.
        entry.auto.until = entry.auto.t + AUTO_SECONDS;
      } else {
        entry.auto = null;
        active.classList.remove("lit"); active.classList.add("settling");
        for (const [key,value] of Object.entries(rest)) entry.springs[key].target = value;
        if (reducedMotion()) dispose(active);
      }
    }
    active = null;
    if (cards.size) run();
  }
  function tick(now) {
    frame = 0;
    const dt = previous ? (now - previous) / 1000 : 1/60;
    previous = now;
    let moving = false;
    ticks += 1;
    for (const [el,entry] of cards) {
      if (!el.isConnected) { dispose(el); continue; }
      let settling = false;
      if (entry.auto && !entry.hover) {
        const auto = entry.auto;
        // Off screen (the inspector scrolled down to its price chart) the light waits.
        if (ticks % 20 === 0 || auto.seen == null) {
          const r = el.getBoundingClientRect();
          auto.seen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
        }
        if (!autoAllowed() || blocked() || auto.t >= auto.until) {
          entry.auto = null;
          el.classList.remove("lit"); el.classList.add("settling");
          for (const [key,value] of Object.entries(rest)) entry.springs[key].target = value;
        } else if (auto.seen) {
          auto.t += Math.min(dt, .06);
          const pose = autoPose(auto.t), tilt = settings().tilt;
          entry.tilted = gyro.on && now - gyro.at < 400;
          // Idle shimmer off: no walk, the light only goes where the phone sends it.
          if (settings().motion === false) { pose.x = 50; pose.y = 50; if (!entry.tilted) auto.until = 0; }
          if (entry.tilted) {
            const walk = 1 - gyro.energy;
            pose.x = clamp(50 + (pose.x - 50) * walk + gyro.x, 3, 97);
            pose.y = clamp(50 + (pose.y - 50) * walk + gyro.y, 3, 97);
            if (gyro.energy > .15) auto.until = auto.t + AUTO_SECONDS;
          }
          const targets = {x:pose.x, y:pose.y, light:.92, rx:tilt ? (50-pose.x)*.12 : 0, ry:tilt ? (pose.y-50)*.12 : 0, scale:1};
          for (const [key,value] of Object.entries(targets)) entry.springs[key].target = value;
          moving = true;
        } else {
          moving = true;
          continue;
        }
      }
      for (const spring of Object.values(entry.springs)) settling = spring.step(dt, entry.hover ? 16 : entry.auto ? (entry.tilted ? 10 : 5) : 11) || settling;
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
      if (!entry.hover && !settling && !entry.auto) dispose(el);
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
      else entry.rect=face.getBoundingClientRect();
      entry.hover=true;
      face.classList.remove("settling"); face.classList.add("lit");
    }
    if (!active) return;
    const entry=cards.get(active), rect=entry.rect;
    const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    const tilt=settings().tilt && !reducedMotion();
    const targets={x:x*100,y:y*100,light:1,rx:tilt ? (0.5-x)*28 : 0,ry:tilt ? (y-.5)*28 : 0,scale:tilt ? 1.05 : 1};
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
  // Phone tilt: the phone's own lean pushes the presented card's light, the way turning a real card does. The hold
  // the player settles into becomes the new level over a few seconds, so there is no pose to find; while the phone
  // is being turned the light follows it alone, and once it is still the slow walk comes back.
  const gyro = {on:false, beta:null, gamma:null, x:0, y:0, energy:0, at:0};
  let presented = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function orient(event) {
    if (event.beta == null || event.gamma == null) return;
    const now = performance.now(), gap = (now - gyro.at) / 1000;
    // Held sideways, the two axes trade places.
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) % 360;
    const beta = angle === 90 ? -event.gamma : angle === 270 || angle === -90 ? event.gamma : event.beta;
    const gamma = angle === 90 ? event.beta : angle === 270 || angle === -90 ? -event.beta : event.gamma;
    if (gyro.beta == null || gap > 1.5) { gyro.beta = beta; gyro.gamma = gamma; gyro.energy = 0; }
    const dt = Math.min(.1, Math.max(0, gap)), drift = 1 - Math.exp(-dt / 4);
    gyro.beta += (beta - gyro.beta) * drift; gyro.gamma += (gamma - gyro.gamma) * drift;
    const x = clamp((gamma - gyro.gamma) * 2.4, -46, 46), y = clamp((beta - gyro.beta) * 2.4, -46, 46);
    gyro.energy = Math.min(1, gyro.energy * Math.exp(-dt / 1.2) + (Math.abs(x - gyro.x) + Math.abs(y - gyro.y)) / 14);
    gyro.x = x; gyro.y = y; gyro.at = now;
    // A card that has come to rest wakes when the phone is turned.
    if (gyro.energy > .35 && presented?.isConnected && !cards.has(presented)) present(presented);
  }
  /** Turn phone tilt on or off. Resolves true when the phone is sharing its motion. iOS asks, and only from a tap. */
  async function tiltPhone(on) {
    window.removeEventListener("deviceorientation", orient);
    gyro.on = false; gyro.beta = null;
    if (!on || typeof DeviceOrientationEvent === "undefined") return false;
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try { if (await DeviceOrientationEvent.requestPermission() !== "granted") return false; }
      catch { return false; }
    }
    window.addEventListener("deviceorientation", orient, {passive:true});
    gyro.on = true;
    return true;
  }

  /** Light a card by itself: the face a pack just turned over, the face the inspector opened. */
  function present(face) {
    presented = face || null;
    if (!face?.isConnected || !face.querySelector(".foil") || blocked() || !autoAllowed()) return;
    // A card with no foil has nothing to show off.
    if (face.classList.contains("foil-none") && !face.classList.contains("reverse")) return;
    let entry=cards.get(face);
    if (!entry) {
      entry={springs:Object.fromEntries(Object.entries(rest).map(([key,n])=>[key,new CardSpring(n)])),rect:face.getBoundingClientRect()};
      cards.set(face,entry);
    }
    entry.auto={t:0, until:AUTO_SECONDS, seen:null};
    if (face !== active) { entry.hover=false; face.classList.remove("settling"); face.classList.add("lit"); }
    run();
  }
  // Presented cards outlive a resize (Safari's toolbar sliding away is one) and a trip to another tab.
  function pause() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    for (const [el,entry] of cards) if (!entry.auto) dispose(el); else { entry.hover=false; entry.auto.seen=null; }
    active = null;
  }
  window.addEventListener("resize",()=>{pause(); if (cards.size) run();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)pause(); else if (cards.size) run();});
  return {clear,release,present,tiltPhone};
}
