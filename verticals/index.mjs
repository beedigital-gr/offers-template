import * as schema from './photographer/schema.mjs';
import { photosFor, renderPage } from './photographer/render.mjs';
import { strings } from './photographer/strings.mjs';

const verticals = { photographer: { ...schema, renderPage, photosFor, strings } };

export function getVertical(name) {
  return Object.hasOwn(verticals, name) ? verticals[name] : undefined;
}
