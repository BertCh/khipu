import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Static single-page build: `vite build` writes a self-contained `dist/`
 * (index.html + hashed assets + public/data) that any static file host can
 * serve. There is no server; route loaders fetch the JSON in public/data.
 *
 * Deep links (/khipus/KH0279) need the host to serve index.html for unknown
 * paths. GitHub Pages does that via 404.html, so we emit a copy; other hosts
 * want a rewrite rule (see README).
 *
 * To host under a sub-path (e.g. https://user.github.io/khipu/), build with
 * BASE_PATH=/khipu/ — the router and data fetches follow import.meta.env.BASE_URL.
 */
const base = process.env.BASE_PATH ?? "/";

function spaFallback(): Plugin {
	let outDir = "dist";
	return {
		name: "khipu:spa-fallback",
		apply: "build",
		configResolved(config) {
			outDir = config.build.outDir;
		},
		async closeBundle() {
			await copyFile(join(outDir, "index.html"), join(outDir, "404.html"));
		},
	};
}

export default defineConfig({
	base,
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
		tailwindcss(),
		spaFallback(),
	],
});
