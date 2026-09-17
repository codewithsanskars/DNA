import { Request, Response, NextFunction } from 'express';

// Postgres SQLSTATE for a foreign-key violation. TypeORM's QueryFailedError
// copies the driver error's properties (incl. `code`) onto itself, so this
// is reachable straight off a caught query error — see
// node_modules/typeorm/error/QueryFailedError.js.
const FOREIGN_KEY_VIOLATION = '23503';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Error]', err.message, err.stack);

  // Most commonly hit by a JWT issued before a database reseed/truncate:
  // the token's organizationId/userId no longer exists, so a later insert
  // referencing it (e.g. creating a job under that org) fails here instead
  // of at auth time. A plain 500 leaves no way to tell that apart from a
  // real server bug, so surface it distinctly with an actionable message.
  if ((err as any).code === FOREIGN_KEY_VIOLATION) {
    res.status(409).json({
      success: false,
      error: 'Your session refers to data that no longer exists. Please log out and back in, then try again.',
    });
    return;
  }

  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? 'Internal server error' : err.message,
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: `Route ${req.path} not found` });
}
