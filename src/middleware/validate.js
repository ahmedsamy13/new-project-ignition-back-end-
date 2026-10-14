import { AppError } from '../shared/app-error.js';

export function requireJson(req, res, next) {
  const contentType = req.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json.');
  }
  next();
}

export function validate(schema, source) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.code === 'unrecognized_keys' ? 'Unknown fields are not allowed.' : issue.message,
      }));
      throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', details);
    }
    // Express 5 req.query is a getter; keep parsed inputs separately.
    res.locals.validated ??= {};
    res.locals.validated[source] = result.data;
    next();
  };
}
