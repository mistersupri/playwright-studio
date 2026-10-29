import { describe, expect, it } from "vitest";
import { cronNext } from "../src/schedules/schedules.service.js";

describe("cronNext", () => {
  it("lists upcoming weekday runs in the given time zone", () => {
    // Friday 2026-10-30 12:00 UTC is 19:00 in Jakarta.
    const from = new Date("2026-10-30T12:00:00Z");
    const runs = cronNext("0 8 * * 1-5", "Asia/Jakarta", 3, from);
    // The next 08:00 weekdays in Jakarta are Mon, Tue, Wed = 01:00 UTC.
    expect(runs.map((d) => d.toISOString())).toEqual([
      "2026-11-02T01:00:00.000Z",
      "2026-11-03T01:00:00.000Z",
      "2026-11-04T01:00:00.000Z",
    ]);
  });

  it("explains an invalid expression", () => {
    expect(() => cronNext("61 * * * *", "UTC")).toThrow(/not valid/);
  });
});
