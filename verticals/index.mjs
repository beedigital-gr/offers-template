import * as schema from './photographer/schema.mjs';
import { strings } from './photographer/strings.mjs';

const verticals = { photographer: { ...schema, strings } };

export function getVertical(name) {
  return Object.hasOwn(verticals, name) ? verticals[name] : undefined;
}
