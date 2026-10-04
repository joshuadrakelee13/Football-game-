// Saved mappings ("profiles"). A profile remembers, for each file it has seen, the file's
// heading row, what kind of file it is and which column feeds each field, plus the choices
// made on the import check. A file is recognised by its heading row alone, so the next day's
// export of the same report imports in one click.

import { FILE_TYPES, normaliseHeading } from './fields.js';

export function signature(file) {
  return (file.grid[file.headerRow] || []).map(normaliseHeading).join('|');
}

// Build a profile from analysed files (each with typeId and mapping) and the chosen options.
export function makeProfile({ id, name, files, options, existing }) {
  const now = Date.now();
  const entries = new Map((existing?.files || []).map((f) => [f.signature, f]));
  for (const f of files) {
    entries.set(signature(f), {
      signature: signature(f),
      typeId: f.typeId,
      label: FILE_TYPES[f.typeId].label,
      headerRowHint: f.headerRow,
      mapping: { ...f.mapping },
    });
  }
  return {
    id: id || existing?.id || `p${now}`,
    name,
    files: [...entries.values()],
    options: { ...(existing?.options || {}), ...options },
    created: existing?.created || now,
    updated: now,
  };
}

// The profile that recognises every one of these files, if any. Prefers the profile that
// knows the most of them, then the most recently used.
export function matchProfile(profiles, files) {
  let best = null;
  for (const p of profiles) {
    const known = new Map(p.files.map((f) => [f.signature, f]));
    const hits = files.map((f) => known.get(signature(f)));
    if (hits.some((h) => !h)) continue;
    if (!best || (p.updated || 0) > (best.profile.updated || 0)) best = { profile: p, entries: hits };
  }
  return best;
}
