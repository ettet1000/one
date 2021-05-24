/*
Rope

- water
- background
- zoom?
*/

import * as one from "./one/one.js";
import {C, act, ease, mouse, vec, camera} from "./one/one.js";

import pl from "./one/lib/planck.js";

one.description("rope", `
climb up
stay alive
`);

const L = {
  bg: "#000000",
  fg: C[19],
  water: C[9],
  rope: C[20],
  dark: C[19],
  eye: C[1],
  iris: C[4],
  alien: C[7],
  body: C[5],
  grass: C[25],
  shot: C[17],
};

one.options({
  bgColor: "#222", // L.bg
  fgColor: L.fg,
});

const TEMPLATES = [
  // [ 0, 2, 3, 11, 8, 10, 5, 6, 12, 13, 14, 15 ],
  // [ 1, 2, 5, 6, 8, 10, 13, 15, 0, 4, 3.75, 11],
  // [ 0, 8, 5, 13, 2, 10, 7, 15, 13.25, 14.25, 0.25, 1.25],
];

let ropes;
let PLAYER, world;
let shot = null;
let NEXTDIR = null;
const ZOOM = 1.5;
let path = null;
let pathDir = null;
let pathVel = null;
let pathHorizon = null;

// INIT ///

function init() {
  ropes = new Set();
  path = [];
  pathDir = {x: 0, y: -1};
  pathVel = 0;
  world = pl.World({});
  world.setGravity({x: 0, y: 9.8});

  createPlayer();
  path.push({x: 0, y: -6.5});
  pathHorizon = [ 0, 0, 0, 0, 0, 0, 0, 0 ];

  const ro = [];

  ro.push(addRopeTwo({x: -2, y: 0}, {x: 2, y: 0}));

  ro.push(addRopeTwo({x: -4, y: 2}, {x: 4, y: 2}));


  ro.push(addRopeOne({x: -3.5, y: -6}, 5));
  ro.push(addRopeOne({x: 0, y: -6}, 4));
  ro.push(addRopeOne({x: 3.5, y: -6}, 5));

  world.on('post-solve', postSolve);
  world.on('pre-solve', preSolve);

  one.camera.reset();
  one.camera.z = 13 * ZOOM;
  one.camera.set(one.camera.lookAt(0, 0));
}

function createPlayer() {
  PLAYER = {
    arms: [
      {hold: null, hand: null, joint: null, holder: null, holderTime: 0},
      {hold: null, hand: null, joint: null, holder: null, holderTime: 0},
    ],
    head: null,
    body: [],
    eye: {x: 0, y: 0},
    focuson: null,
    eyelook: {x: 0, y: 0},
    pupil: 0,
    blink: 0, blinking: 1, looking: 2, breath: 0,
  }

  PLAYER.head = world.createDynamicBody({
    // linearDamping: 0,
  });
  const density = 1 / 10;
  // @ts-ignore
  PLAYER.head.createFixture(pl.Circle(pl.Vec2(0, 0), 0.6),
    {density: density,
      filterGroupIndex: 5, filterCategoryBits: 0 });
  // @ts-ignore
  PLAYER.head.setPosition({x: 0, y: 0});

  let last = PLAYER.head;
  for (let i = 0; i < 2; ++i) {
    const o = world.createDynamicBody({
      gravityScale: 1,
    });
    o.radius = 0.4 - i * 0.2;
    o.createFixture(pl.Circle(pl.Vec2(0, 0), o.radius),
    {density: density, isSensor: true,
     filterGroupIndex: -1, filterCategoryBits: 0});
    o.setPosition({x: 0, y: 1 * i});

    world.createJoint(pl.RopeJoint({
      maxLength: 1.0 - i * 0.4,
      localAnchorA: pl.Vec2(0, 0), localAnchorB: pl.Vec2(0, 0),
    }, last, o));
    last = o;
    PLAYER.body.push(o);
  }

  let first = true;
  for (const a of PLAYER.arms) {
    a.hand = world.createDynamicBody({
      userData: "hand", bullet: true, linearDamping: 0.1});
    a.hand.createFixture(pl.Circle(pl.Vec2(0, 0), 0.8 * ZOOM),
      {isSensor: true});
    a.hand.createFixture(pl.Circle(pl.Vec2(0, 0), 0.1),
      {density: 0, filterGroupIndex: 3});
    a.hand.createFixture(pl.Circle(pl.Vec2(0, 0), 0.3),
      {density: 1,
        filterCategoryBits: 4, filterMaskBits: 4 });
    a.joint = world.createDynamicBody({
      // linearDamping: 0,
    });
    a.joint.createFixture(pl.Circle(pl.Vec2(0, 0), 0.1),
      {density: 0.1,});

    if (first) {
      first = false;
      a.hand.setPosition({x:-1.5, y:-1});
      a.joint.setPosition({x:-1, y:-0.5});
    } else {
      a.hand.setPosition({x:1.5, y:-1});
      a.joint.setPosition({x:1, y:-0.5});
    }

    world.createJoint(pl.RopeJoint({
      maxLength: 0.9, localAnchorA: pl.Vec2(0, 0), localAnchorB: pl.Vec2(0, 0),
    }, a.hand, a.joint));

    world.createJoint(pl.RopeJoint({
      maxLength: 0.9, localAnchorA: pl.Vec2(0, 0), localAnchorB: pl.Vec2(0, 0),
    }, a.joint, PLAYER.head));

    world.createJoint(pl.DistanceJoint({
      length: 0.85, localAnchorA: pl.Vec2(0, 0), localAnchorB: pl.Vec2(0, 0),
      collideConnected: false, frequencyHz: 10, dampingRatio: 0.5,
    }, a.hand, a.joint));

    world.createJoint(pl.DistanceJoint({
      length: 0.85, localAnchorA: pl.Vec2(0, 0), localAnchorB: pl.Vec2(0, 0),
      collideConnected: false, frequencyHz: 10, dampingRatio: 0.5,
    }, a.joint, PLAYER.head));
  }
}

function addRopeTwo(a, b, close=true) {
  let r = vec.sub(b, a);
  const v = vec.normalize(r);
  const n = vec.perp(v);
  let len = vec.len(r);
  let length = len;
  const parts = Math.round(length);
  const size = 1;
  const total = parts * (size + 0.1) + 0.1;
  let diff = len - total;
  if (diff > -0.05) {
    diff = Math.max(diff, 0.05);
    a = vec.add(a, vec.mul(v, diff / 2));
    b = vec.add(b, vec.mul(v, -diff / 2));
    return addRopeTwo(a, b, close);
  }

  const ang = vec.angle(v) - Math.PI / 2;

  const obj = [];

  // point A
  const ha = world.createBody();
  ha.setPosition(a);
  obj.push(ha);

  const dy = close ? 0 : size / 2;
  const dir = close ? 1 : Math.sign(2 * Math.random() - 1);
  for (let i = 0; i < parts; ++i) {
    const p = world.createDynamicBody({
      userData: "rope",
      linearDamping: 0.25,
    });
    p.parent = obj;
    p.createFixture(pl.Box(0.025, size / 2, {x: 0, y: -size / 2}), {
      density: 9.5 - i * 0.2,
      filterGroupIndex: -3,
      filterCategoryBits: 4,
      filterMaskBits: 4,
    });
    p.setPosition({
      x: a.x + v.x * size * (i + 1) + dir * n.x * 0.5,
      y: a.y + v.y * size * (i + 1) + dir * n.y * 0.5});
    p.setAngle(ang);
    // p.setStatic();
    obj.push(p);
  }

  // point B
  if (close) {
    const hb = world.createBody();
    hb.setPosition(b);
    obj.push(hb);
  }

  const aa = pl.Vec2(0, 0);
  for (let i = 0; i < obj.length - 1; ++i) {
    const ab = (close && i == obj.length - 2) ? aa : pl.Vec2(0, -size);
    world.createJoint(pl.RopeJoint({
      maxLength: 0.1,
      collideConnected: false,
      localAnchorA: aa,
      localAnchorB: ab,
    }, obj[i], obj[i + 1]));
    world.createJoint(pl.DistanceJoint({
      length: 0.1,
      frequencyHz: 10, dampingRatio: size / 2,
      collideConnected: false,
      localAnchorA: aa,
      localAnchorB: ab,
    }, obj[i], obj[i + 1]));
  }

  ropes.add(obj);
  return obj;
}

function addRopeOne(a, length = 5) {
  const b = {x : a.x, y: a.y + length};
  return addRopeTwo(a, b, false);
}

// UPDATE ///
function stepPath() {
  const player = PLAYER.head.getPosition();
  const last = path[path.length - 1];
  const dist = vec.len(vec.sub(last, player));
  if (dist > 13 * 2) return;

  // move path forward by pathDir
  const step = 13 / (3 + 3 * Math.random());
  const next = vec.add(last, vec.mul(pathDir, step));

  // move horizon down
  const length = 13 + 7 * Math.random();
  const yv = vec.mul(vec.normalize(pathDir), step);
  const xv = vec.mul(vec.normalize(vec.perp(yv)), length);
  // build path step
  // granularity
  const divs = Math.floor(length / (2 + 1 * Math.random()));
  // map it to horizon
  const horiz = [];

  let lastDir = vec.sub(last, path[path.length - 2] ?? last);
  if (lastDir.x == 0 && lastDir.y == 0) lastDir.y = -1;
  const lastNorm = vec.mul(vec.normalize(vec.perp(lastDir)), length);

  const xx = [];
  for (let i = 0; i < pathHorizon.length; ++i) {
    const p = (2 * (i / pathHorizon.length) - 1) / 2;
    const a = vec.add(yv, vec.mul(xv, p));
    const b = vec.mul(lastNorm, p);

    const d = vec.len(vec.sub(a, b)) / step;
    xx.push(d);

    pathHorizon[i] -= d;
  }
  for (let i = 0; i < divs; ++i) {
    const x0 = i / divs;
    const x1 = (i + 1) / divs;
    const h0 = Math.floor(pathHorizon.length * x0);
    const h1 = Math.ceil(pathHorizon.length * x1);
    let max = -1;
    for (let x = h0; x < h1; x++) {
      max = Math.max(max, pathHorizon[x] ?? -1);
    }
    horiz.push(max);
  }

  const space = [];
  for (let i = 0; i < divs; ++i) {
    // region is blocked.
    if (horiz[i] > -0.5) {
      space.push(null);
      continue;
    }
    const opts = [true];
    if (horiz[i] < 0.25) opts.push(false);

    space[i] = opts[Math.floor(opts.length * Math.random())];
  }
  let cut = Math.max(1, divs - 4);
  for (let i = 0; i < divs - 2; ++i) {
    if (space[i] === true && space[i + 1] === true && space[i + 2] === true) {
      space[i + 2] = null;
      cut--;
    }
  }

  for (let i = 0; i < cut; i++) {
    const idx = Math.floor(divs * Math.random());
    space[idx] = null;
  }

  const line = [];
  const norm = [];
  for (let idx = 0; idx < divs; ++idx) {
    if (space[idx] === null) continue;
    if (space[idx] === false) {
      const height = (0.5 + 1.5 * Math.random());

      const end = horiz[idx] + 0.5;
      norm.push([idx, end + height, end]);
      horiz[idx] = end + height;
      continue;
    }

    if (space[idx + 1] === true) {
      horiz[idx] = 0;
      horiz[idx + 1] = 0;
      line.push([idx, idx + 1]);
      idx++;
    } else {
      line.push([idx, idx]);
      horiz[idx] = 0;
    }
  }

  const direc = Math.abs(vec.dot(vec.normalize(pathDir), {x: 0, y: -1}));
  let lineclose = true;
  let normclose = true;
  if (direc < 0.25) lineclose = false;
  if (direc > 0.75) normclose = false;

  for (const n of norm) {
    const x = ((n[0] + 0.5) / divs) - 0.5;
    const y0 = n[1];
    const y1 = n[2];

    const p0 = vec.add(next, vec.add(vec.mul(xv, x), vec.mul(yv, y0)));
    const p1 = vec.add(next, vec.add(vec.mul(xv, x), vec.mul(yv, y1)));

    addRopeTwo(p0, p1, normclose);
  }

  for (const l of line) {
    const y = 0;
    const x0 = ((l[0]) / divs) - 0.5;
    const x1 = ((l[1] + 1) / divs) - 0.5;

    const p0 = vec.add(next, vec.add(vec.mul(xv, x0), vec.mul(yv, y)));
    const p1 = vec.add(next, vec.add(vec.mul(xv, x1), vec.mul(yv, y)));

    addRopeTwo(p0, p1, lineclose);
  }

  // remap horizon
  for (let i = 0; i < divs; ++i) {
    const h0 = Math.floor(pathHorizon.length * i / divs);
    const h1 = Math.ceil(pathHorizon.length * (i + 1) / divs);

    for (let x = h0; x <= h1; x++) {
      pathHorizon[x] = Math.max(pathHorizon[x] ?? 0, horiz[i]);
    }
  }

  // update pathDir
  path.push(next);

  const MAXV = 0.1;
  const FLEX = 0.5;
  pathVel += MAXV * (2 * Math.random() - 1) * FLEX;
  pathVel = Math.clamp(pathVel, -MAXV, MAXV);

  const n = vec.mul(vec.normalize(vec.perp(pathDir)), pathVel);
  pathDir = vec.normalize(vec.add(pathDir, n));

  stepPath();
}

function updateMap() {
  // - find current quadrant ID
  const pos = PLAYER.head.getPosition();

  stepPath();

  for (const r of ropes) {
    const p = r[0].getPosition();
    const d = vec.len(vec.sub(p, pos));
    if (d < 13 * 3) continue;

    for (const x of r) {
      for (let j = x.getJointList(); j; j = j.next) {
        world.destroyJoint(j.joint);
      }
      world.destroyBody(x);
    }
    ropes.delete(r);
  }
}

const UPDATE = [];

function preSolve(contact) {
  const bodyA = contact.getFixtureA().getBody();
  const bodyB = contact.getFixtureB().getBody();

  let hand = bodyA.getUserData() == "hand" ? bodyA :
    bodyB.getUserData() == "hand" ? bodyB : null;
  let rope = bodyA.getUserData() == "rope" ? bodyA :
    bodyB.getUserData() == "rope" ? bodyB : null;

  if (hand == null || rope == null) return;

  const arm = PLAYER.arms[0].hand === hand ? PLAYER.arms[0] : PLAYER.arms[1];
  if (arm.hold !== null) {
    contact.setEnabled(false);
  }
  const now = performance.now();
  if (arm.holder != rope.parent) return;
  if (arm.holderTime == -1) return;
  if (arm.holderTime < now) return;
  contact.setEnabled(false);
}

function postSolve(contact) {
  const bodyA = contact.getFixtureA().getBody();
  const bodyB = contact.getFixtureB().getBody();

  let hand = bodyA.getUserData() == "hand" ? bodyA :
    bodyB.getUserData() == "hand" ? bodyB : null;
  let rope = bodyA.getUserData() == "rope" ? bodyA :
    bodyB.getUserData() == "rope" ? bodyB : null;

  if (hand == null || rope == null) return;
  const arm = PLAYER.arms[0].hand === hand ? PLAYER.arms[0] : PLAYER.arms[1];
  const now = performance.now();
  if (arm.holder == rope.parent &&
    (arm.holderTime == -1 || arm.holderTime > now)) return;
  const wm = contact.getWorldManifold();
  const p = wm.points[0];

  UPDATE.push(() => {
    if (arm.hold) {
      world.destroyJoint(arm.hold);
    }
    arm.hold = pl.DistanceJoint({
      length: 0, collideConnected: false,frequencyHz: 10, dampingRatio: 0.5,
    }, hand, rope, hand.getPosition(), p);
    world.createJoint(arm.hold);
  });
  arm.holder = rope.parent;
  arm.holderTime = -1;
}

function playerLook(p) {
  PLAYER.looking = 2 + 10 * Math.random();
  act(PLAYER.eye).stop()
    .attr("x", p.x, 0.1, ease.quadIn)
    .attr("y", p.y, 0.1, ease.quadIn);
}

function updatePlayer(tick) {
  PLAYER.breath = Math.sin(tick * 2 * Math.PI / 500);
  PLAYER.pupil = Math.cos(333 + tick * 2 * Math.PI / 1713);
  PLAYER.blinking -= 1/60;
  if (PLAYER.blinking <= 0 && PLAYER.blink == 0) {
    act(PLAYER).attr("blink", 1.0, 0.15, ease.quadIn).then()
      .attr("blink", 0.0, 0.15, ease.quadIn);
    PLAYER.blinking = 2 + 8 * Math.random();
  }

  PLAYER.eye.x = Math.lerp(PLAYER.eye.x, PLAYER.eyelook.x, 0.15);
  PLAYER.eye.y = Math.lerp(PLAYER.eye.y, PLAYER.eyelook.y, 0.15);

  if (PLAYER.arms[0].hold === null && PLAYER.arms[1].hold === null) {
    PLAYER.eyelook.x = 0;
    PLAYER.eyelook.y = 0;
    PLAYER.looking = 5 + Math.random();
    return;
  }

  const h = PLAYER.arms[0].hold ? PLAYER.arms[1] : PLAYER.arms[0];
  if (h.hold === null) {
    PLAYER.focuson = h.hand;
    PLAYER.looking = 5 + Math.random();
  }
  if (shot != null) {
    PLAYER.focuson = shot.hand;
    PLAYER.looking = 5 + Math.random();
  }

  PLAYER.looking -= 1/60;
  if (PLAYER.looking <= 0) {
    PLAYER.looking = 5 + 3 * Math.random();
    PLAYER.eyelook.x = -1 + 2 * Math.random();
    PLAYER.eyelook.y = -1 + 2 * Math.random();
  } else if (PLAYER.focuson) {
    const d = vec.normalize(
      vec.sub(PLAYER.focuson.getPosition(), PLAYER.head.getPosition()));
    PLAYER.eyelook.x = d.x;
    PLAYER.eyelook.y = d.y;
  }
}

function updateCamera() {
  const p = PLAYER.head.getPosition();
  const target = one.camera.lookAt(p.x, p.y);
  const d = vec.sub(target, one.camera);
  let ang = Math.TAU * -d.x / 40;
  if (Math.abs(ang) < Math.TAU / 40) ang = 0;
  target.angle = ang;

  one.camera.approach(target, {x: 0.02, y: 0.005, angle: 0.04});
}

function updateShot(tick) {
  if (mouse.click) {
    const p = one.camera.map(mouse);
    const aabb = pl.AABB({x: p.x - 0.001, y: p.y - 0.001},
      {x: p.x + 0.001, y: p.y + 0.001});

    world.queryAABB(aabb, (x) => {
      const b = x.getBody();
      if (b.getUserData() != "hand") return;

      const vel = vec.len(b.getLinearVelocity());
      const arm = PLAYER.arms[0].hand === b ? PLAYER.arms[0] : PLAYER.arms[1];
      if (!arm.hold && vel > 5) return;

      shot = {
        hand: b,
        offset: 0,
        target: {x: mouse.x, y: mouse.y },
      };
      return false;
    });
  }

  if (!shot) return;
  shot.offset += 1;

  if (mouse.press) {
     const p = one.camera.map(mouse);
     const o = shot.hand.getPosition();
     const d = vec.clamp(vec.sub(p, o), 0, 3);

     shot.target = vec.add(o, d);

  } else if (mouse.release) {
    const p = shot.hand.getPosition();
    const v = vec.sub(p, shot.target);
    const l = vec.len(v);
    const d = vec.mul(v, 50 * l);
    if (l < 1) {
      shot = null;
      return;
    }
    const arm = PLAYER.arms[0].hand === shot.hand ? PLAYER.arms[0] : PLAYER.arms[1];

    if (arm.hold) {
      world.destroyJoint(arm.hold);
      arm.holderTime = performance.now() + 300;
      arm.hold = null;
    }

    shot.hand.setDynamic();
    shot.hand.applyForceToCenter(d);
    shot = null;
  }
}

function update(tick) {
  world.step(1/60);
  for (const w of UPDATE) w();
  UPDATE.length = 0;

  updatePlayer(tick);
  updateCamera();
  updateShot(tick);
  updateMap();
}

// RENDER ///

function render(ctx) {
  ctx.fillStyle = L.fg;
  ctx.fillRect(0,0,1024,1024);

  one.camera.transform(ctx);
  ctx.fillStyle = L.bg;
  const B = 0;
  const D = one.camera.z;
  ctx.fillRect(B + one.camera.cx - D/2, B + one.camera.cy - D/2, D - 2 * B, D - 2 * B);
  ctx.beginPath();
  ctx.rect(B + one.camera.cx - D/2, B + one.camera.cy - D/2, D - 2 * B, D - 2 * B);
  ctx.clip();

  for (const r of ropes) {
    renderRope(ctx, r);
  }
  renderPlayer(ctx);
  renderShot(ctx);

  // renderDebug(ctx);
}

function renderShot(ctx) {
  if (!shot) return;
  const p = shot.hand.getPosition();
  const t = vec.sub(shot.target, p);
  const v = vec.normalize(t);
  const n = vec.perp(v);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = L.shot;
  ctx.lineWidth = 0.075;
  ctx.setLineDash([0.2, 0.2]);
  ctx.lineDashOffset = shot.offset / 150;

  const BR = 0.4;
  const SR = 0.05;
  ctx.beginPath();
  ctx.moveTo(t.x - n.x * SR, t.y - n.y * SR);
  ctx.arcTo(t.x + 10 * v.x, t.y + 10 * v.y,
    t.x + n.x * SR, t.y + n.y * SR, SR);
  ctx.lineTo(BR * n.x, BR * n.y);
  ctx.arcTo(-10 * v.x, -10 * v.y, -BR * n.x, -BR * n.y, BR);
  ctx.closePath();
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();
}

const BIGARM = 0.6;
const SMALLARM = 0.15;
function renderPlayer(ctx) {
  ctx.fillStyle = L.alien;
  const h = PLAYER.head.getPosition();
  for (const arm of PLAYER.arms) {
    const p = arm.hand.getPosition();
    ctx.strokeStyle = L.body;
    ctx.fillStyle = L.body;
    const j = arm.joint.getPosition();
    const n = vec.normalize(vec.perp(vec.sub(h, p)));

    ctx.beginPath();
    ctx.moveTo(p.x + n.x * SMALLARM, p.y + n.y * SMALLARM);
    ctx.quadraticCurveTo(j.x, j.y, h.x + n.x * BIGARM, h.y + n.y * BIGARM);
    ctx.lineTo(h.x - n.x * BIGARM, h.y - n.y * BIGARM);
    ctx.quadraticCurveTo(j.x, j.y, p.x - n.x * SMALLARM, p.y - n.y * SMALLARM);
    ctx.fill();
  }

  for (const arm of PLAYER.arms) {
    const p = arm.hand.getPosition();
    ctx.fillStyle = L.alien;
    ctx.fillCircle(p.x, p.y, arm.hold ? 0.22 : 0.3);
  }

  ctx.fillStyle = L.body;

  let m = PLAYER.body[0].getPosition().clone();
  let om = m;
  const b = PLAYER.body[1];
  const p = b.getPosition().clone();
  // p.x += 0.1;
  // p.y -= 0.7;
  const bp = vec.mul(vec.add(h, p), 0.5);
  const rm = vec.clamp(vec.sub(m, bp), 0, 0.3);
  m = vec.add(bp, rm);

  const nm = vec.normalize(vec.perp(vec.sub(h, m)));
  const v = vec.sub(m, p);
  const vn = vec.normalize(v);
  const n = vec.normalize(vec.perp(v));
  let j1 = vec.add(m, vec.mul(n, 0.3));
  let j2 = vec.add(m, vec.mul(n, -0.3));

  ctx.beginPath();
  ctx.moveTo(p.x - n.x * b.radius, p.y - n.y * b.radius);
  ctx.quadraticCurveTo(j2.x, j2.y, h.x - nm.x * 0.6, h.y - nm.y * 0.6);
  ctx.lineTo(h.x + nm.x * 0.6, h.y + nm.y * 0.6);
  ctx.quadraticCurveTo(j1.x, j1.y, p.x + n.x * b.radius, p.y + n.y * b.radius);
  ctx.arcTo(
    p.x - vn.x * b.radius * 5, p.y - vn.y * b.radius * 5,
    p.x - n.x * b.radius, p.y - n.y * b.radius, b.radius);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(h.x, h.y);
  const scale = 0.45 / 38;
  ctx.scale(scale, scale);
  const ER = 16;
  ctx.fillStyle = L.body;
  ctx.fillCircle(0, 0, 51);
  ctx.fillStyle = L.eye;
  ctx.fillCircle(0, 0, 38);
  ctx.fillStyle = L.iris;
  const rb = 20.5 - 1 * PLAYER.pupil;
  const rx = rb - 5 * vec.len(PLAYER.eye);
  const ry = rb;
  const ang = vec.angle(PLAYER.eye);
  ctx.beginPath();
  ctx.ellipse(PLAYER.eye.x * ER, PLAYER.eye.y * ER, rx, ry, ang, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = L.eye;
  const f = Math.sin((vec.len(PLAYER.eye) / Math.SQRT2) * Math.PI / 2) ** 2;
  const ff = 4 + 2 * f;
  const d = (rb / 4) + (rb / 10) * f;
  ctx.beginPath();
  ctx.ellipse(PLAYER.eye.x * ER - d, PLAYER.eye.y * ER - d, rx / ff, ry / ff, ang, 0, 2 * Math.PI);
  ctx.fill();
  if (PLAYER.blink > 0) {
    ctx.fillStyle = L.body;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 39, Math.PI, 2 * Math.PI);
    if (PLAYER.blink < 0.5) {
      ctx.ellipse(0, 0, 39, Math.lerp(39, 0, PLAYER.blink * 2), 0, 0, Math.PI, true);
    } else {
      ctx.ellipse(0, 0, 39, Math.lerp(0, 39, (PLAYER.blink - 0.5) * 2), 0, 0, Math.PI);
    }
    ctx.fill();
  }
  ctx.restore();
}

function renderRope(ctx, r) {
  let prev = r[0].getPosition();


  ctx.fillStyle = L.dark;
  ctx.fillCircle(prev.x, prev.y, 0.2);

  ctx.strokeStyle = L.rope;
  ctx.lineWidth = 0.1;
  ctx.beginPath();

  for (const p of r) {
    const x = p.getWorldCenter();
    // ctx.lineTo(x.x, x.y);
    ctx.quadraticCurveTo(prev.x, prev.y ,x.x, x.y);
    prev = p.getPosition();
  }

  ctx.lineTo(prev.x, prev.y);
  ctx.stroke();

  prev = r[0].getPosition();
  ctx.fillStyle = L.dark;
  ctx.fillCircle(prev.x, prev.y, 0.2);
  prev = r[r.length - 1];
  if (prev.getUserData() !== "rope") {
    prev = prev.getPosition();
    ctx.fillCircle(prev.x, prev.y, 0.2);
  }
}

function renderDebug(ctx) {
  ctx.strokeStyle = "white";
  ctx.lineWidth = 0.005;
  for (let body = world.getBodyList(); body; body = body.getNext()) {
    const pos = body.getPosition();
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(body.getAngle());
    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      const shape = fixture.m_shape;

      if (shape.m_type == "circle") {
        ctx.strokeCircle(shape.m_p.x, shape.m_p.y, shape.m_radius);
        continue;
      }
      if (shape.m_type == "polygon") {
        ctx.beginPath();
        for (const v of shape.m_vertices) {
          ctx.lineTo(v.x, v.y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // console.log(shape.m_type);
    }
    ctx.restore();
    const p = body.getWorldCenter();
    ctx.fillStyle = "red";
    ctx.fillCircle(p.x, p.y, 0.025);
  }
}

export default one.game(init, update, render);
