import { api, ApiError } from "./client";

describe("API errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: string, type = "text/html") =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status, headers: { "Content-Type": type } })));

  it("explains a proxy 502 (server down or restarting)", async () => {
    respond(502, "<html>Bad Gateway</html>");
    await expect(api.listProjects()).rejects.toThrow(/isn't responding right now/);
  });

  it("still prefers the API's own message, also on 502", async () => {
    respond(502, JSON.stringify({ detail: "Claude API rate limit reached." }), "application/json");
    await expect(api.listProjects()).rejects.toThrow("Claude API rate limit reached.");
  });

  it("keeps the status code for other errors", async () => {
    respond(418, "nope");
    const err = await api.listProjects().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Request failed (418)");
  });
});
