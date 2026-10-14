import { Router } from 'express';
import { requireJson, validate } from '../../middleware/validate.js';
import { createItemsController } from './items.controller.js';
import { createItemsRepository } from './items.repository.js';
import { createItemsService } from './items.service.js';
import { createItemSchema, itemParamsSchema, listItemsSchema } from './items.schemas.js';

export function createItemsRouter() {
  const router = Router();
  const controller = createItemsController(createItemsService(createItemsRepository()));
  router.get('/', validate(listItemsSchema, 'query'), controller.list);
  router.post('/', requireJson, validate(createItemSchema, 'body'), controller.create);
  router.get('/:id', validate(itemParamsSchema, 'params'), controller.get);
  return router;
}
