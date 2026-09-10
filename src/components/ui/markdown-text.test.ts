import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownText } from "./markdown-text";

test("markdown links cannot inject event attributes", () => {
  const html = renderToStaticMarkup(createElement(MarkdownText, { text: '[click](https://example.com"onmouseover="window.pwned=1)' }));
  assert.doesNotMatch(html, /"onmouseover="/);
  assert.doesNotMatch(html, /<script/);
});

test("lightweight markdown retains formatting and escapes raw HTML", () => {
  const html = renderToStaticMarkup(createElement(MarkdownText, { text: "**bold** _italic_ ~~gone~~\n- item\n1. numbered\n<script>alert(1)</script>" }));
  for (const expected of ["<strong>bold</strong>", "<em>italic</em>", "<del>gone</del>", "<li>item</li>", "&lt;script&gt;"]) assert.ok(html.includes(expected));
});
