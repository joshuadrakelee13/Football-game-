// GIB-LTM <-> WGS84 lon/lat, tile ids, and other coordinate helpers.
//
// GIB-LTM (docs/COORDINATES.md):
//   +proj=tmerc +lat_0=36.13 +lon_0=-5.35 +k=1 +x_0=0 +y_0=0 +ellps=GRS80
//
// Transverse Mercator is implemented with the Krüger series to order n^6
// (Karney 2011, "Transverse Mercator with an accuracy of a few nanometres"),
// which is the same algorithm PROJ uses for +proj=tmerc. Accuracy is far
// better than 1 mm within Gibraltar. Verified against pyproj (see
// web/tools/check_geo.py).
//
// Pure functions only; no three.js dependency so it also runs under Node.

const DEG = Math.PI / 180;

// GRS80
const A_ELL = 6378137.0;
const F_ELL = 1 / 298.257222101;

export const LAT0 = 36.13;
export const LON0 = -5.35;
const K0 = 1.0;
const X0 = 0.0;
const Y0 = 0.0;

const n = F_ELL / (2 - F_ELL);
const e2 = F_ELL * (2 - F_ELL);
const e = Math.sqrt(e2);
const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
const RECT_A = (A_ELL / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);

const ALPHA = [
  0,
  n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4 - (127 / 288) * n5 + (7891 / 37800) * n6,
  (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4 + (281 / 630) * n5 - (1983433 / 1935360) * n6,
  (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
  (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
  (34729 / 80640) * n5 - (3418889 / 1995840) * n6,
  (212378941 / 319334400) * n6,
];
const BETA = [
  0,
  n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4 - (81 / 512) * n5 + (96199 / 604800) * n6,
  (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4 + (46 / 105) * n5 - (1118711 / 3870720) * n6,
  (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
  (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
  (4583 / 161280) * n5 - (108847 / 3991680) * n6,
  (20648693 / 638668800) * n6,
];

// Conformal latitude tangent from geodetic latitude tangent.
function tauPrime(tau) {
  const sig = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
  return tau * Math.sqrt(1 + sig * sig) - sig * Math.sqrt(1 + tau * tau);
}

// Geodetic latitude tangent from conformal latitude tangent (Newton).
function tauFromTauPrime(tp) {
  let tau = tp;
  for (let i = 0; i < 6; i++) {
    const tpi = tauPrime(tau);
    const dtau = ((tp - tpi) / Math.sqrt(1 + tpi * tpi)) *
      ((1 + (1 - e2) * tau * tau) / ((1 - e2) * Math.sqrt(1 + tau * tau)));
    tau += dtau;
    if (Math.abs(dtau) < 1e-14) break;
  }
  return tau;
}

function forwardRaw(lonDeg, latDeg) {
  const phi = latDeg * DEG;
  const dl = (lonDeg - LON0) * DEG;
  const tp = tauPrime(Math.tan(phi));
  const xip = Math.atan2(tp, Math.cos(dl));
  const etap = Math.asinh(Math.sin(dl) / Math.sqrt(tp * tp + Math.cos(dl) * Math.cos(dl)));
  let xi = xip, eta = etap;
  for (let j = 1; j <= 6; j++) {
    xi += ALPHA[j] * Math.sin(2 * j * xip) * Math.cosh(2 * j * etap);
    eta += ALPHA[j] * Math.cos(2 * j * xip) * Math.sinh(2 * j * etap);
  }
  return [K0 * RECT_A * eta, K0 * RECT_A * xi];
}

const NORTHING_AT_LAT0 = forwardRaw(LON0, LAT0)[1];

/** lon/lat (degrees, WGS84/ETRS89) -> GIB-LTM [x east, y north] metres. */
export function lonLatToLtm(lon, lat) {
  const [x, y] = forwardRaw(lon, lat);
  return [x + X0, y - NORTHING_AT_LAT0 + Y0];
}

/** GIB-LTM [x east, y north] metres -> [lon, lat] degrees. */
export function ltmToLonLat(x, y) {
  const xi = (y - Y0 + NORTHING_AT_LAT0) / (K0 * RECT_A);
  const eta = (x - X0) / (K0 * RECT_A);
  let xip = xi, etap = eta;
  for (let j = 1; j <= 6; j++) {
    xip -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etap -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const sxip = Math.sin(xip), cxip = Math.cos(xip), shetap = Math.sinh(etap);
  const tp = sxip / Math.sqrt(shetap * shetap + cxip * cxip);
  const dl = Math.atan2(shetap, cxip);
  const tau = tauFromTauPrime(tp);
  return [LON0 + dl / DEG, Math.atan(tau) / DEG];
}

// ---------------------------------------------------------------- tiles

export const TILE = 500;

export function tileIndexOf(x, y) {
  return [Math.floor(x / TILE), Math.floor(y / TILE)];
}

export function tileId(ix, iy) {
  const ex = ix >= 0 ? `E${ix}` : `W${-ix}`;
  const ny = iy >= 0 ? `N${iy}` : `S${-iy}`;
  return `T_${ex}_${ny}`;
}

// ---------------------------------------------------------------- axes
// GIB-LTM (x east, y north, z up)  <->  three.js (X east, Y up, Z south)

export const ltmToThree = (x, y, z) => [x, z, -y];
export const threeToLtm = (X, Y, Z) => [X, -Z, Y];

/** Compass heading (deg clockwise from north) <-> three.js yaw (rotation about +Y). */
// Camera looks along -Z at yaw 0, i.e. north. Positive yaw turns left (CCW from above).
export const headingToYaw = (hdg) => -hdg * DEG;
export const yawToHeading = (yaw) => {
  let h = (-yaw / DEG) % 360;
  if (h < 0) h += 360;
  return h;
};

export function cardinal(h) {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return names[Math.round(h / 22.5) % 16];
}
