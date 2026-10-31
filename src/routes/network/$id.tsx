import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { StatTile } from "#/components/charts/Figure";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import IslandFlow from "#/components/story/IslandFlow";
import IslandShelf, {
	ShelfIndex,
	shelfRows,
} from "#/components/story/IslandShelf";
import { Conf } from "#/components/story/Story";
import {
	getColors,
	getKhipuIndex,
	getKhipus,
	getSilhouettes,
	readJson,
	type Silhouettes,
} from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import {
	buildGraph,
	type GraphLink,
	type GraphNode,
	islandLabel,
	islandMuseums,
	type KhipuSet,
	KIND_LABEL,
	type LinkKind,
	type PriorWork,
	type ScanFile,
	STORY_TITLE,
	shortMuseum,
} from "#/lib/stories/links";
import { getStrands, matchedThreads } from "#/lib/stories/strands";
import "#/styles/network.css";

/** the same three switches as the map, carried in the URL so a link to an island reproduces it */
export interface IslandSearch {
	run?: 5 | 4;
	places?: true;
	accessions?: true;
}

/** values are fetched for the ribbons only when the island is small enough to read */
const VALUES_UP_TO = 16;

const KINDS: LinkKind[] = ["account", "derived", "object", "passage"];

export const Route = createFileRoute("/network/$id")({
	validateSearch: (raw: Record<string, unknown>): IslandSearch => ({
		run: raw.run === 5 || raw.run === 4 ? raw.run : undefined,
		places: raw.places === true ? true : undefined,
		accessions: raw.accessions === true ? true : undefined,
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ params, deps }) => {
		const id = params.id.toUpperCase();
		const [index, silhouettes, colors, scan, strands] = await Promise.all([
			getKhipuIndex(),
			getSilhouettes(),
			getColors(),
			readJson<ScanFile>("stories/links.json"),
			getStrands(),
		]);
		const graph = buildGraph(index, scan, {
			minRun: deps.run ?? 6,
			places: deps.places ?? false,
			accessions: deps.accessions ?? false,
		});
		const island = graph.islands.find((g) => g.nodes.some((n) => n.id === id));
		if (!island) throw notFound();
		const rows = shelfRows(island, strands);
		let values: Record<string, number[]> | undefined;
		if (rows.length <= VALUES_UP_TO) {
			const khipus = await getKhipus(rows.map((r) => r.id));
			values = {};
			for (const [kid, k] of Object.entries(khipus))
				values[kid] = k.cords
					.filter((c) => c.level === 1)
					.sort((x, y) => x.ordinal - y.ordinal)
					.map((c) => c.value ?? 0);
		}
		return {
			id,
			island,
			rows,
			values,
			strands,
			silhouettes,
			colors,
			total: index.length,
		};
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${islandLabel(loaderData.island)} — Network — Khipu`
					: "Network — Khipu",
			},
		],
	}),
	notFoundComponent: () => (
		<main className="page-wrap">
			<h1 className="page-title">Not on the map</h1>
			<p className="lede">
				No khipu with that id is linked to another under these settings.{" "}
				<Link to="/network">Back to the map</Link>.
			</p>
		</main>
	),
	component: IslandPage,
});

function IslandPage() {
	const { id, island, rows, values, strands, silhouettes, colors, total } =
		Route.useLoaderData();
	const search = Route.useSearch();
	const [selected, setSelected] = useState<string | null>(null);
	const label = islandLabel(island);
	const museums = islandMuseums(island);
	const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
	const rest = island.nodes.filter((n) => !rowIds.has(n.id));
	const counts = useMemo(() => {
		const c = { account: 0, derived: 0, object: 0, passage: 0 };
		for (const l of island.links) c[l.kind]++;
		return c;
	}, [island]);
	// cords threaded to a partner: the strand file where it covers a link,
	// else the scan's run values
	const matchedCords = island.links.reduce((s, l) => {
		const sl = strands?.links[l.id];
		return (
			s +
			(sl?.threads.length ? matchedThreads(sl).length : (l.scan?.values ?? 0))
		);
	}, 0);
	const opts = [
		search.run ? `runs of ${search.run} or more` : "runs of six or more",
		search.places ? "find-spots on" : null,
		search.accessions ? "museum numbers on" : null,
	]
		.filter(Boolean)
		.join(", ");

	return (
		<main className="page-wrap-wide network-page island-page">
			<div className="page-wrap">
				<p className="crumbs">
					<Link to="/network" search={search}>
						← Linked khipus
					</Link>
				</p>
				<h1 className="page-title">{label}</h1>
				<p className="lede">
					{island.nodes.length === 2
						? "Two khipus"
						: `${island.nodes.length} khipus`}{" "}
					tied to each other by {island.links.length}{" "}
					{island.links.length === 1 ? "link" : "links"}. The diagram shows
					which khipu restates which. Below, each khipu is drawn cord by cord,
					with each matched cord joined to its partner: a fan where several
					cords sum to one, a band where a run of values is shared, a line down
					the gutter where the values alone cannot place the link. Settings:{" "}
					{opts}.
				</p>
				<div className="stats network-stats">
					<StatTile
						label="khipus"
						value={island.nodes.length}
						hint={`of ${total} in the corpus`}
					/>
					<StatTile
						label="links"
						value={island.links.length}
						hint={`${counts.account} same account, ${counts.derived} derived, ${counts.object} same object, ${counts.passage} unexamined`}
					/>
					<StatTile
						label="matched cords"
						value={matchedCords}
						hint="each threaded to its partner on the shelf"
					/>
					<StatTile
						label="institutions"
						value={museums.length}
						hint={
							museums.length > 3
								? `${museums.slice(0, 3).join(", ")} and ${museums.length - 3} more`
								: museums.join(", ")
						}
					/>
				</div>
			</div>

			<section className="section page-wrap island-flow-section">
				<h2>How they connect</h2>
				<IslandFlow
					island={island}
					silhouettes={silhouettes}
					colors={colors}
					selected={selected}
					onSelect={setSelected}
					current={id}
				/>
			</section>

			<div className="island-about page-wrap">
				<div className="island-sets">
					{island.sets.length > 0 && <h2>Found together</h2>}
					{island.sets.length > 6 ? (
						<details className="island-index">
							<summary>
								{island.sets.length} find-spots and museum numbers on this
								island
							</summary>
							<SetNotes sets={island.sets} />
						</details>
					) : (
						<SetNotes sets={island.sets} />
					)}
					{island.story && STORY_TITLE[island.story] && (
						<Link to={island.story} className="network-story-link">
							Read: {STORY_TITLE[island.story]}
						</Link>
					)}
					<details className="island-index">
						<summary>The {rows.length} khipus on the shelf, in order</summary>
						<ShelfIndex
							rows={rows}
							selected={selected}
							onSelect={setSelected}
						/>
					</details>
				</div>
			</div>

			<section className="island-shelf-section">
				<IslandShelf
					island={island}
					rows={rows}
					silhouettes={silhouettes}
					colors={colors}
					values={values}
					strands={strands}
					selected={selected}
					onSelect={setSelected}
				/>
			</section>

			{rest.length > 0 && (
				<section className="section page-wrap">
					<h2>Also found here</h2>
					<p className="prose">
						{rest.length} more khipus share this island's find-spot, excavation
						or museum number without a link of their own to any khipu on the
						shelf.
					</p>
					<RestStrip nodes={rest} silhouettes={silhouettes} colors={colors} />
				</section>
			)}

			<section className="section page-wrap">
				<h2>Each link</h2>
				<ul className="network-link-list island-links">
					{[...island.links]
						.sort(
							(x, y) =>
								KINDS.indexOf(x.kind) - KINDS.indexOf(y.kind) ||
								(y.scan?.values ?? 0) - (x.scan?.values ?? 0),
						)
						.map((l) => (
							<LinkRow
								key={l.id}
								link={l}
								nodes={island.nodes}
								values={values}
								selected={selected === l.id}
								onSelect={setSelected}
							/>
						))}
				</ul>
			</section>

			<p className="page-wrap cell-muted island-foot">
				Opened from {id}.{" "}
				<Link to="/network" search={search}>
					Back to the map
				</Link>{" "}
				to change which links are drawn.
			</p>
		</main>
	);
}

function SetNotes({ sets }: { sets: KhipuSet[] }) {
	return (
		<>
			{sets.map((s) => (
				<p className={`network-set-note network-set-note-${s.kind}`} key={s.id}>
					<b>{s.label}.</b> {s.note}{" "}
					{s.story && <Link to={s.story}>{STORY_TITLE[s.story]}</Link>}
				</p>
			))}
		</>
	);
}

function LinkRow({
	link: l,
	nodes,
	values,
	selected,
	onSelect,
}: {
	link: GraphLink;
	nodes: GraphNode[];
	values?: Record<string, number[]>;
	selected: boolean;
	onSelect: (id: string | null) => void;
}) {
	const a = nodes.find((n) => n.id === l.a);
	const b = nodes.find((n) => n.id === l.b);
	if (!a || !b) return null;
	return (
		<li className={`network-kind-${l.kind}${selected ? " is-selected" : ""}`}>
			<button
				type="button"
				className="network-link-head"
				onClick={() => onSelect(selected ? null : l.id)}
				aria-pressed={selected}
			>
				<i aria-hidden="true" />
				<span>
					{KIND_LABEL[l.kind]}:{" "}
					<b>
						{a.id} · {a.alias}
					</b>
					, {shortMuseum(a.summary)} and{" "}
					<b>
						{b.id} · {b.alias}
					</b>
					, {shortMuseum(b.summary)}
				</span>
			</button>
			<p>
				{l.note} <Conf level={l.level} />
			</p>
			{l.scan && (
				<ol className="island-spans">
					{l.scan.spans.map(([n, si, sj], k) => {
						// spans index the scan's own a/b, which the link may name the other way round
						const flip = l.scan?.a !== l.a;
						const [i, j] = flip ? [sj, si] : [si, sj];
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: spans are positional
							<li key={k}>
								<span className="island-span-where">
									cords {i + 1}–{i + n} of {a.id} · cords {j + 1}–{j + n} of{" "}
									{b.id}
									{l.scan?.dir === "rev" ? " ↺" : ""}
								</span>
								{values?.[l.a] && (
									<span className="island-span-values">
										{values[l.a].slice(i, i + n).join(" · ")}
									</span>
								)}
							</li>
						);
					})}
				</ol>
			)}
			{l.story ? (
				<Link to={l.story} className="network-story-link">
					Read: {STORY_TITLE[l.story]}
				</Link>
			) : l.source ? (
				<p className="cell-muted">Source: {l.source}</p>
			) : (
				<p className="cell-muted">
					Not yet examined.{" "}
					<Link to="/khipus/$id" params={{ id: a.id }}>
						Open {a.id}
					</Link>{" "}
					and{" "}
					<Link to="/khipus/$id" params={{ id: b.id }}>
						{b.id}
					</Link>{" "}
					and compare the runs.
				</p>
			)}
			<PriorLine prior={l.prior} />
		</li>
	);
}

function RestStrip({
	nodes,
	silhouettes,
	colors,
}: {
	nodes: GraphNode[];
	silhouettes: Silhouettes;
	colors: ColorTable;
}) {
	return (
		<div className="island-rest">
			{nodes.map((n) => {
				const s = silhouettes[n.id];
				const cords = s
					? s.l.map((l, i) => ({ length: l, color: s.c[i] }))
					: [];
				return (
					<Link
						to="/khipus/$id"
						params={{ id: n.id }}
						key={n.id}
						className="island-rest-item"
						title={`${n.id} · ${n.alias}, ${n.summary.museum ?? "museum not recorded"}`}
					>
						<KhipuSilhouette
							cords={cords}
							colors={colors}
							width={Math.round(
								Math.max(36, Math.min(96, 6 * Math.sqrt(n.summary.nPendants))),
							)}
							height={22}
						/>
						<span>{n.alias}</span>
					</Link>
				);
			})}
		</div>
	);
}

const PRIOR_LABEL: Record<PriorWork["status"], string> = {
	published: "Published before",
	catalogue: "Already tied in the catalogues",
	"not-found": "No earlier claim found",
};

/** What the literature already says about a link: one quiet line, the sources behind a disclosure. */
function PriorLine({ prior }: { prior?: PriorWork }) {
	if (!prior) return null;
	if (prior.status === "published")
		return (
			<p className="island-prior">
				{PRIOR_LABEL.published}: {prior.checked.join("; ")}.
				{prior.note ? ` ${prior.note}` : ""}
			</p>
		);
	return (
		<details className="island-prior">
			<summary>
				{PRIOR_LABEL[prior.status]}
				{prior.status === "not-found"
					? ` in ${prior.checked.length} open sources`
					: ""}
			</summary>
			{prior.note && <p>{prior.note}</p>}
			<p>Checked: {prior.checked.join("; ")}.</p>
		</details>
	);
}
