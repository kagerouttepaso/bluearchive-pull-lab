import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectDir, "pages-dist");
const clientDir = path.join(projectDir, "dist", "client");
const workerUrl = pathToFileURL(path.join(projectDir, "dist", "server", "index.js"));
workerUrl.searchParams.set("pages-export", Date.now().toString());

const [owner = "example", repository = "bluearchive-pull-lab"] =
  (process.env.GITHUB_REPOSITORY ?? "example/bluearchive-pull-lab").split("/");
const basePath = `/${repository}/`;
const origin = `https://${owner}.github.io`;

const { default: worker } = await import(workerUrl.href);

async function renderRoute(route) {
  const response = await worker.fetch(
    new Request(`${origin}${route}`, {
      headers: {
        accept: "text/html",
        "x-forwarded-host": `${owner}.github.io`,
        "x-forwarded-proto": "https",
      },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  if (!response.ok) {
    throw new Error(`Static render failed for ${route} with status ${response.status}`);
  }

  let html = await response.text();
  html = html.replaceAll("/assets/", `${basePath}assets/`);
  for (const asset of ["favicon.svg", "file.svg", "globe.svg", "og.png", "window.svg"]) {
    html = html.replaceAll(`/${asset}`, `${basePath}${asset}`);
  }
  return html;
}

const [homeHtml, proposalHtml] = await Promise.all([
  renderRoute("/"),
  renderRoute("/proposal"),
]);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(clientDir, outputDir, { recursive: true });
await writeFile(path.join(outputDir, "index.html"), homeHtml, "utf8");
await writeFile(path.join(outputDir, "404.html"), homeHtml, "utf8");
await mkdir(path.join(outputDir, "proposal"), { recursive: true });
await writeFile(path.join(outputDir, "proposal", "index.html"), proposalHtml, "utf8");
await writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

console.log(`GitHub Pages export created at ${outputDir}`);
