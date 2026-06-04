export class AppError extends Error {
  constructor(
    public code: string,
    public override message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function formatError(err: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'internal server error' } } };
}
