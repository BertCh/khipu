import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import { getColors, getKhipuIndex, getSilhouettes } from "#/lib/khipu/data";
import type { KhipuSummary } from "#/lib/khipu/types";

type SortKey =
	| "id"
	| "museum"
	| "provenance"
	| "nPendants"
	| "nSubsidiaries"
	| "nKnots"
	| "nColors"
	| "maxLevel"
	| "primaryLength"
	| "totalValue";

const SORT_KEYS: SortKey[] = [
	"id",
	"museum",
	"provenance",
	"nPendants",
	"nSubsidiaries",
	"nKnots",
	"nColors",
	"maxLevel",
	"primaryLength",
	"totalValue",
];

interface Search {
	q?: string;
	museum?: string;
	sort?: SortKey;
	dir?: "asc" | "desc";
	page?: number;
}

const PAGE = 50;

export const Route = createFileRoute("/khipus/")({
	validateSearch: (raw: Record<string, unknown>): Search => ({
		q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
		museum:
			typeof raw.museum === "string" && raw.museum ? raw.museum : undefined,
		sort: SORT_KEYS.includes(raw.sort as SortKey)
			? (raw.sort as SortKey)
			: undefined,
		dir: raw.dir === "asc" || raw.dir === "desc" ? raw.dir : undefined,
		page: typeof raw.page === "number" && raw.page > 1 ? raw.page : undefined,
	}),
	loader: async () => {
		const [index, silhouettes, colors] = await Promise.all([
			getKhipuIndex(),
			getSilhouettes(),
			getColors(),
		]);
		return { index, silhouettes, colors };
	},
	component: Browse,
});

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
	{ key: "id", label: "Khipu" },
	{ key: "museum", label: "Museum" },
	{ key: "provenance", label: "Provenance" },
	{ key: "nPendants", label: "Pendants", num: true },
	{ key: "nSubsidiaries", label: "Subsidiaries", num: true },
	{ key: "nKnots", label: "Knots", num: true },
	{ key: "nColors", label: "Colours", num: true },
	{ key: "maxLevel", label: "Depth", num: true },
	{ key: "primaryLength", label: "Primary cm", num: true },
	{ key: "totalValue", label: "Sum of values", num: true },
];

function Browse() {
	const { index, silhouettes, colors } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/khipus/" });
	const sort = search.sort ?? "id";
	const dir = search.dir ?? (sort === "id" ? "asc" : "desc");
	const page = search.page ?? 1;

	const museums = useMemo(() => {
		const m = new Map<string, number>();
		for (const k of index)
			m.set(k.museum ?? "Unknown", (m.get(k.museum ?? "Unknown") ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	}, [index]);

	const rows = useMemo(() => {
		const q = search.q?.trim().toLowerCase();
		let out = index;
		if (q) {
			out = out.filter((k) =>
				[k.id, ...k.aliases, k.museum ?? "", k.provenance ?? "", k.region ?? ""]
					.join(" ")
					.toLowerCase()
					.includes(q),
			);
		}
		if (search.museum)
			out = out.filter((k) => (k.museum ?? "Unknown") === search.museum);
		const sign = dir === "asc" ? 1 : -1;
		return [...out].sort((a, b) => sign * compare(a[sort], b[sort]));
	}, [index, search.q, search.museum, sort, dir]);

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
				: key === "id" || key === "museum" || key === "provenance"
					? "asc"
					: "desc";
		update({ sort: key, dir: nextDir });
	};

	return (
		<main className="page-wrap-wide">
			<h1 className="page-title">Browse</h1>
			<p className="lede">
				Every khipu in the corpus. Search by KH number, alias, museum or site;
				sort any column; open a khipu to read it cord by cord.
			</p>

			<div className="filters">
				<input
					type="search"
					placeholder="Search KH0279, UR049, Pachacamac, Larco…"
					value={search.q ?? ""}
					onChange={(e) => update({ q: e.target.value || undefined })}
					aria-label="Search khipus"
				/>
				<select
					value={search.museum ?? ""}
					onChange={(e) => update({ museum: e.target.value || undefined })}
					aria-label="Filter by museum"
				>
					<option value="">All museums</option>
					{museums.map(([name, n]) => (
						<option key={name} value={name}>
							{name} ({n})
						</option>
					))}
				</select>
				<span className="count">
					{rows.length.toLocaleString()} of {index.length.toLocaleString()}{" "}
					khipus
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
							<th>Pendants, to scale</th>
						</tr>
					</thead>
					<tbody>
						{slice.map((k) => {
							const s = silhouettes[k.id];
							return (
								<tr key={k.id}>
									<td>
										<Link to="/khipus/$id" params={{ id: k.id }}>
											{k.id}
										</Link>
										{k.aliases.length > 0 && (
											<span
												style={{ color: "var(--ink-3)", marginLeft: "0.5em" }}
											>
												{k.aliases.join(", ")}
											</span>
										)}
									</td>
									<td className="cell-muted" title={k.museum ?? undefined}>
										{k.museum ?? "—"}
									</td>
									<td className="cell-muted" title={k.provenance ?? undefined}>
										{k.provenance ?? "—"}
									</td>
									<td className="num">{k.nPendants}</td>
									<td className="num">{k.nSubsidiaries}</td>
									<td className="num">{k.nKnots.toLocaleString()}</td>
									<td className="num">{k.nColors}</td>
									<td className="num">{k.maxLevel}</td>
									<td className="num">{k.primaryLength ?? "—"}</td>
									<td className="num">{k.totalValue.toLocaleString()}</td>
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
									colSpan={COLUMNS.length + 1}
									style={{ color: "var(--ink-3)" }}
								>
									No khipus match. Try a shorter search, or clear the museum
									filter.
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
		</main>
	);
}

function compare(a: KhipuSummary[SortKey], b: KhipuSummary[SortKey]): number {
	if (a == null && b == null) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b));
}
