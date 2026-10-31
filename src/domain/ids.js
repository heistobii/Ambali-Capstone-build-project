import { randomInt, randomUUID } from 'node:crypto';

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newId() {
  return randomUUID();
}

export function newReference() {
  const characters = Array.from({ length: 10 }, () => (
    REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  ));
  return `${characters.slice(0, 5).join('')}-${characters.slice(5).join('')}`;
}