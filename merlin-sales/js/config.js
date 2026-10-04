// App-wide constants. tools/make-demo.mjs rewrites the values marked BUILD when it makes the
// demo copy, so Simon's app and the demo can never share a browser database.

export const APP_NAME = 'Merlin Sales';
export const DB_NAME = 'merlin-sales'; // BUILD: the demo gets its own name
export const DB_VERSION = 1;
export const IS_DEMO = false; // BUILD: true in the demo

// Merlin's own base, shown as a distinct marker on the map.
export const BASE = {
  name: 'Merlin Accessories',
  address: 'Unit G, Nickel Close, Winnall Trading Estate, Winchester',
  postcode: 'SO23 7RJ',
};
