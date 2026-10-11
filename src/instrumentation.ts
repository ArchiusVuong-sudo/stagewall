/** Seed on first start and warm up the screener before the first fan arrives. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureBooted } = await import("./lib/boot");
    void ensureBooted();
  }
}
