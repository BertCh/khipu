/**
 * Check src/lib/khipu/fieldmarks.ts against the Khipu Field Guide's own
 * coloured-pendant-sum pages, cord for cord.
 *
 *   node --experimental-strip-types scripts/check_sums.mts KH0008 KH0082 …
 *
 * Each page (notebook/fieldmarks/colored_pendant_sum/html/KHxxxx.html) is
 * fetched once and cached in data/kfg/fieldmarks/. The KFG names cords by
 * group (g3p2); we name them p10, so both sides are compared in the KFG's
 * naming. Exit status is non-zero on any mismatch.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { groupName, pendantSums } from "../src/lib/khipu/fieldmarks.ts";
import type { Cord, Khipu } from "../src/lib/khipu/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, "data", "kfg", "fieldmarks");
const BASE =
	"https://www.khipufieldguide.com/notebook/fieldmarks/colored_pendant_sum/html";

const DEFAULT_IDS = [
	"KH0001",
	"KH0008",
	"KH0033",
	"KH0034",
	"KH0082",
	"KH0097",
	"KH0143",
	"KH0240",
	"KH0279",
	"KH0323",
	"KH0349",
	"KH0405",
	"KH0503",
	"KH0590",
	"KH0698",
];

type Table = Record<"R" | "L", Record<string, string[]>>;

async function kfgPage(id: string): Promise<string> {
	mkdirSync(cache, { recursive: true });
	const file = join(cache, `${id}.html`);
	if (existsSync(file)) return readFileSync(file, "utf8");
	const res = await fetch(`${BASE}/${id}.html`);
	if (!res.ok) throw new Error(`${id}: KFG page ${res.status}`);
	const html = await res.text();
	writeFileSync(file, html);
	return html;
}

/** The two "Sum Detail" tables: sum cord → summand cords, by hand. */
function parseTables(html: string): Table {
	const clean = html
		.replace(/<script[\s\S]*?<\/script>/g, "")
		.replace(/<style[\s\S]*?<\/style>/g, "");
	const out: Table = { R: {}, L: {} };
	for (const [hand, anchor] of [
		["R", "RIGHT_HANDED_DETAIL"],
		["L", "LEFT_HANDED_DETAIL"],
	] as const) {
		const at = clean.indexOf(`id="${anchor}"`);
		if (at < 0) continue;
		const table = clean.slice(at).match(/<table[\s\S]*?<\/table>/);
		if (!table) continue;
		for (const row of (table[0].match(/<tr[\s\S]*?<\/tr>/g) ?? []).slice(1)) {
			const cells = (row.match(/<td[\s\S]*?<\/td>/g) ?? []).map((c) =>
				c
					.replace(/<[^>]+>/g, " ")
					.replace(/&amp;/g, "&")
					.replace(/\s+/g, " ")
					.trim(),
			);
			if (cells.length < 7) continue;
			const sum = cells[3].split(":")[0].trim();
			out[hand][sum] = cells[6].split("+").map((x) => x.split(":")[0].trim());
		}
	}
	return out;
}

let failed = false;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
for (const id of ids) {
	const khipu: Khipu = JSON.parse(
		readFileSync(join(root, "public", "data", "khipus", `${id}.json`), "utf8"),
	);
	const byName = new Map<string, Cord>(khipu.cords.map((c) => [c.name, c]));
	const gname = (n: string) => groupName(byName.get(n) as Cord, khipu.groups);
	const kfg = parseTables(await kfgPage(id));
	const sums = pendantSums(khipu);
	for (const hand of ["R", "L"] as const) {
		const ours: Record<string, string[]> = {};
		for (const s of sums.filter((s) => s.hand === hand))
			ours[gname(s.sum)] = s.summands.map(gname);
		const theirs = kfg[hand];
		const missing = Object.keys(theirs).filter((k) => !ours[k]);
		const extra = Object.keys(ours).filter((k) => !theirs[k]);
		const differ = Object.keys(theirs).filter(
			(k) => ours[k] && ours[k].join() !== theirs[k].join(),
		);
		const ok = !missing.length && !extra.length && !differ.length;
		if (!ok) failed = true;
		console.log(
			`${id} ${hand}  KFG ${Object.keys(theirs).length}  ours ${Object.keys(ours).length}  ${ok ? "ok" : "MISMATCH"}`,
			ok ? "" : { missing, extra, differ },
		);
	}
}
process.exit(failed ? 1 : 0);
