import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatTile } from "#/components/charts/Figure";
import CordAnatomy from "#/components/khipu/CordAnatomy";
import CordSums, { type ActiveSum } from "#/components/khipu/CordSums";
import DiagramKey from "#/components/khipu/DiagramKey";
import KhipuDiagram, {
	type RenderStyle,
} from "#/components/khipu/KhipuDiagram";
import KhipuProfile from "#/components/khipu/KhipuProfile";
import PhysicalKey from "#/components/khipu/PhysicalKey";
import { HAND_COLOR } from "#/components/khipu/SumXray";
import { Conf } from "#/components/story/Story";
import { describeColor, hexFor } from "#/lib/khipu/colors";
import {
	getCodes,
	getColors,
	getKhipu,
	getKhipuIndex,
	getKhipus,
	getNeighbors,
	readJson,
} from "#/lib/khipu/data";
import {
	codeLabel,
	cordKindLabel,
	describeKnot,
	valueConflictText,
} from "#/lib/khipu/describe";
import type { CordNode } from "#/lib/khipu/layout";
import { getProfiles, networkRole } from "#/lib/khipu/profile";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { type ScanFile, shortAlias } from "#/lib/stories/links";
import {
	type CordMatch,
	getStrands,
	MATCH_KINDS,
	matchesFor,
	type PartnerMatches,
	THREAD_LABEL,
	type ThreadKind,
} from "#/lib/stories/strands";

export const Route = createFileRoute("/khipus/$id")({
	loader: async ({ params }) => {
		const id = params.id.toUpperCase();
		const [khipu, colors, codes, neighbors, profiles, scan, index, strands] =
			await Promise.all([
				getKhipu(id),
				getColors(),
				getCodes(),
				getNeighbors(id),
				// the profile is an extra: the page still renders without it
				getProfiles().catch(() => null),
				readJson<ScanFile>("stories/links.json").catch(() => null),
				getKhipuIndex(),
				getStrands(),
			]);
		if (!khipu) throw notFound();
		const network = networkRole(id, scan);
		const aliases: Record<string, string> = {};
		for (const k of index) aliases[k.id] = shortAlias(k);
		const profile = profiles?.profiles[id]
			? {
					profile: profiles.profiles[id],
					meta: profiles.meta,
					...network,
					aliases,
				}
			: null;
		// the cords this khipu shares with others, cord by cord (strands.json);
		// scan pairs below a run of five are chance-level and left out
		const partners = matchesFor(strands, id);
		const partnerAliases: Record<string, string> = {};
		for (const pm of partners)
			partnerAliases[pm.partner] = aliases[pm.partner] ?? pm.partner;
		return {
			khipu,
			colors,
			codes,
			neighbors,
			profile,
			partners,
			partnerAliases,
		};
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData ? `${loaderData.khipu.id} — Khipu` : "Khipu" }],
	}),
	notFoundComponent: () => (
		<main className="page-wrap">
			<h1 className="page-title">No such khipu</h1>
			<p className="lede">
				Ids look like KH0279. <Link to="/khipus">Browse the corpus</Link> to
				find one.
			</p>
		</main>
	),
	component: Detail,
});

const ZOOMS = [
	{ label: "Compact", slot: 8, subOffset: 3, pxPerCm: 2.4, cordW: 2 },
	{ label: "Normal", slot: 11, subOffset: 4, pxPerCm: 3.4, cordW: 2.4 },
	{ label: "Large", slot: 16, subOffset: 6, pxPerCm: 5, cordW: 3.4 },
	{ label: "Close", slot: 34, subOffset: 17, pxPerCm: 8, cordW: 6.5 },
];

const STYLES: { label: string; value: RenderStyle }[] = [
	{ label: "Schematic", value: "schematic" },
	{ label: "Physical", value: "physical" },
];

function Detail() {
	const { khipu, colors, codes, neighbors, profile, partners, partnerAliases } =
		Route.useLoaderData();
	const [showMatches, setShowMatches] = useState(false);
	const matches = useCordMatches(khipu, partners, showMatches);
	const [showValues, setShowValues] = useState(false);
	const [showGroups, setShowGroups] = useState(true);
	const [zoom, setZoom] = useState(1);
	const [style, setStyle] = useState<RenderStyle>("schematic");
	const [selected, setSelected] = useState<string | null>(null);
	// the sum lit in the sums section, rung on the diagram as well
	const [activeSum, setActiveSum] = useState<ActiveSum | null>(null);
	const sumOverlay = useMemo(() => {
		if (!activeSum) return {};
		const tone = new Map<string, string>();
		for (const hand of ["R", "L"] as const) {
			for (const n of activeSum.summands[hand] ?? []) {
				tone.set(n, HAND_COLOR[hand]);
			}
		}
		const hands = Object.keys(activeSum.summands);
		tone.set(
			activeSum.sum,
			hands.length === 1 ? HAND_COLOR[hands[0] as "R" | "L"] : "var(--ink)",
		);
		return {
			ring: (c: Cord) => tone.get(c.name) ?? null,
			emphasis: (c: Cord) => tone.has(c.name),
		};
	}, [activeSum]);
	const layout = useMemo(() => ZOOMS[zoom], [zoom]);
	const selectedCord = useMemo(
		() => khipu.cords.find((c) => c.name === selected) ?? null,
		[khipu.cords, selected],
	);
	const p = khipu.primary;
	const s = khipu.stats;

	return (
		<main className="page-wrap-wide">
			<nav className="prevnext" aria-label="Neighbouring khipus">
				<span>
					{neighbors.prev ? (
						<Link to="/khipus/$id" params={{ id: neighbors.prev }}>
							← {neighbors.prev}
						</Link>
					) : (
						<span />
					)}
				</span>
				<span style={{ color: "var(--ink-3)" }}>
					{neighbors.position} of {neighbors.total}
				</span>
				<span>
					{neighbors.next && (
						<Link to="/khipus/$id" params={{ id: neighbors.next }}>
							{neighbors.next} →
						</Link>
					)}
				</span>
			</nav>

			<header className="detail-head">
				<div>
					<h1 className="page-title">
						{khipu.id}
						{khipu.aliases.length > 0 && (
							<span className="aliases">{khipu.aliases.join(", ")}</span>
						)}
					</h1>
					<dl className="meta">
						<dt>Museum</dt>
						<dd>
							{khipu.museum.url ? (
								<a href={khipu.museum.url} target="_blank" rel="noreferrer">
									{khipu.museum.canonical ?? "Unknown"}
								</a>
							) : (
								(khipu.museum.canonical ?? "Unknown")
							)}
							{khipu.museum.city || khipu.museum.country
								? `, ${[khipu.museum.city, khipu.museum.country].filter(Boolean).join(", ")}`
								: ""}
							{khipu.museum.number ? ` (no. ${khipu.museum.number})` : ""}
						</dd>
						<dt>Provenance</dt>
						<dd>
							{khipu.provenance ?? "Unknown"}
							{khipu.region ? `, ${khipu.region}` : ""}
						</dd>
						<dt>Recorded by</dt>
						<dd>{khipu.contributors ?? "—"}</dd>
						<dt>Sources</dt>
						<dd>
							<a href={khipu.kfgUrl} target="_blank" rel="noreferrer">
								Khipu Field Guide
							</a>
							{khipu.okr && (
								<>
									{" "}
									and Open Khipu Repository record {khipu.okr.okrId}
									{khipu.okr.investigatorNum
										? ` (${khipu.okr.investigatorNum})`
										: ""}
								</>
							)}
						</dd>
						{khipu.corrections?.length ? (
							<>
								<dt>Corrected</dt>
								<dd style={{ color: "var(--ink-2)" }}>
									{khipu.corrections[0].why}{" "}
									{khipu.corrections.map((c) => (
										<details key={c.field}>
											<summary style={{ cursor: "pointer" }}>
												{c.field === "cords"
													? "Cords"
													: c.field === "provenance"
														? "Provenance"
														: "Museum number"}
												: {c.from ?? "—"} → {c.to}
											</summary>
											<ul
												style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem" }}
											>
												{c.evidence.map((e) => (
													<li key={e}>{e}</li>
												))}
											</ul>
										</details>
									))}
								</dd>
							</>
						) : null}
					</dl>
				</div>
				<div>
					<h3 style={{ marginBottom: "0.4rem" }}>Primary cord</h3>
					<dl className="meta">
						<dt>Length</dt>
						<dd>{p.length != null ? `${p.length} cm` : "—"}</dd>
						<dt>Colour</dt>
						<dd>
							<Swatches
								codes={p.colorParsed?.flatMap((x) => x.codes) ?? []}
								colors={colors}
							/>
							{p.color ?? "—"}
							{p.colorParsed
								? ` — ${describeColor(p.colorParsed, colors)}`
								: ""}
						</dd>
						<dt>Fibre</dt>
						<dd>{codeLabel("fiber", p.fiber, codes)}</dd>
						<dt>Twist</dt>
						<dd>{codeLabel("twist", p.twist, codes)}</dd>
						<dt>Ends</dt>
						<dd>
							begins {codeLabel("beginning", p.beginning, codes)}, ends{" "}
							{codeLabel("termination", p.term, codes)}
						</dd>
						{p.notes && (
							<>
								<dt>Notes</dt>
								<dd style={{ color: "var(--ink-2)" }}>{p.notes}</dd>
							</>
						)}
					</dl>
				</div>
			</header>

			<div className="stats detail-stats">
				<StatTile
					label="pendant cords"
					value={s.nPendants}
					hint={`in ${s.nGroups} groups`}
				/>
				<StatTile
					label="subsidiary cords"
					value={s.nSubsidiaries}
					hint={`${s.maxLevel} levels deep`}
				/>
				<StatTile label="knots" value={s.nKnots} />
				<StatTile label="colour codes" value={s.nColors} />
				<StatTile
					label="sum of cord values"
					value={s.totalValue}
					hint={`largest ${s.maxValue.toLocaleString()}`}
				/>
			</div>

			{profile && <KhipuProfile id={khipu.id} {...profile} />}

			<section className="section">
				<h2>Diagram</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Pendants hang from the primary cord in their recorded groups, one
					column each, with subsidiaries branching to the right of their parent;
					the number above a bracket is where the group starts along the primary
					cord, in cm. Lengths and knot positions are to scale vertically, so
					the knots read as decimal digits: the rows nearest the primary cord
					are the highest powers of ten, single knots count tens and up, and a
					long knot or a figure-eight in the lowest row gives the units. Hover a
					cord for its record; click one to pick it out in the table below.
				</p>
				<div className="diagram-tools">
					{STYLES.map((st) => (
						<button
							key={st.value}
							type="button"
							className="btn"
							aria-pressed={style === st.value}
							onClick={() => setStyle(st.value)}
						>
							{st.label}
						</button>
					))}
					<span className="tools-sep" aria-hidden="true" />
					{ZOOMS.map((z, i) => (
						<button
							key={z.label}
							type="button"
							className="btn"
							aria-pressed={zoom === i}
							onClick={() => setZoom(i)}
						>
							{z.label}
						</button>
					))}
					<span className="spacer" />
					<button
						type="button"
						className="btn"
						aria-pressed={showValues}
						onClick={() => setShowValues((v) => !v)}
					>
						Show values
					</button>
					<button
						type="button"
						className="btn"
						aria-pressed={showGroups}
						onClick={() => setShowGroups((v) => !v)}
					>
						Show groups
					</button>
					{matches.cords > 0 && (
						<button
							type="button"
							className="btn"
							aria-pressed={showMatches}
							onClick={() => setShowMatches((v) => !v)}
							title="Colour the cords this khipu shares with other khipus"
						>
							Show matches ({matches.cords} cord{matches.cords === 1 ? "" : "s"}
							)
						</button>
					)}
					{selected && (
						<button
							type="button"
							className="btn"
							onClick={() => setSelected(null)}
						>
							Clear selection ({selected})
						</button>
					)}
				</div>
				<KhipuDiagram
					khipu={khipu}
					colors={colors}
					codes={codes}
					layout={layout}
					style={style}
					showValues={showValues}
					showGroups={showGroups}
					selected={selected}
					onSelect={setSelected}
					ring={sumOverlay.ring}
					emphasis={
						activeSum || !showMatches ? sumOverlay.emphasis : matches.emphasis
					}
					paint={showMatches ? matches.paint : undefined}
					renderTooltip={showMatches ? matches.tooltip : undefined}
				/>
				{showMatches ? (
					<MatchKey
						partners={partners}
						aliases={partnerAliases}
						kinds={matches.kinds}
					/>
				) : style === "physical" ? (
					<PhysicalKey />
				) : (
					<DiagramKey />
				)}
			</section>

			{selectedCord && (
				<section className="section" aria-labelledby="closeup-title">
					<h2 id="closeup-title">Cord {selectedCord.name} up close</h2>
					<p className="prose" style={{ marginBottom: "0.9rem" }}>
						The selected cord drawn as the record describes it: how it is
						hitched, which way its plies lean, each knot as recorded, how it
						ends. Click another cord in the diagram or the table to change it.
					</p>
					<CordAnatomy
						cord={selectedCord}
						parent={
							selectedCord.parent
								? (khipu.cords.find((c) => c.name === selectedCord.parent) ??
									null)
								: null
						}
						primary={khipu.primary}
						colors={colors}
						codes={codes}
						khipuId={khipu.id}
					/>
				</section>
			)}

			<CordSums
				khipu={khipu}
				colors={colors}
				kfgUrl={`https://www.khipufieldguide.com/notebook/fieldmarks/colored_pendant_sum/html/${khipu.id}.html`}
				onActive={setActiveSum}
			/>

			<section className="section">
				<h2>Cords</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Every cord as recorded. Click a row to highlight it in the diagram.
				</p>
				<CordTable
					cords={khipu.cords}
					colors={colors}
					codes={codes}
					selected={selected}
					onSelect={setSelected}
				/>
			</section>
		</main>
	);
}

function Swatches({
	codes,
	colors,
}: {
	codes: string[];
	colors: ReturnType<typeof Route.useLoaderData>["colors"];
}) {
	if (codes.length === 0) return null;
	return (
		<span
			className="kd-swatches"
			style={{ marginRight: "0.4rem", verticalAlign: "-1px" }}
		>
			{codes.map((c, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: positional
				<i key={i} style={{ background: hexFor(c, colors) }} />
			))}
		</span>
	);
}

function CordTable({
	cords,
	colors,
	codes,
	selected,
	onSelect,
}: {
	cords: Cord[];
	colors: ReturnType<typeof Route.useLoaderData>["colors"];
	codes: ReturnType<typeof Route.useLoaderData>["codes"];
	selected: string | null;
	onSelect: (name: string | null) => void;
}) {
	return (
		<div
			className="table-wrap"
			style={{ maxHeight: "70vh", overflowY: "auto" }}
		>
			<table className="data-table">
				<thead>
					<tr>
						<th>Cord</th>
						<th>Kind</th>
						<th className="num">At cm</th>
						<th>Colour</th>
						<th className="num">Length</th>
						<th className="num">Value</th>
						<th>Knots</th>
						<th>Attach</th>
						<th>Twist</th>
						<th>End</th>
						<th>Notes</th>
					</tr>
				</thead>
				<tbody>
					{cords.map((c) => (
						<tr
							key={c.name}
							className={selected === c.name ? "is-selected" : undefined}
							onClick={() => onSelect(selected === c.name ? null : c.name)}
							style={{ cursor: "pointer" }}
						>
							<td style={{ paddingLeft: `${0.75 + (c.level - 1) * 0.9}rem` }}>
								{c.name}
							</td>
							<td className="cell-muted">{cordKindLabel(c)}</td>
							<td className="num">{c.pos ?? "—"}</td>
							<td title={describeColor(c.colorParsed, colors)}>
								<Swatches
									codes={c.colorParsed?.flatMap((x) => x.codes) ?? []}
									colors={colors}
								/>
								{c.color ?? "—"}
							</td>
							<td className="num">{c.length ?? "—"}</td>
							<td className="num">
								{c.value != null ? c.value.toLocaleString() : "—"}
								{c.altValue ? (
									<span style={{ color: "var(--ink-3)" }}> / {c.altValue}</span>
								) : null}
								{c.valueConflict ? (
									<span className="value-conflict" title={valueConflictText(c)}>
										{" "}
										≠ {c.valueConflict.knots.toLocaleString()}
									</span>
								) : null}
							</td>
							<td
								className="cell-muted"
								style={{ maxWidth: "34ch" }}
								title={c.knots.map(describeKnot).join("; ")}
							>
								{c.knots.map(describeKnot).join("; ") || "—"}
							</td>
							<td className="cell-muted">
								{codeLabel("attachment", c.attach, codes)}
							</td>
							<td className="cell-muted">{c.twist ?? "—"}</td>
							<td className="cell-muted">
								{codeLabel("termination", c.term, codes)}
							</td>
							<td className="cell-muted" title={c.notes}>
								{c.notes ?? ""}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ---------------------------------------------------------------- matches

/** Flat colours for a cord by the kind of thread that reaches it. */
const MATCH_PAINT: Record<ThreadKind, string> = {
	exact: "var(--accent)",
	near: "color-mix(in oklab, var(--accent) 55%, var(--ink-3))",
	sum: "var(--moiety-r)",
	scaled: "color-mix(in oklab, var(--moiety-r) 55%, var(--ink-3))",
	blank: "var(--ink-3)",
	differ: "var(--hand-r)",
	dropped: "color-mix(in oklab, var(--hand-r) 50%, var(--ink-3))",
};
/** a run the scan found and no one has read: grey, whatever its kind */
const UNEXAMINED_PAINT = "var(--ink-2)";
/** cords with no thread step back, so the matched ones read at a glance */
const NO_THREAD_PAINT = "var(--rule)";

const KIND_ORDER: ThreadKind[] = [
	"exact",
	"near",
	"sum",
	"scaled",
	"blank",
	"differ",
	"dropped",
];

interface CordEntry {
	partner: string;
	unexamined: boolean;
	m: CordMatch;
}

/** Level-1 cords in ordinal order: the indexing of strands.json. */
function levelOne(k: Khipu): Cord[] {
	return k.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
}

/** "p4–p9" for a consecutive run, else "p4, p7". */
function cordList(names: string[]): string {
	if (names.length > 2) {
		const nums = names.map((n) => Number(n.match(/^p(\d+)$/)?.[1]));
		if (nums.every((x, i) => i === 0 || x === nums[i - 1] + 1))
			return `${names[0]}–${names[names.length - 1]}`;
	}
	return names.join(", ");
}

const num = (v: number) => v.toLocaleString();

/**
 * The diagram overlay for "Show matches": which cords carry a thread to
 * another khipu, painted by kind, with a hover card naming the partner cord.
 */
function useCordMatches(khipu: Khipu, partners: PartnerMatches[], on: boolean) {
	const l1 = useMemo(() => levelOne(khipu), [khipu]);
	// the partners' own cord names (p-numbers can skip or repeat), fetched
	// the first time the overlay is turned on
	const [partnerCords, setPartnerCords] = useState<Record<string, Cord[]>>({});
	useEffect(() => {
		if (!on || partners.length === 0) return;
		const want = partners
			.map((p) => p.partner)
			.filter((id) => !partnerCords[id]);
		if (want.length === 0) return;
		let live = true;
		getKhipus(want)
			.then((ks) => {
				if (!live) return;
				const next: Record<string, Cord[]> = {};
				for (const [id, k] of Object.entries(ks)) next[id] = levelOne(k);
				setPartnerCords((prev) => ({ ...prev, ...next }));
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [on, partners, partnerCords]);

	const byName = useMemo(() => {
		const map = new Map<string, CordEntry[]>();
		for (const pm of partners)
			for (const m of pm.matches) {
				const names = m.subMine ?? m.mine.map((i) => l1[i]?.name);
				for (const name of names) {
					if (!name) continue;
					const list = map.get(name) ?? [];
					list.push({ partner: pm.partner, unexamined: pm.unexamined, m });
					map.set(name, list);
				}
			}
		// firm readings before scan runs, matches before blanks and differences
		for (const list of map.values())
			list.sort(
				(x, y) =>
					Number(x.unexamined) - Number(y.unexamined) ||
					KIND_ORDER.indexOf(x.m.kind) - KIND_ORDER.indexOf(y.m.kind),
			);
		return map;
	}, [partners, l1]);

	const cords = useMemo(() => {
		let n = 0;
		for (const list of byName.values())
			if (list.some((e) => MATCH_KINDS.has(e.m.kind))) n++;
		return n;
	}, [byName]);

	const kinds = useMemo(() => {
		const seen = new Set<ThreadKind | "unexamined">();
		for (const list of byName.values()) {
			const e = list[0];
			seen.add(e.unexamined ? "unexamined" : e.m.kind);
		}
		return seen;
	}, [byName]);

	const theirNames = (e: CordEntry) =>
		e.m.subTheirs ??
		e.m.theirs.map((i) => partnerCords[e.partner]?.[i]?.name ?? `p${i + 1}`);

	const describe = (e: CordEntry): string => {
		const there = `${e.partner} ${cordList(theirNames(e))}`;
		const pv = num(e.m.partnerValue);
		const how = e.m.how ? `, ${e.m.how}` : "";
		switch (e.m.kind) {
			case "exact":
				return `= ${there} (${pv})`;
			case "near":
				return `≈ ${there} (${pv})${how}`;
			case "sum":
				return e.m.mine.length > 1 || (e.m.subMine?.length ?? 0) > 1
					? `with ${cordList(e.m.subMine ?? e.m.mine.map((i) => l1[i]?.name ?? `p${i + 1}`))}, ${num(e.m.value)} = ${there} (${pv})`
					: `= ${there} added together (${pv})`;
			case "scaled":
				return `× ${+(e.m.partnerValue / (e.m.value || 1)).toFixed(3)} = ${there} (${pv})`;
			case "blank":
				return `blank, as is ${there}`;
			case "differ":
				return `≠ ${there} (${pv})${how}`;
			case "dropped":
				return e.m.value === 0
					? `blank here; ${there} holds ${pv}`
					: `${there} is blank`;
		}
	};

	const paint = (c: Cord): string | null => {
		const e = byName.get(c.name)?.[0];
		if (!e) return NO_THREAD_PAINT;
		return e.unexamined ? UNEXAMINED_PAINT : MATCH_PAINT[e.m.kind];
	};
	const emphasis = (c: Cord) => byName.has(c.name);
	const tooltip = (node: CordNode) => {
		const c = node.cord;
		const list = byName.get(c.name) ?? [];
		return (
			<>
				<div className="kd-tip-head">
					<strong>{c.name}</strong>
					<span>{c.value != null ? num(c.value) : "no value"}</span>
				</div>
				{list.length === 0 ? (
					<p className="kd-tip-notes">Not matched on any linked khipu.</p>
				) : (
					<ul className="match-tip">
						{list.map((e, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: one row per thread
							<li key={i}>
								<i
									style={{
										background: e.unexamined
											? UNEXAMINED_PAINT
											: MATCH_PAINT[e.m.kind],
									}}
								/>
								<span>
									{describe(e)}
									<small>
										{e.unexamined
											? "scan run, not yet examined"
											: THREAD_LABEL[e.m.kind]}
										{e.m.note ? ` · ${e.m.note}` : ""}
									</small>
								</span>
							</li>
						))}
					</ul>
				)}
			</>
		);
	};
	return { cords, kinds, paint, emphasis, tooltip };
}

function MatchKey({
	partners,
	aliases,
	kinds,
}: {
	partners: PartnerMatches[];
	aliases: Record<string, string>;
	kinds: Set<ThreadKind | "unexamined">;
}) {
	return (
		<div className="match-key">
			<div className="chart-legend">
				{KIND_ORDER.filter((k) => kinds.has(k)).map((k) => (
					<span key={k}>
						<i className="legend-rect" style={{ background: MATCH_PAINT[k] }} />
						{THREAD_LABEL[k]}
					</span>
				))}
				{kinds.has("unexamined") && (
					<span>
						<i
							className="legend-rect"
							style={{ background: UNEXAMINED_PAINT }}
						/>
						scan run, unexamined
					</span>
				)}
				<span>
					<i className="legend-rect" style={{ background: NO_THREAD_PAINT }} />
					no thread
				</span>
			</div>
			<ul className="match-partners">
				{partners.map((pm) => {
					// distinct cords of this khipu with a matching thread (a sum's
					// cords count one by one); field rules say what they compared
					const shared = new Set(
						pm.matches
							.filter((m) => MATCH_KINDS.has(m.kind))
							.flatMap((m) => m.subMine ?? m.mine.map(String)),
					).size;
					return (
						<li key={pm.key}>
							<Link to="/khipus/$id" params={{ id: pm.partner }}>
								{pm.partner}
							</Link>
							{aliases[pm.partner] !== pm.partner && (
								<span className="cell-muted"> {aliases[pm.partner]}</span>
							)}
							<span className="match-partner-rule">
								{pm.matches.length === 0
									? `${pm.rule}; no cord-for-cord rule`
									: pm.compared
										? `${pm.agree ?? 0} agree of ${pm.compared} compared · ${pm.rule}`
										: `${shared} matched cord${shared === 1 ? "" : "s"} · ${pm.rule}`}
							</span>
							{pm.unexamined ? (
								<span className="match-unexamined">
									unexamined run of {pm.longest}
								</span>
							) : (
								<Conf level={pm.level as "firm" | "likely" | "open"} />
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
