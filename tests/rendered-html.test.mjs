import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the gacha comparison calculator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ブルアカ募集期待値ラボ/);
  assert.match(html, /その石で/);
  assert.match(html, /青輝石消費/);
  assert.match(html, /目標2人のうち、何人そろう/);
  assert.match(html, /PUは合計何回手に入る/);
  assert.match(html, /予算を使い切ると、PUは平均何回手に入る/);
  assert.match(html, /目標の2人が全員そろう確率/);
  assert.doesNotMatch(html, /目標PU確保人数の期待値/);
  assert.doesNotMatch(html, /異なるPU確保数/);
  assert.match(html, /ウィニングランは、どこから始まる/);
  assert.match(html, /数字では新仕様がお得/);
  assert.match(html, /旧仕様の方が安心できて/);
  assert.match(html, /期待値は下振れを考慮していない/);
  const rateColumn = html.indexOf("全員そろう確率」と「期待値」は、答えている問いが違う");
  const winningColumn = html.indexOf("ウィニングランは、気持ちいい");
  const feelingColumn = html.indexOf("数字では新仕様がお得");
  assert.ok(rateColumn >= 0 && rateColumn < winningColumn && winningColumn < feelingColumn);
  assert.match(html, /THREE COLUMNS/);
  assert.match(html, /計算前提/);
  assert.match(html, /もっと、みんなが幸せになれる募集/);
  assert.match(html, /\.\/proposal\//);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("renders the happier alternative proposal", async () => {
  const response = await render("/proposal");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /みんなが幸せになれる/);
  assert.match(html, /★3確定＋80スタンプ/);
  assert.match(html, /現行 84\.01%/);
  assert.match(html, /提案 83\.95%/);
  assert.match(html, /資産と救済を、別の仕組みにする/);
  assert.match(html, /予算を増やしたとき、全員確保率はどう推移するか/);
  assert.match(html, /PU総獲得回数の期待値と標準偏差/);
  assert.match(html, /全員確保までの平均コストと、個人差は近いか/);
  assert.match(html, /確率的な整合性は高い/);
  assert.match(html, /2\.51/);
  assert.match(html, /304\.4/);
  assert.match(html, /108\.1/);
  assert.match(html, /新旧仕様の確率計算へ戻る/);
});

test("page anchors release manual scrolling immediately", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /^html \{ scroll-behavior: auto; \}$/m);
  assert.doesNotMatch(css, /scroll-behavior: smooth/);
});
