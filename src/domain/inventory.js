import { newId, newReference } from './ids.js';
import { DomainError } from './errors.js';
import { Queue } from './waitlistQueue.js';

export const MAX_TICKETS_PER_BOOKING = 10;

function assertStore(store) {
  const mapNames = ['events', 'tiers', 'bookings', 'bookingsByReference', 'waitlists'];
  if (!store || mapNames.some((name) => !(store[name] instanceof Map))) {
    throw new DomainError('VALIDATION', 'A valid inventory store is required');
  }
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${field} must be an object`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be text`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${minimum}`);
  }
  return value;
}

function getEvent(store, eventId) {
  if (typeof eventId !== 'string' || eventId.trim() === '') {
    throw new DomainError('VALIDATION', 'Event id is required');
  }
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  return event;
}

function getTier(store, tierId) {
  if (typeof tierId !== 'string' || tierId.trim() === '') {
    throw new DomainError('VALIDATION', 'Ticket tier id is required');
  }
  const tier = store.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  return tier;
}

export function createStore() {
  return {
    events: new Map(),
    tiers: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map(),
  };
}

export function createEvent(store, details) {
  assertStore(store);
  const input = requireRecord(details, 'Event');
  const { title, city, startsAt, organizerId } = input;
  if (typeof startsAt !== 'string' || startsAt.trim() === '' || Number.isNaN(Date.parse(startsAt))) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }

  const event = {
    id: newId(),
    organizerId: requireText(organizerId, 'Organizer id'),
    title: requireText(title, 'Title'),
    city: requireText(city, 'City'),
    venue: optionalText(input.venue, 'Venue'),
    startsAt: new Date(startsAt).toISOString(),
    tierIds: [],
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, details) {
  assertStore(store);
  const event = getEvent(store, eventId);
  const input = requireRecord(details, 'Ticket tier');
  const tier = {
    id: newId(),
    eventId,
    name: requireText(input.name, 'Tier name'),
    priceCents: requireWholeNumber(input.priceCents, 'priceCents', 0),
    capacity: requireWholeNumber(input.capacity, 'capacity', 1),
    sold: 0,
  };

  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());
  event.tierIds.push(tier.id);
  return tier;
}

export function seatsLeft(tier) {
  if (!tier || !Number.isSafeInteger(tier.capacity) || !Number.isSafeInteger(tier.sold)) {
    throw new DomainError('VALIDATION', 'A valid ticket tier is required');
  }
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  assertStore(store);
  const tier = getTier(store, tierId);
  const attendeeId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }

  const available = seatsLeft(tier);
  if (available < quantity) {
    throw new DomainError('SOLD_OUT', `Only ${available} ticket(s) left in ${tier.name}`, {
      seatsLeft: available,
    });
  }

  const amountCents = tier.priceCents * quantity;
  if (!Number.isSafeInteger(amountCents)) {
    throw new DomainError('VALIDATION', 'Booking amount is too large');
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId: attendeeId,
    tierId,
    quantity,
    amountCents,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  tier.sold += quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function findBookingByReference(store, reference) {
  assertStore(store);
  return store.bookingsByReference.get(requireText(reference, 'Booking reference'));
}

export function cancelBooking(store, reference) {
  assertStore(store);
  const booking = findBookingByReference(store, reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (booking.status !== 'pending') {
    throw new DomainError('INVALID_STATE', `A ${booking.status} booking cannot be cancelled`);
  }

  const tier = getTier(store, booking.tierId);
  if (tier.sold < booking.quantity) {
    throw new DomainError('INVALID_STATE', 'Ticket tier inventory is inconsistent');
  }
  tier.sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function joinWaitlist(store, tierId, userId, quantity) {
  assertStore(store);
  const tier = getTier(store, tierId);
  const attendeeId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }

  const queue = store.waitlists.get(tierId);
  if (!queue) throw new DomainError('INVALID_STATE', 'Ticket tier waitlist is unavailable');
  queue.enqueue({ userId: attendeeId, quantity });
  return { position: queue.size };
}

export function offerNextOnWaitlist(store, tierId) {
  assertStore(store);
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  if (!queue) throw new DomainError('INVALID_STATE', 'Ticket tier waitlist is unavailable');
  const next = queue.peek();
  if (!next || seatsLeft(tier) < next.quantity) return undefined;
  return queue.dequeue();
}