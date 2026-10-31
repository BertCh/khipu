import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import DotRows, { DotKey, type DotRow } from "#/components/charts/DotRows";
import { StatTile } from "#/components/charts/Figure";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import LinkMap from "#/components/story/LinkMap";
import { Conf } from "#/components/story/Story";
import {
	getColors,
	getKhipuIndex,
	getSilhouettes,
	readJson,
	type Silhouettes,
} from "#/lib/khipu/data";
import type { ColorTable, KhipuSummary } from "#/lib/khipu/types";
import {
	buildGraph,
	type GraphLink,
	type GraphNode,
	type Island,
	KIND_BLURB,
	KIND_LABEL,
	type LinkKind,
	type ScanFile,
	STORY_TITLE,
	shortAlias,
	shortMuseum,
} from "#/lib/stories/links";
import { summarizeGraph } from "#/lib/stories/networkSummary";
import "#/styles/network.css";

const KINDS: LinkKind[] = ["account", "derived", "object", "passage"];

export const Route = createFileRoute("/network/")({
	// the island page's switches, so its "back to the map" link (and a story's
	// link to runs of four) opens the map as it was left
	validateSearch: (
		raw: Record<string, unknown>,
	): { run?: 5 | 4; places?: true; accessions?: true } => ({
		run: raw.run === 5 || raw.run === 4 ? raw.run : undefined,
		places: raw.places === true ? true : undefined,
		accessions: raw.accessions === true ? true : undefined,
	}),
	loader: async () => {
		const [index, silhouettes, colors, scan] = await Promise.all([
			getKhipuIndex(),
			getSilhouettes(),
			getColors(),
			readJson<ScanFile>("stories/links.json"),
		]);
		return { index, silhouettes, colors, scan };
	},
	head: () => ({
		meta: [
			{ title: "Network — Khipu" },
			{
				name: "description",
				content:
					"Khipus linked to another khipu: the same account tied twice, derived records, fragments of one object, and shared passages found by a corpus-wide scan.",
			},
		],
	}),
	component: Network,
});

function Network() {
	const { index, silhouettes, colors, scan } = Route.useLoaderData();
	const [visible, setVisible] = useState<Set<LinkKind>>(new Set(KINDS));
	const search = Route.useSearch();
	const [minRun, setMinRun] = useState<6 | 5 | 4>(search.run ?? 6);
	const [places, setPlaces] = useState(search.places ?? false);
	const [accessions, setAccessions] = useState(search.accessions ?? false);
	const [selected, setSelected] = useState<string | null>(null);
	const navigate = useNavigate();
	// the island page carries the same switches, so the URL reproduces the map
	const islandSearch = {
		run: minRun === 6 ? undefined : minRun,
		places: places || undefined,
		accessions: accessions || undefined,
	};
	const openIsland = (island: Island) =>
		navigate({
			to: "/network/$id",
			params: { id: island.id },
			search: islandSearch,
		});
	const graph = useMemo(
		() => buildGraph(index, scan, { minRun, places, accessions }),
		[index, scan, minRun, places, accessions],
	);
	const byId = useMemo(
		() => new Map(graph.nodes.map((n) => [n.id, n])),
		[graph],
	);
	const counts = useMemo(() => {
		const c = { account: 0, derived: 0, object: 0, passage: 0 };
		for (const l of graph.links) c[l.kind]++;
		return c;
	}, [graph]);
	const museums = new Set(graph.nodes.map((n) => n.summary.museum));
	// the same counting as home and /stories (networkSummary), at this setting
	const summary = useMemo(() => summarizeGraph(graph, scan), [graph, scan]);
	const floor = scan.baseline;
	const floorRows: DotRow[] = (["6", "5", "4"] as const).map((k) => {
		const f = floor[k];
		const label = k === "6" ? "six or more" : k === "5" ? "five" : "four";
		return {
			key: k,
			label: `Longest shared run ${k === "6" ? "≥ 6" : `= ${k}`}`,
			value: f.observed,
			ref: f.shuffled,
			note: `${f.observed} vs ${f.shuffled}`,
			emphasis: k === "6",
			muted: f.observed < 2 * f.shuffled,
			tip: (
				<>
					<div className="chart-tip-title">Longest run of {label}</div>
					<div className="chart-tip-row">
						<strong>{f.observed}</strong>
						<span>pairs in the corpus</span>
					</div>
					<div className="chart-tip-row">
						<strong>{f.shuffled}</strong>
						<span>on average in {scan.shuffles} shuffled corpora</span>
					</div>
				</>
			),
		};
	});
	const floorTop =
		Math.ceil(Math.max(1, ...floorRows.map((r) => r.value)) / 10) * 10;
	const floorTicks = Array.from(
		{ length: floorTop / 10 + 1 },
		(_, i) => i * 10,
	);

	const toggle = (kind: LinkKind) =>
		setVisible((v) => {
			const next = new Set(v);
			if (next.has(kind)) next.delete(kind);
			else next.add(kind);
			return next;
		});

	const selectedNode = selected ? byId.get(selected) : undefined;
	const selectedLink = selected
		? graph.links.find((l) => l.id === selected)
		: undefined;

	return (
		<main className="page-wrap-wide network-page">
			<div className="page-wrap">
				<h1 className="page-title">Linked khipus</h1>
				<p className="lede">
					Khipus are now held in museums on three continents. Shared values link
					some of them. This map shows every khipu the project has linked to
					another (the same account tied twice, one record derived from another,
					fragments of one object), grouped into islands, each khipu in its own
					colours.
				</p>
				<div className="stats network-stats">
					<StatTile
						label="khipus linked to another"
						value={summary.khipus}
						hint={`of ${index.length} in the corpus`}
					/>
					<StatTile
						label="links"
						value={summary.links}
						hint={`${counts.account} same account, ${counts.derived} derived, ${counts.object} same object, ${counts.passage} unexamined`}
					/>
					<StatTile
						label="islands"
						value={summary.islands}
						hint="groups of khipus connected to each other"
					/>
					<StatTile
						label="links across museums"
						value={summary.crossMuseum}
						hint={`${museums.size} institutions hold a linked khipu`}
					/>
				</div>
			</div>

			<fieldset className="network-tools">
				<legend className="sr-only">Show links</legend>
				{KINDS.map((kind) => (
					<button
						type="button"
						key={kind}
						className={`btn network-kind network-kind-${kind}`}
						aria-pressed={visible.has(kind)}
						onClick={() => toggle(kind)}
					>
						<i aria-hidden="true" />
						{KIND_LABEL[kind]}
						<span className="btn-count">{counts[kind]}</span>
					</button>
				))}
				<span className="network-tools-gap" aria-hidden="true" />
				<span className="network-tools-label">Shared runs of at least</span>
				{([6, 5, 4] as const).map((n) => {
					const f = floor[String(n) as "6" | "5" | "4"];
					return (
						<button
							type="button"
							key={n}
							className="btn network-run"
							aria-pressed={minRun === n}
							onClick={() => setMinRun(n)}
							title={`${f.observed} pairs whose longest shared run is ${n === 6 ? "6 or more" : n} values; a shuffled corpus gives ${f.shuffled}`}
						>
							{n}
							<span className="btn-count">
								{f.observed} <i>· {f.shuffled} by chance</i>
							</span>
						</button>
					);
				})}
			</fieldset>
			<fieldset className="network-tools network-tools-sets">
				<legend className="sr-only">Group khipus</legend>
				<span className="network-tools-label">Also gather by</span>
				<button
					type="button"
					className="btn network-set-toggle network-set-toggle-place"
					aria-pressed={places}
					onClick={() => setPlaces((v) => !v)}
				>
					<i aria-hidden="true" />
					Find-spot
					<span className="btn-count">{scan.places.length}</span>
				</button>
				<button
					type="button"
					className="btn network-set-toggle network-set-toggle-accession"
					aria-pressed={accessions}
					onClick={() => setAccessions((v) => !v)}
				>
					<i aria-hidden="true" />
					Museum number
					<span className="btn-count">{scan.accessions.length}</span>
				</button>
				<span className="network-tools-hint">
					{places || accessions
						? `${graph.nodes.length} khipus on the map`
						: "Adds every khipu with a recorded find-spot or a shared museum number to the map."}
				</span>
			</fieldset>

			<LinkMap
				graph={graph}
				silhouettes={silhouettes}
				colors={colors}
				visible={visible}
				selected={selected}
				onSelect={setSelected}
				onOpen={openIsland}
			/>

			<div className="network-below page-wrap">
				<aside className="network-detail panel" aria-live="polite">
					{(selectedNode || selectedLink) && (
						<Link
							to="/network/$id"
							params={{ id: selectedNode?.id ?? selectedLink?.a ?? "" }}
							search={islandSearch}
							className="network-open-island"
						>
							Open this island ↗
						</Link>
					)}
					{selectedNode ? (
						<NodeDetail
							node={selectedNode}
							byId={byId}
							silhouettes={silhouettes}
							colors={colors}
							onSelect={setSelected}
						/>
					) : selectedLink ? (
						<LinkDetail
							link={selectedLink}
							byId={byId}
							silhouettes={silhouettes}
							colors={colors}
							onSelect={setSelected}
						/>
					) : (
						<div className="network-detail-empty">
							<p>
								Select a khipu or a line to see the link. Hover to highlight
								everything linked to a khipu.
							</p>
						</div>
					)}
				</aside>

				<div className="network-key">
					{KINDS.map((kind) => (
						<div className={`network-key-row network-kind-${kind}`} key={kind}>
							<i aria-hidden="true" />
							<div>
								<b>{KIND_LABEL[kind]}</b>
								<p>{KIND_BLURB[kind]}</p>
							</div>
						</div>
					))}
					<div className="network-key-row network-key-set">
						<i aria-hidden="true" />
						<div>
							<b>Found together</b>
							<p>
								A plate groups khipus that a story or paper treats as one find:
								the Santa valley six, the Basel fragments, the Inkawasi
								storehouse, the Puruchuco archive. The find-spot and
								museum-number layers group the rest of the corpus the same way:
								a wide pale outline is a recorded find-spot, a plate inside it
								one museum number.
							</p>
						</div>
					</div>
				</div>
			</div>

			<section className="section page-wrap">
				<h2>Every link</h2>
				<p className="prose">
					Each link, with the story or paper that discusses it. A link with no
					story is either published elsewhere or an unexamined scan result. The
					count is the number of consecutive level-1 values the two khipus share
					in order, reversed where marked.
				</p>
				<div className="network-table-wrap">
					<table className="data-table network-table">
						<thead>
							<tr>
								<th>Kind</th>
								<th>Khipu</th>
								<th>Khipu</th>
								<th className="num">Values</th>
								<th>What matches</th>
								<th>Read in</th>
							</tr>
						</thead>
						<tbody>
							{[...graph.links]
								.sort(
									(x, y) =>
										KINDS.indexOf(x.kind) - KINDS.indexOf(y.kind) ||
										(y.scan?.values ?? 0) - (x.scan?.values ?? 0) ||
										x.a.localeCompare(y.a),
								)
								.map((l) => (
									<tr
										key={l.id}
										className={selected === l.id ? "is-selected" : ""}
										onClick={() => setSelected(l.id)}
									>
										<td>
											<span
												className={`network-kind-tag network-kind-${l.kind}`}
											>
												<i aria-hidden="true" />
												{KIND_LABEL[l.kind]}
											</span>
										</td>
										<td>
											<KhipuCell k={byId.get(l.a)?.summary} />
										</td>
										<td>
											<KhipuCell k={byId.get(l.b)?.summary} />
										</td>
										<td className="num">
											{l.scan
												? `${l.scan.values}${l.scan.dir === "rev" ? " ↺" : ""}`
												: "—"}
										</td>
										<td className="network-note">
											{l.note} <Conf level={l.level} />
										</td>
										<td className="network-read">
											{l.story ? (
												<Link to={l.story}>
													{STORY_TITLE[l.story] ?? l.story}
												</Link>
											) : (
												<span className="cell-muted">
													{l.source ?? "unexamined"}
												</span>
											)}
										</td>
									</tr>
								))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="section page-wrap">
				<h2>How the links were found</h2>
				<div className="prose">
					<p>
						The curated links come from the stories on this site and from two
						published matchings: Gary Urton&rsquo;s 2005 list of Berlin pairs
						recorded by the Aschers, and Urton and Brezine&rsquo;s 2005
						Puruchuco hierarchy. The grey links are the output of one screen run
						over all {index.length} khipus: take each khipu&rsquo;s level-1 cord
						values in order, slide a window of five (and again of four) across
						them, keep windows with at least four nonzero, four distinct values
						and a maximum of 15 or more, and look for the same window in another
						khipu — forward, and with one khipu reversed. Matches are extended
						to their full run.
					</p>
					<p>
						The screen finds every published pair that has a run to find, and it
						found the Paris–Lima account, the third Berlin copy and the reversed
						Basel fragments. Its chance level is measured by running the same
						scan over {scan.shuffles} corpora with every khipu&rsquo;s values
						shuffled; the chart below sets the two counts side by side. A run of
						six is unlikely by chance; a run of five is worth checking; a run of
						four is mostly chance, possibly with a real pair or two among them.
						The buttons above set the cut-off; unexamined pairs are drawn in
						grey whatever their length. The same kind of check, applied to the
						sums within each khipu and to this scan, is the subject of{" "}
						<Link to="/stories/what-chance-can-do">What chance can do</Link>.
					</p>
				</div>
				<div className="network-floor">
					<DotRows
						rows={floorRows}
						domain={[0, floorTop]}
						ticks={floorTicks}
						format={(v) => String(v)}
						axisLabel="pairs of khipus"
					/>
					<DotKey
						observed="pairs in the corpus"
						ring={`mean of ${scan.shuffles} shuffled corpora`}
					/>
					<p className="network-floor-note">
						Only {scan.shuffles} shuffled corpora, so each ring is a rough mean:
						the count for runs of four moves by several pairs between shuffles.
						Grey dot: within twice the shuffled count.
					</p>
				</div>
				<div className="prose">
					<p>
						A second set of screens (<code>scripts/link_screens.py</code>) looks
						for matches a run cannot detect: four of five values in order with
						one changed, one khipu&rsquo;s consecutive values against the
						leading cord of every group of another, whole groups with the same
						values in another order, values of a thousand or more that occur in
						exactly two khipus, and khipus catalogued under one museum number.
						Those screens added the summary AS104 makes of UR234, the Pachacamac
						copy AS118 makes of UR218, the Inkawasi pair UR273B and UR274B, a
						group shared between Nazca and Dallas, and a group Berlin holds
						twice. Each was checked cord by cord before it was added.
					</p>
					<p>
						The scan is <code>scripts/build_links.py</code> over{" "}
						<code>scripts/shared_passages.py</code>; the curated layer is{" "}
						<code>src/lib/stories/links.ts</code>. The Urton pair the scan
						cannot detect (AS116/AS150 shares no run in the recorded values) is
						kept because it is published, and marked open. The find-spot and
						museum-number layers add nothing beyond the catalogue: they show
						where the linked khipus sit among the rest.
					</p>
				</div>
			</section>
		</main>
	);
}

function KhipuCell({ k }: { k?: KhipuSummary }) {
	if (!k) return null;
	return (
		<span className="network-cell">
			<Link to="/khipus/$id" params={{ id: k.id }}>
				{k.id}
			</Link>
			<span className="cell-muted">
				{shortAlias(k)} · {shortMuseum(k)}
			</span>
		</span>
	);
}

function KhipuCard({
	node,
	silhouettes,
	colors,
	onSelect,
	width = 300,
}: {
	node: GraphNode;
	silhouettes: Silhouettes;
	colors: ColorTable;
	onSelect: (id: string) => void;
	width?: number;
}) {
	const s = silhouettes[node.id];
	const cords = s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
	const k = node.summary;
	return (
		<div className="network-card">
			<button
				type="button"
				className="network-card-art"
				onClick={() => onSelect(node.id)}
				aria-label={`Select ${node.id}`}
			>
				<KhipuSilhouette
					cords={cords}
					colors={colors}
					width={width}
					height={64}
				/>
			</button>
			<div className="network-card-body">
				<h3>
					<Link to="/khipus/$id" params={{ id: k.id }}>
						{k.id}
					</Link>{" "}
					<span>{k.aliases.join(" · ")}</span>
				</h3>
				<p>
					{k.museum ?? "museum not recorded"}
					{k.provenance ? `; from ${k.provenance}` : "; no find-spot recorded"}
				</p>
				<p className="cell-muted">
					{k.nPendants} pendants, {k.nSubsidiaries} subsidiaries, {k.nGroups}{" "}
					groups
					{k.primaryLength ? `, primary ${k.primaryLength} cm` : ""}
				</p>
			</div>
		</div>
	);
}

function NodeDetail({
	node,
	byId,
	silhouettes,
	colors,
	onSelect,
}: {
	node: GraphNode;
	byId: Map<string, GraphNode>;
	silhouettes: Silhouettes;
	colors: ColorTable;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="network-detail-body">
			<KhipuCard
				node={node}
				silhouettes={silhouettes}
				colors={colors}
				onSelect={onSelect}
			/>
			{node.sets.map((s) => (
				<p className={`network-set-note network-set-note-${s.kind}`} key={s.id}>
					<b>{s.label}.</b> {s.note}{" "}
					{s.story && <Link to={s.story}>{STORY_TITLE[s.story]}</Link>}
				</p>
			))}
			<ul className="network-link-list">
				{node.links.map((l) => {
					const other = byId.get(l.a === node.id ? l.b : l.a);
					if (!other) return null;
					return (
						<li key={l.id} className={`network-kind-${l.kind}`}>
							<button
								type="button"
								className="network-link-head"
								onClick={() => onSelect(l.id)}
							>
								<i aria-hidden="true" />
								<span>
									{KIND_LABEL[l.kind].toLowerCase()} with{" "}
									<b>
										{other.id} · {other.alias}
									</b>
									, {shortMuseum(other.summary)}
								</span>
							</button>
							<p>
								{l.note} <Conf level={l.level} />
							</p>
							{l.story && (
								<Link to={l.story} className="network-story-link">
									Read: {STORY_TITLE[l.story]}
								</Link>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function LinkDetail({
	link,
	byId,
	silhouettes,
	colors,
	onSelect,
}: {
	link: GraphLink;
	byId: Map<string, GraphNode>;
	silhouettes: Silhouettes;
	colors: ColorTable;
	onSelect: (id: string) => void;
}) {
	const a = byId.get(link.a);
	const b = byId.get(link.b);
	if (!a || !b) return null;
	return (
		<div className="network-detail-body">
			<p className={`network-detail-kind network-kind-${link.kind}`}>
				<i aria-hidden="true" />
				<b>{KIND_LABEL[link.kind]}</b>
				<Conf level={link.level} />
			</p>
			<div className="network-pair">
				<KhipuCard
					node={a}
					silhouettes={silhouettes}
					colors={colors}
					onSelect={onSelect}
					width={240}
				/>
				<KhipuCard
					node={b}
					silhouettes={silhouettes}
					colors={colors}
					onSelect={onSelect}
					width={240}
				/>
			</div>
			<p className="network-detail-note">{link.note}</p>
			{link.scan && (
				<p className="cell-muted">
					The scan finds{" "}
					{link.scan.runs === 1 ? "one run" : `${link.scan.runs} runs`} of
					identical consecutive values
					{link.scan.dir === "rev" ? ", with one khipu read in reverse" : ""}:{" "}
					{link.scan.spans
						.slice(0, 3)
						.map(
							([n, i, j]) =>
								`${n} values from cord ${i + 1} of ${a.id} and cord ${j + 1} of ${b.id}`,
						)
						.join("; ")}
					{link.scan.spans.length > 3
						? `; and ${link.scan.spans.length - 3} more`
						: ""}
					.
				</p>
			)}
			{link.story ? (
				<Link to={link.story} className="network-story-link">
					Read: {STORY_TITLE[link.story]}
				</Link>
			) : link.source ? (
				<p className="cell-muted">Published: {link.source}</p>
			) : (
				<p className="cell-muted">
					Not yet examined. Open both khipus to compare the runs.
				</p>
			)}
		</div>
	);
}
