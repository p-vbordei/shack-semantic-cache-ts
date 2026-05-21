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

test("array order matters", () => {
  // Arrays are not sorted — different orders must not collide.
  const a = { items: [1, 2, 3] };
  const b = { items: [3, 2, 1] };
  expect(canonicalizeArgs(a)).not.toBe(canonicalizeArgs(b));
});

test("http url not path normalized", () => {
  const val = { endpoint: "http://localhost:8080/api" };
  expect(canonicalizeArgs(val)).toContain("http://localhost:8080/api");
});

test("triple leading slash collapsed", () => {
  const a = { path: "a///b" };
  const b = { path: "a/b" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("whitespace-only string becomes empty", () => {
  const a = { q: "   " };
  const b = { q: "" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("non-string scalars unchanged", () => {
  const val = { n: 42, b: false, x: null };
  const canon = canonicalizeArgs(val);
  expect(canon).toContain("42");
  expect(canon).toContain("false");
  expect(canon).toContain("null");
});

test("deeply nested keys sorted", () => {
  const a = { a: { b: { z: 1, a: 2 } } };
  const b = { a: { b: { a: 2, z: 1 } } };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("absolute path preserved", () => {
  const a = { file: "/etc/hosts" };
  const b = { file: "/etc/hosts" };
  expect(canonicalizeArgs(a)).toBe(canonicalizeArgs(b));
});

test("empty object canonicalizes to {}", () => {
  expect(canonicalizeArgs({})).toBe("{}");
});
