/**
 * Internal structural type guards. Kept in one place so the rest of the SDK can read fields
 * off `unknown` provider / announcement / error data through a real runtime check and
 * control-flow narrowing, instead of an unchecked `as` assertion.
 */

/** Whether `value` is a non-null object, narrowed for safe property access. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Read a property off an `unknown` value, or `undefined` when it is not an object. */
export function readProp(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}
