import { randomUUID } from 'node:crypto';

// Example storage only. Replace these methods when a real database is needed.
export function createItemsRepository() {
  const items = new Map();
  return {
    async count() {
      return items.size;
    },
    async list({ limit, offset }) {
      return [...items.values()].slice(offset, offset + limit).map((item) => ({ ...item }));
    },
    async findById(id) {
      const item = items.get(id);
      return item ? { ...item } : null;
    },
    async create({ name }) {
      // Check and insert without awaiting so concurrent calls cannot exceed the cap.
      if (items.size >= 1000) return null;
      const item = { id: randomUUID(), name, createdAt: new Date().toISOString() };
      items.set(item.id, item);
      return { ...item };
    },
  };
}
