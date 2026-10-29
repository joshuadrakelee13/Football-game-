// Solar position (NOAA Solar Calculator algorithm) and Europe/Gibraltar civil time.
// Pure functions, no three.js.

const RAD = Math.PI / 180;

/**
 * NOAA solar position. Returns { elevation, azimuth } in degrees
 * (azimuth clockwise from true north), elevation including a standard
 * atmospheric refraction correction.
 */
export function solarPosition(utcMs, latDeg, lonDeg) {
  const jd = utcMs / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525;
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;      // geom mean long sun
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);               // geom mean anomaly
  const ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const C = Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) / RAD;
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eqTime = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * ecc * Math.sin(M * RAD) +
    4 * ecc * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
    0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * ecc * ecc * Math.sin(2 * M * RAD)); // minutes

  const d = new Date(utcMs);
  const minutesUtc = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  let tst = (minutesUtc + eqTime + 4 * lonDeg) % 1440;
  if (tst < 0) tst += 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cosZen = Math.sin(latDeg * RAD) * Math.sin(decl * RAD) +
    Math.cos(latDeg * RAD) * Math.cos(decl * RAD) * Math.cos(ha * RAD);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen))) / RAD;
  let az;
  const den = Math.cos(latDeg * RAD) * Math.sin(zen * RAD);
  if (Math.abs(den) < 1e-9) az = 0;
  else {
    const a = Math.acos(Math.min(1, Math.max(-1, (Math.sin(latDeg * RAD) * Math.cos(zen * RAD) - Math.sin(decl * RAD)) / den))) / RAD;
    az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  const elev0 = 90 - zen;
  // NOAA refraction approximation
  let refr = 0;
  if (elev0 <= 85) {
    const te = Math.tan(elev0 * RAD);
    if (elev0 > 5) refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elev0 > -0.575) refr = 1735 + elev0 * (-518.2 + elev0 * (103.4 + elev0 * (-12.79 + elev0 * 0.711)));
    else refr = -20.772 / te;
    refr /= 3600;
  }
  return { elevation: elev0 + refr, azimuth: az, declination: decl, eqTime };
}

// ---------------------------------------------------------------- time zone
// Europe/Gibraltar = CET (UTC+1) / CEST (UTC+2), EU rules: summer time from
// 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October.

function lastSundayUtc(year, month /* 0-based */) {
  const d = new Date(Date.UTC(year, month + 1, 0)); // last day of month
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return Date.UTC(year, month, d.getUTCDate(), 1, 0, 0);
}

export function isEuSummerTime(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  return utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9);
}

export function gibOffsetHours(utcMs) { return isEuSummerTime(utcMs) ? 2 : 1; }

/** Local civil time parts for a UTC instant. */
export function gibLocal(utcMs) {
  const off = gibOffsetHours(utcMs);
  const d = new Date(utcMs + off * 3600000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
    zone: off === 2 ? 'CEST' : 'CET', offset: off,
  };
}

/** UTC ms for a local Europe/Gibraltar wall-clock time (hour may be fractional). */
export function gibLocalToUtc(year, month, day, hour) {
  const naive = Date.UTC(year, month - 1, day) + hour * 3600000;
  // try summer then winter offset; pick the one that is self-consistent
  for (const off of [2, 1]) {
    const utc = naive - off * 3600000;
    if (gibOffsetHours(utc) === off) return utc;
  }
  return naive - 1 * 3600000; // non-existent hour in spring gap
}

export function fmtLocal(utcMs) {
  const l = gibLocal(utcMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${l.year}-${p(l.month)}-${p(l.day)} ${p(l.hour)}:${p(l.minute)} ${l.zone}`;
}
