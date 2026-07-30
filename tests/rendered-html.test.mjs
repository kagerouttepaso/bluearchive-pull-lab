import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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
  assert.doesNotMatch(html, /react-loading-skeleton/);
});
