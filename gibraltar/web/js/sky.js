// Sky dome, sun & moon lights, stars, fog and sea — all driven by the real sun
// position for Gibraltar (NOAA) at the simulated Europe/Gibraltar time.

import * as THREE from 'three';
import { solarPosition } from './sun.js';
import { LAT0, LON0 } from './geo.js';

const RAD = Math.PI / 180;

// Keyframes by sun elevation (degrees). Colours are sRGB hex.
const KEYS = [
  { e: -18, zen: '#02040b', hor: '#070c18', hemiSky: '#2a3658', hemiGnd: '#0c0d12', hemi: 0.35 },
  { e: -9, zen: '#081129', hor: '#1d2442', hemiSky: '#34406a', hemiGnd: '#121318', hemi: 0.45 },
  { e: -4, zen: '#162a55', hor: '#7a5468', hemiSky: '#5a6488', hemiGnd: '#2a2522', hemi: 0.7 },
  { e: 0, zen: '#2a4c86', hor: '#e59563', hemiSky: '#8a9bc0', hemiGnd: '#5a4d3c', hemi: 1.1 },
  { e: 6, zen: '#3767ad', hor: '#eebd94', hemiSky: '#a9bddc', hemiGnd: '#7a6c56', hemi: 1.5 },
  { e: 15, zen: '#3874c2', hor: '#b9d2e8', hemiSky: '#b8cfea', hemiGnd: '#8a7d68', hemi: 1.75 },
  { e: 45, zen: '#2c68bd', hor: '#a8c9e6', hemiSky: '#bed4ee', hemiGnd: '#8f826c', hemi: 1.85 },
];
const COLS = KEYS.map((k) => ({
  e: k.e, hemi: k.hemi,
  zen: new THREE.Color(k.zen), hor: new THREE.Color(k.hor),
  hemiSky: new THREE.Color(k.hemiSky), hemiGnd: new THREE.Color(k.hemiGnd),
}));

function sampleKeys(elev, out) {
  let i = 0;
  while (i < COLS.length - 2 && elev > COLS[i + 1].e) i++;
  const a = COLS[i], b = COLS[i + 1];
  const t = Math.min(1, Math.max(0, (elev - a.e) / (b.e - a.e)));
  out.zen.copy(a.zen).lerp(b.zen, t);
  out.hor.copy(a.hor).lerp(b.hor, t);
  out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  out.hemiGnd.copy(a.hemiGnd).lerp(b.hemiGnd, t);
  out.hemi = a.hemi + (b.hemi - a.hemi) * t;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Direction (three.js world, unit) towards a body at azimuth/elevation (deg). North = -Z, east = +X. */
export function dirFromAzEl(azDeg, elDeg, out = new THREE.Vector3()) {
  const az = azDeg * RAD, el = elDeg * RAD;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export class Environment {
  constructor(scene, manifest) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.cols = { zen: new THREE.Color(), hor: new THREE.Color(), hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(), hemi: 1 };
    this.sun = { elevation: 0, azimuth: 0 };
    this.shadowExtent = 100; // ±100 m = 200 m square

    // ---- lights
    this.hemi = new THREE.HemisphereLight(0xbcd2ee, 0x6b5e48, 1.0);
    scene.add(this.hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 3);
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow;
    sc.mapSize.set(2048, 2048);
    sc.camera.left = -this.shadowExtent; sc.camera.right = this.shadowExtent;
    sc.camera.top = this.shadowExtent; sc.camera.bottom = -this.shadowExtent;
    sc.camera.near = 1; sc.camera.far = 2000;
    sc.bias = -0.0004;
    sc.normalBias = 0.06;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x9fb4ff, 0);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    // ---- fog
    scene.fog = new THREE.FogExp2(0xa8c9e6, 0.00011);

    // ---- sky dome (drawn first, no depth)
    this.skyUniforms = {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      sunVis: { value: 1 },
      moonDir: { value: new THREE.Vector3(0, 1, 0) },
      moonVis: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float sunVis; uniform vec3 moonDir; uniform float moonVis;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));
          if (d.y < 0.0) col = mix(horizon, horizon * 0.55, min(1.0, -d.y * 4.0));
          float s = max(dot(d, sunDir), 0.0);
          // sun disc ~0.55° across, plus a tight glow and a broad aureole
          float disc = smoothstep(0.999950, 0.999965, s);
          col += sunColor * (disc * 12.0 + pow(s, 1500.0) * 1.5 + pow(s, 10.0) * 0.18) * sunVis;
          float m = max(dot(d, moonDir), 0.0);
          col += vec3(0.75, 0.8, 0.9) * (smoothstep(0.99985, 0.9999, m) * 1.2 + pow(m, 60.0) * 0.05) * moonVis;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(15000, 48, 24), skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Small environment map rendered from the same sky shader, so glossy materials
    // (windows) reflect the current sky. Refreshed when the sun moves noticeably.
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
    this.pmrem = null;
    this.envRT = null;
    this.envElev = null;
    this.envTarget = null; // materials that get the env map

    // ---- stars
    const N = 2500, pos = new Float32Array(N * 3);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const y = Math.abs(u) * 0.98 + 0.02, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * 14000; pos[i * 3 + 1] = y * 14000; pos[i * 3 + 2] = Math.sin(th) * r * 14000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Opaque (drawn first, right after the dome) so buildings and terrain always cover the stars;
    // fading is done through the colour, not transparency.
    this.starMat = new THREE.PointsMaterial({ color: 0x000000, size: 1.6, sizeAttenuation: false,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // ---- sea: at least project bounds + 5 km; in practice a 60 km square that
    // follows the camera (snapped to the wave-texture period so waves stay
    // world-locked) so the sea always reaches the horizon.
    this.seaLevel = manifest.sea_level_m ?? 0;
    const [x0, y0, x1, y1] = manifest.project_bounds_m;
    const pad = 5000;
    const need = Math.max((x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad);
    this.seaSize = Math.max(60000, need * 2);
    this.wavePeriod = 50; // metres per normal-map tile
    const seaGeo = new THREE.PlaneGeometry(this.seaSize, this.seaSize, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    this.waterNormal = makeWaterNormalMap();
    this.waterNormal.repeat.set(this.seaSize / this.wavePeriod, this.seaSize / this.wavePeriod);
    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x1d4f66, roughness: 0.2, metalness: 0.0,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.3, 0.3),
    });
    this.seaMesh = new THREE.Mesh(seaGeo, this.seaMat);
    this.seaMesh.position.set((x0 + x1) / 2, this.seaLevel, -(y0 + y1) / 2);
    this.seaMesh.receiveShadow = true;
    this.seaMesh.frustumCulled = false;
    this.seaMesh.name = 'sea';
    scene.add(this.seaMesh);
    this.seaDeep = new THREE.Color(0x174a63);
    this._tmp = new THREE.Color();
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._mi = new THREE.Matrix4();
  }

  setShadows(on) { this.sunLight.castShadow = on; }

  update(utcMs, camera, playerPos, dt) {
    const s = solarPosition(utcMs, LAT0, LON0);
    this.sun = s;
    const el = s.elevation;
    dirFromAzEl(s.azimuth, el, this.sunDir);
    sampleKeys(el, this.cols);

    // Sky
    const U = this.skyUniforms;
    U.zenith.value.copy(this.cols.zen);
    U.horizon.value.copy(this.cols.hor);
    U.sunDir.value.copy(this.sunDir);
    U.sunVis.value = smooth(-3, 1, el);
    U.sunColor.value.setRGB(1, 0.75 + 0.2 * smooth(0, 20, el), 0.5 + 0.4 * smooth(0, 25, el));
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    const starK = smooth(-5, -14, el);
    this.starMat.color.setScalar(starK * 0.9);
    this.stars.visible = starK > 0.003;
    this.stars.rotation.y = (utcMs / 86164090) * Math.PI * 2 % (Math.PI * 2);

    // Simple moon: opposite the sun in azimuth, 35–55° high, only at night.
    const night = smooth(-2, -10, el);
    const moonDir = dirFromAzEl((s.azimuth + 180) % 360, 45 + 10 * Math.sin(utcMs / 3.6e6 / 6), this._v);
    U.moonDir.value.copy(moonDir);
    U.moonVis.value = night;

    // Sun light
    const dayK = smooth(-2, 12, el);
    this.sunLight.intensity = 2.7 * dayK;
    this.sunLight.color.setRGB(1, 0.72 + 0.24 * smooth(0, 25, el), 0.5 + 0.42 * smooth(0, 30, el));
    this.moonLight.intensity = 0.35 * night;
    this.moonLight.position.copy(playerPos).addScaledVector(moonDir, 500);
    this.moonLight.target.position.copy(playerPos);
    this.moonLight.target.updateMatrixWorld();

    // Shadow camera follows the player, snapped to shadow-map texels to avoid shimmering.
    const light = this.sunLight;
    const dir = el > 0 ? this.sunDir : this._v.set(0, 1, 0);
    this._m.lookAt(new THREE.Vector3(0, 0, 0), dir.clone().negate(), new THREE.Vector3(0, 1, 0));
    this._mi.copy(this._m).invert();
    const p = playerPos.clone().applyMatrix4(this._mi);
    const texel = (2 * this.shadowExtent) / light.shadow.mapSize.x;
    p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(this._m);
    light.target.position.copy(p);
    light.position.copy(p).addScaledVector(dir, 900);
    light.target.updateMatrixWorld();

    // Hemisphere / fog
    this.hemi.color.copy(this.cols.hemiSky);
    this.hemi.groundColor.copy(this.cols.hemiGnd);
    this.hemi.intensity = this.cols.hemi;
    this.scene.fog.color.copy(this.cols.hor);

    // Refresh the sky reflection every ~1.5° of sun movement.
    if (this.renderer && this.envTarget && (this.envElev == null || Math.abs(el - this.envElev) > 1.5)) {
      this.envElev = el;
      if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      for (const m of this.envTarget) { m.envMap = rt.texture; m.envMapIntensity = 0.25 + 0.75 * dayK; m.needsUpdate = !this.envRT; }
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
    }

    // Sea tint follows the sky a little; waves drift.
    this._tmp.copy(this.seaDeep).lerp(this.cols.hor, 0.12).multiplyScalar(0.25 + 0.75 * smooth(-8, 10, el));
    this.seaMat.color.copy(this._tmp);
    const P = this.wavePeriod;
    this.seaMesh.position.x = Math.round(camera.position.x / P) * P;
    this.seaMesh.position.z = Math.round(camera.position.z / P) * P;
    this.waterNormal.offset.x = (this.waterNormal.offset.x + dt * 0.004) % 1;
    this.waterNormal.offset.y = (this.waterNormal.offset.y + dt * 0.0025) % 1;
  }
}

// Tileable water normal map from a sum of integer-frequency waves.
function makeWaterNormalMap() {
  const S = 256;
  const hgt = new Float32Array(S * S);
  const waves = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 24; i++) {
    const fx = Math.round((rnd() * 2 - 1) * (2 + i * 0.7)), fy = Math.round((rnd() * 2 - 1) * (2 + i * 0.7)) || 1;
    waves.push([fx, fy, rnd() * Math.PI * 2, 1 / (1 + Math.hypot(fx, fy))]);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [fx, fy, ph, a] of waves) v += a * Math.sin(2 * Math.PI * (fx * x + fy * y) / S + ph);
    hgt[y * S + x] = v;
  }
  const data = new Uint8Array(S * S * 4);
  const k = 2.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
    const dy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
    let nx = -dx * k, ny = -dy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * S + x) * 4;
    data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 2] = (nz * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
