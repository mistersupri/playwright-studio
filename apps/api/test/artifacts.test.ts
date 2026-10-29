import { describe, expect, it } from "vitest";
import { kindFor, mimeFor, safeFileName } from "../src/artifacts/artifacts.service.js";

describe("artifact names", () => {
  it("sorts files into kinds", () => {
    expect(kindFor("shot.PNG")).toBe("screenshot");
    expect(kindFor("report.pdf")).toBe("pdf");
    expect(kindFor("rows.csv")).toBe("excel");
    expect(kindFor("session.webm")).toBe("video");
    expect(kindFor("trace.zip")).toBe("trace");
    expect(kindFor("trace-row-2.zip")).toBe("trace");
    expect(kindFor("backup.zip")).toBe("file");
    expect(kindFor("data.json")).toBe("file");
  });

  it("strips paths and unsafe characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("a<b>:c?.txt")).toBe("a_b__c_.txt");
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("x".repeat(300))).toHaveLength(160);
  });

  it("guesses MIME types", () => {
    expect(mimeFor("a.png")).toBe("image/png");
    expect(mimeFor("a.unknown")).toBe("application/octet-stream");
  });
});
