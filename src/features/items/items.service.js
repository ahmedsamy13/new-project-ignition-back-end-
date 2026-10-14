import { AppError } from '../../shared/app-error.js';

export function createItemsService(repository) {
  return {
    async list(options) {
      const items = await repository.list(options);
      const total = await repository.count();
      return { items, pagination: { ...options, total } };
    },
    async get(id) {
      const item = await repository.findById(id);
      if (!item) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found.');
      return item;
    },
    async create(input) {
      const item = await repository.create(input);
      if (!item) {
        throw new AppError(409, 'EXAMPLE_CAPACITY_REACHED', 'The example store has reached its item limit.');
      }
      return item;
    },
  };
}
