import { canonicalizeArgs } from "../canon.js";

test("sorts object keys", () => {
  const a = { z: 1, a: 2, m: 3 };
  const b = { a: 2, m: 3, z: 1 };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("normalizes dotslash path", () => {
  const a = { path: "./src/main.rs" };
  const b = { path: "src/main.rs" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("normalizes double slash", () => {
  const a = { file: "src//lib.rs" };
  const b = { file: "src/lib.rs" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("collapses whitespace", () => {
  const a = { query: "  hello   world  " };
  const b = { query: "hello world" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("does not normalize urls", () => {
  const a = { url: "https://example.com/api/v1" };
  expect(canonicalizeArgs(a)).toContain("https://example.com/api/v1");
});

test("nested objects sorted", () => {
  const a = { outer: { z: 1, a: 2 }, b: true };
  const b = { b: true, outer: { a: 2, z: 1 } };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("parent dir resolution", () => {
  const a = { p: "./foo/../bar" };
  const b = { p: "bar" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("arrays preserved in order", () => {
  const a = { items: [3, 1, 2] };
  const b = { items: [3, 1, 2] };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});
