import * as photographer from './photographer/schema.mjs';

const verticals = { photographer };

export function getVertical(name) {
  return Object.hasOwn(verticals, name) ? verticals[name] : undefined;
}
