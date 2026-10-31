const BOOKING_COUNT = 100_000;
const LOOKUP_COUNT = 500;
const bookings = [];
const bookingsByReference = new Map();

for (let index = 0; index < BOOKING_COUNT; index += 1) {
  const booking = { reference: `REF-${index}`, number: index };
  bookings.push(booking);
  bookingsByReference.set(booking.reference, booking);
}

const targets = Array.from({ length: LOOKUP_COUNT }, (_, index) => (
  bookings[((index * 7_919) % BOOKING_COUNT)].reference
));

function time(label, lookup) {
  const start = performance.now();
  for (const reference of targets) lookup(reference);
  const elapsed = performance.now() - start;
  console.log(`${label.padEnd(12)} ${elapsed.toFixed(2).padStart(10)} ms for ${LOOKUP_COUNT} lookups`);
  return elapsed;
}

console.log(`${BOOKING_COUNT.toLocaleString()} bookings in memory\n`);
const arrayMs = time('Array.find', (reference) => (
  bookings.find((booking) => booking.reference === reference)
));
const mapMs = time('Map.get', (reference) => bookingsByReference.get(reference));
console.log(`\nThe Map was about ${Math.round(arrayMs / Math.max(mapMs, 0.001)).toLocaleString()}x faster.`);
console.log('Array.find scans entries (O(n)); Map.get is average O(1).');