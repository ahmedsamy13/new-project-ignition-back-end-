import { AppError } from '../shared/app-error.js';

const parserErrors = {
  'entity.parse.failed': [400, 'INVALID_JSON', 'Request body must contain valid JSON.'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the configured limit.'],
  'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Compressed request bodies are not supported.'],
  'charset.unsupported': [415, 'UNSUPPORTED_CHARSET', 'Use UTF-8 JSON.'],
  'request.aborted': [400, 'REQUEST_ABORTED', 'Request body was interrupted.'],
  'request.size.invalid': [400, 'INVALID_BODY_SIZE', 'Request body size is invalid.'],
};

export function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const parsedError = Object.hasOwn(parserErrors, err?.type) ? parserErrors[err.type] : undefined;
    const known = err instanceof AppError ? err : parsedError ? new AppError(...parsedError) : null;
    const status = known?.status ?? 500;
    const code = known?.code ?? 'INTERNAL_ERROR';
    if (status >= 500) {
      // Raw errors can contain credentials, query text, or third-party responses.
      logger('error', 'request_failed', { requestId: res.locals.requestId, code });
    }
    const error = { code, message: known?.message ?? 'An unexpected error occurred.' };
    if (known?.details) error.details = known.details;
    res.status(status).json({ success: false, error, requestId: res.locals.requestId });
  };
}
