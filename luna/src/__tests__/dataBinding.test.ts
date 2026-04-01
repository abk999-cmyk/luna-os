import { describe, it, expect } from 'vitest';
import { resolveDataBindings, writeBinding } from '../renderer/dataBinding';

describe('resolveDataBindings', () => {
  it('resolves simple path', () => {
    const result = resolveDataBindings({ name: '$.user' }, { user: 'Alice' });
    expect(result.name).toBe('Alice');
  });

  it('resolves nested path', () => {
    const result = resolveDataBindings(
      { city: '$.address.city' },
      { address: { city: 'SF' } }
    );
    expect(result.city).toBe('SF');
  });

  it('returns undefined for missing path', () => {
    const result = resolveDataBindings({ x: '$.missing' }, {});
    expect(result.x).toBeUndefined();
  });

  it('passes through non-binding values', () => {
    const result = resolveDataBindings(
      { label: 'Hello', count: 5 },
      {}
    );
    expect(result.label).toBe('Hello');
    expect(result.count).toBe(5);
  });

  it('resolves array index', () => {
    const result = resolveDataBindings(
      { first: '$.items[0]' },
      { items: ['a', 'b', 'c'] }
    );
    expect(result.first).toBe('a');
  });
});

describe('writeBinding', () => {
  it('writes simple path', () => {
    const result = writeBinding('name', 'Bob', { name: 'Alice' });
    expect(result.name).toBe('Bob');
  });

  it('writes nested path', () => {
    const result = writeBinding('address.city', 'NYC', {
      address: { city: 'SF', state: 'CA' },
    });
    expect(result.address.city).toBe('NYC');
  });

  it('creates intermediate objects', () => {
    const result = writeBinding('a.b.c', 'value', {});
    expect(result.a.b.c).toBe('value');
  });

  it('does not mutate original', () => {
    const original = { name: 'Alice' };
    const result = writeBinding('name', 'Bob', original);
    expect(original.name).toBe('Alice');
    expect(result.name).toBe('Bob');
  });

  it('handles empty path', () => {
    const original = { x: 1 };
    const result = writeBinding('', 'value', original);
    expect(result).toEqual({ x: 1 });
  });
});
