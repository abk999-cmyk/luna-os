/**
 * Resolve JSONPath-like data bindings against a context object.
 * Supports: $.field, $.nested.field, $.array[0], $.array[0].field
 */

/** Resolve a single path like "field.nested[0].value" against an object. */
function resolvePath(path: string, obj: any): any {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;

    // Handle array index: "items[0]"
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      current = current[match[1]];
      if (current == null) return undefined;
      current = current[parseInt(match[2])];
    } else {
      current = current[part];
    }
  }

  return current;
}

/** Check if a value is a data binding reference (starts with "$." ) */
function isBinding(value: any): value is string {
  return typeof value === 'string' && value.startsWith('$.');
}

/**
 * Resolve all data bindings in a props object.
 * Any string value starting with "$." is resolved against the data context.
 * Non-binding values are passed through unchanged.
 */
export function resolveDataBindings(
  props: Record<string, any>,
  context: Record<string, any>
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const [key, value] of Object.entries(props)) {
    if (isBinding(value)) {
      // Strip "$." prefix and resolve
      resolved[key] = resolvePath(value.slice(2), context);
    } else if (Array.isArray(value)) {
      // Resolve bindings inside arrays (including nested objects)
      resolved[key] = value.map((item) => {
        if (isBinding(item)) return resolvePath(item.slice(2), context);
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return resolveDataBindings(item, context);
        }
        if (Array.isArray(item)) {
          return resolveDataBindings({ _arr: item }, context)._arr;
        }
        return item;
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively resolve nested objects
      resolved[key] = resolveDataBindings(value, context);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Write a value to a data binding path, returning a new context object.
 * Path format: "field.nested.path" (without the "$." prefix)
 */
export function writeBinding(
  path: string,
  value: any,
  context: Record<string, any>
): Record<string, any> {
  if (!path) return context;

  const parts = path.split('.');
  const result = { ...context };
  let current: any = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    // Handle array index: "items[0]"
    const match = part.match(/^(\w+)\[(\d+)\]$/);
    if (match) {
      const [, key, indexStr] = match;
      const index = parseInt(indexStr);
      current[key] = [...(current[key] || [])];
      current[key][index] = { ...(current[key][index] || {}) };
      current = current[key][index];
    } else {
      current[part] = { ...(current[part] || {}) };
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const lastMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (lastMatch) {
    const [, key, indexStr] = lastMatch;
    const index = parseInt(indexStr);
    current[key] = [...(current[key] || [])];
    current[key][index] = value;
  } else {
    current[lastPart] = value;
  }

  return result;
}
