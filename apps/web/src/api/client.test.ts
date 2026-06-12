import { describe, it, expect, vi, afterEach } from "vitest";
import { searchAuthors, ApiRequestError } from "./client.js";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("searchAuthors calls the search endpoint and returns candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ name: "Smith J" }] }), { status: 200 })),
    );
    const result = await searchAuthors("Smith J");
    expect(result[0]!.name).toBe("Smith J");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/authors/search?name=Smith"),
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("searchAuthors forwards the AbortSignal to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })),
    );
    const controller = new AbortController();
    await searchAuthors("Smith J", controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("non-OK response with JSON error body throws ApiRequestError with status and detail", async () => {
    const errorBody = { error: "upstream_unavailable", message: "PubMed is temporarily unavailable" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(errorBody), { status: 503 })),
    );
    const err = await searchAuthors("Smith J").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    const apiErr = err as ApiRequestError;
    expect(apiErr.status).toBe(503);
    expect(apiErr.detail?.error).toBe("upstream_unavailable");
    expect(apiErr.message).toBe("PubMed is temporarily unavailable");
  });

  it("non-OK response with non-JSON body throws ApiRequestError with status only", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const err = await searchAuthors("Smith J").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(500);
    expect((err as ApiRequestError).detail).toBeUndefined();
  });
});
