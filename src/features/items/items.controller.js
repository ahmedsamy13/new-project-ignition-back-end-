export function createItemsController(service) {
  return {
    async list(req, res) {
      const result = await service.list(res.locals.validated.query);
      res.json({ success: true, data: result.items, meta: result.pagination });
    },
    async get(req, res) {
      const item = await service.get(res.locals.validated.params.id);
      res.json({ success: true, data: item });
    },
    async create(req, res) {
      const item = await service.create(res.locals.validated.body);
      res.location(`/api/v1/items/${item.id}`).status(201).json({ success: true, data: item });
    },
  };
}
