import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { StatTile } from "#/components/charts/Figure";
import { CityKey, MetroTip, Verdict } from "#/components/cities/CityBits";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import {
	getCityIndex,
	getCitySilhouettes,
	getNationKhipu,
} from "#/lib/cities/data";
import type { MetroSummary, Quadrant } from "#/lib/cities/types";
import {
	fmtCompact,
	fmtUsd,
	fmtWhole,
	QUADRANT,
	QUADRANT_ORDER,
} from "#/lib/cities/vocab";
import { getCodes, getColors } from "#/lib/khipu/data";
import type { CordNode } from "#/lib/khipu/layout";

type SortKey =
	| "displayName"
	| "state"
	| "division"
	| "population"
	| "wage"
	| "nPlaces"
	| "nCords"
	| "nKnots"
	| "residentWorkers"
	| "jobs";

const SORT_KEYS: SortKey[] = [
	"displayName",
	"state",
	"division",
	"population",
	"wage",
	"nPlaces",
	"nCords",
	"nKnots",
	"residentWorkers",
	"jobs",
];
const TEXT_KEYS = new Set<SortKey>(["displayName", "state", "division"]);

interface Search {
	q?: string;
	verdict?: Quadrant;
	division?: string;
	sort?: SortKey;
	dir?: "asc" | "desc";
	page?: number;
}

const PAGE = 50;

export const Route = createFileRoute("/cities/")({
	validateSearch: (raw: Record<string, unknown>): Search => ({
		q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
		verdict: (QUADRANT_ORDER as string[]).includes(raw.verdict as string)
			? (raw.verdict as Quadrant)
			: undefined,
		division:
			typeof raw.division === "string" && raw.division
				? raw.division
				: undefined,
		sort: SORT_KEYS.includes(raw.sort as SortKey)
			? (raw.sort as SortKey)
			: undefined,
		dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : undefined,
		page: typeof raw.page === "number" && raw.page > 1 ? raw.page : undefined,
	}),
	loader: async () => {
		const [index, silhouettes, nation, colors, codes] = await Promise.all([
			getCityIndex(),
			getCitySilhouettes(),
			getNationKhipu(),
			getColors(),
			getCodes(),
		]);
		return { index, silhouettes, nation, colors, codes };
	},
	head: () => ({ meta: [{ title: "Cities — Khipu" }] }),
	component: Cities,
});

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
	{ key: "displayName", label: "Metro" },
	{ key: "division", label: "Division" },
	{ key: "population", label: "Population", num: true },
	{ key: "wage", label: "Mean wage", num: true },
	{ key: "nPlaces", label: "Places", num: true },
	{ key: "residentWorkers", label: "Resident workers", num: true },
	{ key: "jobs", label: "Jobs", num: true },
	{ key: "nCords", label: "Cords", num: true },
	{ key: "nKnots", label: "Knots", num: true },
];

// the metros' names hang below their cords as rotated text
const NATION_LAYOUT = { slot: 9, pxPerCm: 2.4, gap: 16, padBottom: 120 };

function Cities() {
	const { index, silhouettes, nation, colors, codes } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/cities/" });
	const enc = index.encoding;
	const sort = search.sort ?? "population";
	const dir = search.dir ?? (TEXT_KEYS.has(sort) ? "asc" : "desc");
	const page = search.page ?? 1;

	const rows = useMemo(() => {
		const q = search.q?.trim().toLowerCase();
		let out = index.metros;
		if (q)
			out = out.filter((m) =>
				[m.displayName, m.states.join(" "), m.division ?? ""]
					.join(" ")
					.toLowerCase()
					.includes(q),
			);
		if (search.verdict) out = out.filter((m) => m.quadrant === search.verdict);
		if (search.division)
			out = out.filter((m) => m.division === search.division);
		const sign = dir === "asc" ? 1 : -1;
		return [...out].sort((a, b) => sign * compare(a[sort], b[sort]));
	}, [index.metros, search.q, search.verdict, search.division, sort, dir]);

	const pages = Math.max(1, Math.ceil(rows.length / PAGE));
	const slice = rows.slice((page - 1) * PAGE, page * PAGE);

	const update = (patch: Partial<Search>) =>
		navigate({
			search: (prev) => ({ ...prev, page: undefined, ...patch }),
			replace: true,
		});

	const setSort = (key: SortKey) => {
		const nextDir: Search["dir"] =
			sort === key
				? dir === "asc"
					? "desc"
					: "asc"
				: TEXT_KEYS.has(key)
					? "asc"
					: "desc";
		update({ sort: key, dir: nextDir });
	};

	// the national khipu: hover names a metro, a click opens it
	const nationTip = useCallback(
		(node: CordNode) => {
			const m = nation.places[node.cord.name];
			return m ? <MetroTip metro={m} enc={enc} colors={colors} /> : null;
		},
		[nation, enc, colors],
	);
	const openMetro = (name: string | null) => {
		const m = name ? nation.places[name] : null;
		if (m) navigate({ to: "/cities/$slug", params: { slug: m.slug } });
	};
	const verdictCounts = useMemo(() => {
		const c = new Map<Quadrant, number>();
		for (const m of index.metros)
			if (m.quadrant) c.set(m.quadrant, (c.get(m.quadrant) ?? 0) + 1);
		return c;
	}, [index.metros]);

	return (
		<main className="page-wrap-wide">
			<h1 className="page-title">Cities, as khipus</h1>
			<p className="lede">
				An illustration, not an Inka record or a decipherment: modern US data
				from the Growth Lab's Cities Tool, knotted using the decimal convention
				read from many surviving khipus. There is one khipu for each of the{" "}
				{fmtWhole(index.nation.nMetros)} metros, with a pendant for each of its{" "}
				{fmtWhole(index.nation.nPlaces)} cities and towns; one for the country,
				with a pendant per metro; and one for each place, with a group per year
				the atlas covers.
			</p>

			<div className="stats">
				<StatTile
					label="metro khipus"
					value={index.nation.nMetros}
					hint="plus one for the country"
				/>
				<StatTile
					label="places on pendants"
					value={index.nation.nPlaces}
					hint="cities, towns and CDPs, each with a khipu of its own"
				/>
				<StatTile
					label="cords"
					value={index.nation.nCords}
					hint="on the metro and national khipus"
				/>
				<StatTile
					label="knots"
					value={index.nation.nKnots}
					hint={`${fmtCompact(index.nation.population)} people counted`}
				/>
				<StatTile
					label="window"
					value={`${index.source.window.start}–${index.source.window.end}`}
					hint="period for the growth rates"
				/>
			</div>

			<section className="section">
				<h2>The country</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					One pendant per metro, its population in knots, grouped by census
					division and ordered by size within it. Colour is the Cities Tool's
					verdict: Magnet (population and wages both growing faster than the
					median), Fortress (wages faster, population slower), Sponge
					(population faster, wages slower), Leak (both slower). Hover a cord
					for its name; click to open the metro's khipu.
				</p>
				<div className="story-legend" style={{ marginBottom: "0.75rem" }}>
					{QUADRANT_ORDER.map((q) => (
						<span key={q}>
							<Verdict quadrant={q} enc={enc} colors={colors} />
							<span style={{ color: "var(--ink-3)" }}>
								{verdictCounts.get(q) ?? 0}
							</span>
						</span>
					))}
					<span>
						<Verdict quadrant={null} enc={enc} colors={colors} />
					</span>
				</div>
				<KhipuDiagram
					khipu={nation}
					colors={colors}
					codes={codes}
					layout={NATION_LAYOUT}
					groupLabel={(g) => nation.city.divisions[String(g.index)] ?? null}
					renderTooltip={nationTip}
					onSelect={openMetro}
					label={(c) =>
						c.kind === "pendant" ? (nation.places[c.name]?.name ?? null) : null
					}
					showValues={false}
				/>
			</section>

			<section className="section">
				<h2>The metros</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Each metro's khipu as a thumbnail to scale: one line per place in its
					verdict's colour, its length set by the residents' mean wage. Search
					by name or state, filter by verdict or division, sort any column.
				</p>
				<div className="filters">
					<input
						type="search"
						placeholder="Search Boston, TX, Pacific…"
						value={search.q ?? ""}
						onChange={(e) => update({ q: e.target.value || undefined })}
						aria-label="Search metros"
					/>
					<select
						value={search.verdict ?? ""}
						onChange={(e) =>
							update({
								verdict: (e.target.value || undefined) as Quadrant | undefined,
							})
						}
						aria-label="Filter by verdict"
					>
						<option value="">All verdicts</option>
						{QUADRANT_ORDER.map((q) => (
							<option key={q} value={q}>
								{QUADRANT[q].noun} ({verdictCounts.get(q) ?? 0})
							</option>
						))}
					</select>
					<select
						value={search.division ?? ""}
						onChange={(e) => update({ division: e.target.value || undefined })}
						aria-label="Filter by census division"
					>
						<option value="">All divisions</option>
						{index.nation.divisions.map((d) => (
							<option key={d} value={d}>
								{d}
							</option>
						))}
					</select>
					<span className="count">
						{rows.length.toLocaleString()} of {index.metros.length} metros
					</span>
				</div>

				<div className="table-wrap">
					<table className="data-table">
						<thead>
							<tr>
								{COLUMNS.map((c) => (
									<th
										key={c.key}
										className={c.num ? "num" : undefined}
										aria-sort={
											sort === c.key
												? dir === "asc"
													? "ascending"
													: "descending"
												: undefined
										}
									>
										<button type="button" onClick={() => setSort(c.key)}>
											{c.label}
										</button>
									</th>
								))}
								<th>Verdict</th>
								<th>Pendants, to scale</th>
							</tr>
						</thead>
						<tbody>
							{slice.map((m) => {
								const s = silhouettes[m.slug];
								return (
									<tr key={m.slug}>
										<td>
											<Link to="/cities/$slug" params={{ slug: m.slug }}>
												{m.displayName}
											</Link>
											{m.states.length > 1 && (
												<span
													style={{ color: "var(--ink-3)", marginLeft: "0.5em" }}
												>
													{m.states.join("–")}
												</span>
											)}
										</td>
										<td className="cell-muted">{m.division ?? "—"}</td>
										<td className="num">{fmtWhole(m.population)}</td>
										<td className="num">{fmtUsd(m.wage)}</td>
										<td className="num">
											{m.nPlaces}
											<span style={{ color: "var(--ink-3)" }}>
												{" "}
												/ {m.nIncorporated}
											</span>
										</td>
										<td className="num">{fmtWhole(m.residentWorkers)}</td>
										<td className="num">{fmtWhole(m.jobs)}</td>
										<td className="num">{fmtWhole(m.nCords)}</td>
										<td className="num">{fmtWhole(m.nKnots)}</td>
										<td>
											<Verdict
												quadrant={m.quadrant}
												borderline={m.borderline}
												enc={enc}
												colors={colors}
											/>
										</td>
										<td>
											{s && (
												<KhipuSilhouette
													cords={s.l.map((l, i) => ({
														length: l,
														color: s.c[i],
													}))}
													colors={colors}
												/>
											)}
										</td>
									</tr>
								);
							})}
							{slice.length === 0 && (
								<tr>
									<td
										colSpan={COLUMNS.length + 2}
										style={{ color: "var(--ink-3)" }}
									>
										No metros match. Try a shorter search, or clear a filter.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>

				{pages > 1 && (
					<div className="pager">
						<button
							type="button"
							className="btn"
							disabled={page <= 1}
							onClick={() =>
								navigate({
									search: (p) => ({
										...p,
										page: page - 1 > 1 ? page - 1 : undefined,
									}),
								})
							}
						>
							Previous
						</button>
						<span>
							Page {page} of {pages}
						</span>
						<button
							type="button"
							className="btn"
							disabled={page >= pages}
							onClick={() =>
								navigate({ search: (p) => ({ ...p, page: page + 1 }) })
							}
						>
							Next
						</button>
					</div>
				)}
			</section>

			<section className="section">
				<h2>How to read one</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					The knot convention follows the decimal reading of the recorded
					khipus, so the counts can be read the same way. The colours, cord
					roles and groupings are this project's choices, not Inka ones. All
					numbers come from the Cities Tool.
				</p>
				<CityKey enc={enc} colors={colors} scope="metro" />
				<p
					className="prose"
					style={{ marginTop: "1rem", color: "var(--ink-2)" }}
				>
					Data: the Growth Lab Cities Tool atlas, built{" "}
					{index.source.generatedAt.slice(0, 10)}; the diagnosis compares each
					place's population and wage growth over {index.source.window.start}–
					{index.source.window.end} with the all-metro medians. The knot
					convention follows the Aschers' reading of the corpus;{" "}
					<Link to="/stories">the stories</Link> discuss where it does and does
					not hold on real khipus.
				</p>
			</section>
		</main>
	);
}

function compare(a: MetroSummary[SortKey], b: MetroSummary[SortKey]): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b));
}
