/** A failed call to the NCBI E-utilities API. Mapped to 502/503 by the app error handler. */
export class UpstreamError extends Error {
  constructor(
    public readonly upstreamStatus: number,
    public readonly operation: string,
  ) {
    super(`${operation} failed with upstream status ${upstreamStatus}`);
    this.name = "UpstreamError";
  }
}
