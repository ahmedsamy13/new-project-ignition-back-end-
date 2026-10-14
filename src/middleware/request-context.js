import { randomUUID } from 'node:crypto';

export function requestContext(logger) {
  return (req, res, next) => {
    const started = performance.now();
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);
    res.set('Cache-Control', 'no-store');
    res.on('finish', () => {
      // Route templates avoid recording IDs, query strings, or unknown URLs.
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      logger('info', 'request_completed', {
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    });
    next();
  };
}
