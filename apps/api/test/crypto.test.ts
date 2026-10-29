import { describe, expect, it } from "vitest";
import { decryptBuffer, decryptJson, decryptText, encryptBuffer, encryptJson, encryptText } from "../src/common/crypto.js";

describe("crypto", () => {
  it("round-trips text with a fresh IV each time", () => {
    const a = encryptText("héllo wörld");
    const b = encryptText("héllo wörld");
    expect(a).not.toBe(b);
    expect(decryptText(a)).toBe("héllo wörld");
  });

  it("round-trips JSON and buffers", () => {
    expect(decryptJson(encryptJson({ n: 1, list: ["x"] }))).toEqual({ n: 1, list: ["x"] });
    const buf = Buffer.from([0, 1, 2, 250, 255]);
    expect(decryptBuffer(encryptBuffer(buf)).equals(buf)).toBe(true);
  });

  it("rejects tampered ciphertext", () => {
    const raw = Buffer.from(encryptText("secret"), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptText(raw.toString("base64"))).toThrow();
  });
});
