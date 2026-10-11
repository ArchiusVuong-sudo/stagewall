import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db";
import { screenMessage, submitMessage, fanDelete } from "@/lib/service";
import { approve, outcome, tempDb, testCtx } from "../helpers";

/** Read the main file and the WAL as raw bytes, the way someone with the disk would. */
function diskBytes(file: string): string {
  let out = readFileSync(file).toString("latin1");
  try {
    out += readFileSync(`${file}-wal`).toString("latin1");
  } catch {
    // no WAL right now
  }
  return out;
}

const RAW = {
  phone: "(415) 555-0134",
  phoneDigits: "5550134",
  email: "ines.raw@example.com",
  handle: "@ines_example",
  street: "42 Oak Hill Street",
  link: "example.com/my-page",
};

let db: DB;
let file: string;
let cleanup: () => void;
beforeEach(() => ({ db, file, cleanup } = tempDb()));
afterEach(() => cleanup());

describe("raw personal details never reach the disk", () => {
  it("is absent from the database and WAL bytes after submit and screening", async () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const { view } = submitMessage(
      ctx,
      {
        name: "Ines @ines_example",
        track: "Glasshouse",
        message: `call ${RAW.phone}, mail ${RAW.email}, dm ${RAW.handle}, I live at ${RAW.street}, see ${RAW.link}`,
        displayConsent: true,
        recapConsent: true,
      },
      { screenNow: false },
    );
    await screenMessage(ctx, view.id);

    const bytes = diskBytes(file);
    expect(bytes).toContain("[phone removed]"); // the row is really there
    for (const raw of Object.values(RAW)) expect(bytes).not.toContain(raw);
    expect(bytes.replace(/[^0-9]/g, "")).not.toContain(RAW.phoneDigits);
  });

  it("leaves no message text in either file after the fan deletes it", async () => {
    const { ctx } = testCtx(db, () => outcome(approve()));
    const marker = "Saltwater Hymn on the ferry at dawn, unforgettable";
    const { token, view } = submitMessage(
      ctx,
      { name: "Bea", track: "Saltwater Hymn", message: marker, displayConsent: true, recapConsent: false },
      { screenNow: false },
    );
    await screenMessage(ctx, view.id);
    expect(diskBytes(file)).toContain(marker);

    fanDelete(ctx, token);
    expect(diskBytes(file)).not.toContain(marker);
    expect(diskBytes(file)).not.toContain("on the ferry");
  });
});
