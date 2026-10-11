// Unit tests never touch the network: replay mode, no delay, no live login lookup.
if (process.env.LIVE !== "1") {
  process.env.DEMO_REPLAY = "1";
}
process.env.REPLAY_DELAY_MS = "0";
