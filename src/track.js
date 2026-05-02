import * as THREE from 'three';
import { config } from './config.js';

const ROAD_HALF_WIDTH = 6;
const WALL_HEIGHT = 1.4;
const ROAD_Y = 0.02;

const CONTROL_POINTS = [
  [0,    0],
  [40,   0],
  [60,   8],
  [70,   28],
  [62,   50],
  [42,   62],
  [12,   66],
  [-12,  60],
  [-22,  44],
  [-12,  28],
  [-26,  16],
  [-18,  2],
  [-8,   -4],
];

export function buildTrack(scene, assets) {
  const points = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);

  const segments = 240;
  const allSpaced = curve.getSpacedPoints(segments);
  const samples = allSpaced.slice(0, segments);

  const tangents = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    tangents.push(t);
  }

  const left = [], right = [];
  for (let i = 0; i < samples.length; i++) {
    const t = tangents[i];
    const normal = new THREE.Vector3(-t.z, 0, t.x);
    left.push(samples[i].clone().addScaledVector(normal, ROAD_HALF_WIDTH));
    right.push(samples[i].clone().addScaledVector(normal, -ROAD_HALF_WIDTH));
  }
  left.push(left[0].clone());
  right.push(right[0].clone());

  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const roadGeo = buildRibbonGeometry(left, right, ROAD_Y);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x444444, roughness: 0.95, metalness: 0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  roadGroup.add(roadMesh);

  const stripeGeo = buildStripeLines(samples, tangents);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
  stripeMesh.position.y = ROAD_Y + 0.01;
  roadGroup.add(stripeMesh);

  const groundGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4d8a3a, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  const finishGeo = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 1.5);
  const finishCanvas = makeCheckerTexture();
  const finishMat = new THREE.MeshBasicMaterial({ map: finishCanvas });
  const finish = new THREE.Mesh(finishGeo, finishMat);
  finish.rotation.x = -Math.PI / 2;
  finish.position.copy(samples[0]).setY(ROAD_Y + 0.02);
  const startTangent = tangents[0];
  finish.rotation.z = -Math.atan2(startTangent.x, startTangent.z);
  scene.add(finish);

  const walls = buildWalls(scene, left, right, samples, assets);

  scatterDecorations(scene, samples, tangents, assets);

  const itemBoxSpawns = computeItemBoxSpawns(samples, tangents);

  return {
    samples,
    tangents,
    roadHalfWidth: ROAD_HALF_WIDTH,
    walls,
    finishLineCenter: samples[0].clone(),
    finishLineNormal: tangents[0].clone(),
    itemBoxSpawns,

    getStartPositions(count) {
      const positions = [];
      const startIdx = 0;
      const back = tangents[startIdx].clone().multiplyScalar(-1);
      const right = new THREE.Vector3(-tangents[startIdx].z, 0, tangents[startIdx].x).multiplyScalar(-1);
      const spacing = config.race.startGridSpacing;
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2 === 0 ? 1 : -1;
        const pos = samples[startIdx].clone()
          .addScaledVector(back, 6 + row * spacing)
          .addScaledVector(right, col * 2);
        positions.push({
          position: pos,
          heading: Math.atan2(tangents[startIdx].x, tangents[startIdx].z),
        });
      }
      return positions;
    },

    nearestSampleIndex(pos) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const dx = samples[i].x - pos.x;
        const dz = samples[i].z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; bestI = i; }
      }
      return { index: bestI, distSq: bestD };
    },

    isOffTrack(pos) {
      const { distSq } = this.nearestSampleIndex(pos);
      return Math.sqrt(distSq) > ROAD_HALF_WIDTH - 0.5;
    },

    updateProgress(kart) {
      const { index } = this.nearestSampleIndex(kart.position);
      const prev = kart.lastSampleIndex ?? index;
      const totalSamples = samples.length;

      let delta = index - prev;
      if (delta > totalSamples / 2) delta -= totalSamples;
      else if (delta < -totalSamples / 2) delta += totalSamples;

      if (delta < 0) delta = 0;

      kart.lastSampleIndex = index;
      kart.sampleIndex = index;

      const wrapped = prev > totalSamples * 0.85 && index < totalSamples * 0.15;
      if (wrapped) {
        kart.lap = (kart.lap ?? 0) + 1;
      }

      kart.totalProgress = (kart.lap ?? 0) * totalSamples + index;
    },

    getWaypoint(idx, offset = 0) {
      const t = samples.length;
      const i = ((idx % t) + t) % t;
      const sample = samples[i];
      if (offset === 0) return sample.clone();
      const tan = tangents[i];
      const normal = new THREE.Vector3(-tan.z, 0, tan.x);
      return sample.clone().addScaledVector(normal, offset);
    },

    getTangent(idx) {
      const t = samples.length;
      const i = ((idx % t) + t) % t;
      return tangents[i].clone();
    },
  };
}

function buildRibbonGeometry(left, right, y) {
  const verts = [];
  const indices = [];
  const uvs = [];
  for (let i = 0; i < left.length; i++) {
    verts.push(left[i].x, y, left[i].z);
    verts.push(right[i].x, y, right[i].z);
    uvs.push(0, i);
    uvs.push(1, i);
  }
  for (let i = 0; i < left.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildStripeLines(samples, tangents) {
  const dashLen = 6;
  const gapLen = 4;
  const verts = [];
  const indices = [];
  let writing = false;
  let lastVA = -1, lastVB = -1;

  for (let s = 0; s < samples.length - 1; s++) {
    const phase = s % (dashLen + gapLen);
    const inDash = phase < dashLen;
    if (!inDash) { writing = false; continue; }
    const t = tangents[s];
    const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(0.18);
    const a = samples[s].clone().add(n);
    const b = samples[s].clone().sub(n);
    const vA = verts.length / 3;
    verts.push(a.x, 0, a.z, b.x, 0, b.z);
    if (writing) {
      indices.push(lastVA, lastVB, vA, lastVB, vA + 1, vA);
    }
    lastVA = vA; lastVB = vA + 1;
    writing = true;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const cells = 8;
  const s = 64 / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function buildWalls(scene, left, right, _samples, _assets) {
  const walls = [];
  const wallGroup = new THREE.Group();
  scene.add(wallGroup);

  const wallStep = 4;
  for (let i = 0; i < left.length - 1; i += wallStep) {
    addWallSegment(wallGroup, walls, left[i], left[(i + wallStep) % (left.length - 1)], 0xff5555);
    addWallSegment(wallGroup, walls, right[i], right[(i + wallStep) % (right.length - 1)], 0xeeeeee);
  }
  return walls;
}

function addWallSegment(group, walls, a, b, color) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return;
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  const angle = Math.atan2(dx, dz);

  const geo = new THREE.BoxGeometry(0.4, WALL_HEIGHT, len);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, WALL_HEIGHT / 2, cz);
  mesh.rotation.y = angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  walls.push({
    a: a.clone(),
    b: b.clone(),
    normal: new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)),
  });
}

function scatterDecorations(scene, samples, tangents, assets) {
  const treeBig = assets.props.tree;
  const treeSmall = assets.props.treeSmall;
  const grandStand = assets.props.grandStand;
  const billboard = assets.props.billboard;

  const grandStandPositions = [
    { sampleIdx: 0, side: -1, distance: 12 },
    { sampleIdx: 0, side: 1, distance: 12 },
  ];
  for (const gs of grandStandPositions) {
    const sample = samples[gs.sampleIdx];
    const t = tangents[gs.sampleIdx];
    const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(gs.side * gs.distance);
    const inst = grandStand.clone();
    inst.position.copy(sample).add(n);
    inst.rotation.y = Math.atan2(t.x, t.z) + (gs.side > 0 ? Math.PI : 0);
    inst.scale.setScalar(2.5);
    scene.add(inst);
  }

  const billboardSpots = [30, 90, 150, 200];
  for (const idx of billboardSpots) {
    if (idx >= samples.length - 1) continue;
    const sample = samples[idx];
    const t = tangents[idx];
    const side = (idx % 2 === 0) ? 1 : -1;
    const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(side * 10);
    const inst = billboard.clone();
    inst.position.copy(sample).add(n);
    inst.rotation.y = Math.atan2(t.x, t.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    inst.scale.setScalar(2.0);
    scene.add(inst);
  }

  const rng = mulberry32(1234);
  for (let i = 0; i < 80; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 25 + rng() * 80;
    const cx = Math.cos(angle) * dist + 20;
    const cz = Math.sin(angle) * dist + 30;
    const onSample = nearest({ x: cx, z: cz }, samples);
    if (Math.sqrt(onSample.distSq) < ROAD_HALF_WIDTH + 6) continue;
    const useBig = rng() > 0.5;
    const inst = (useBig ? treeBig : treeSmall).clone();
    inst.position.set(cx, 0, cz);
    inst.rotation.y = rng() * Math.PI * 2;
    inst.scale.setScalar(1.4 + rng() * 0.7);
    scene.add(inst);
  }
}

function nearest(pos, samples) {
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dx = samples[i].x - pos.x;
    const dz = samples[i].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return { index: bestI, distSq: bestD };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function computeItemBoxSpawns(samples, tangents) {
  const spawns = [];
  const total = samples.length - 1;
  const interval = 30;
  for (let i = interval; i < total; i += interval) {
    const t = tangents[i];
    const n = new THREE.Vector3(-t.z, 0, t.x);
    spawns.push({ position: samples[i].clone(), offset: 0 });
    spawns.push({ position: samples[i].clone().addScaledVector(n, 2.5), offset: 2.5 });
    spawns.push({ position: samples[i].clone().addScaledVector(n, -2.5), offset: -2.5 });
  }
  return spawns;
}
