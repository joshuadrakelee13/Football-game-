// Monotonic entity ids and in-place array compaction.
//
// Entities are flagged `dead` during a tick and removed once, at the end of it.
// Splicing mid-loop would change iteration order depending on who died first,
// which is exactly the kind of thing that makes a simulation non-reproducible.

let counter = 0;

export function nextId() {
  return ++counter;
}

export function resetIds() {
  counter = 0;
}

// Remove every entry flagged `dead`, preserving the order of the survivors.
// Order matters: a side's unit array is permanently sorted front-to-back, and
// that invariant is what makes "the ally in front of me" an O(1) lookup.
export function compact(arr) {
  let write = 0;
  for (let read = 0; read < arr.length; read++) {
    if (arr[read].dead) continue;
    if (write !== read) arr[write] = arr[read];
    write++;
  }
  arr.length = write;
  return arr;
}
