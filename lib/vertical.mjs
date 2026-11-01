import { getVertical } from '../verticals/index.mjs';

export const DEFAULT_VERTICAL = 'photographer';

export function verticalOf(brand) {
  if (brand.vertical === undefined) return getVertical(DEFAULT_VERTICAL);
  return typeof brand.vertical === 'string' ? getVertical(brand.vertical) : undefined;
}
