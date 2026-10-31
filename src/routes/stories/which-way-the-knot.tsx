import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import Figure from "#/components/charts/Figure";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import {
	Conf,
	type Layer,
	Layers,
	LayerTabs,
	Legend,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave from "#/components/story/StrandWeave";
import { getColors, getKhipus, readJson } from "#/lib/khipu/data";
import type { Cord } from "#/lib/khipu/types";
import {
	type CorpusMixedRow,
	copyDirections,
	cordDir,
	cordDirSL,
	type Dir,
	directionRuns,
	HALVES_ID,
	type KnotDirectionCorpus,
	profile,
	RULE_ID,
	recorderSummary,
	residual,
	ruleCounts,
	ruleText,
	SOURCE_ID,
	TYPE_LABEL,
	TYPES,
	zShare,
} from "#/lib/stories/knotdirection";
import { getStrands, type StrandThread } from "#/lib/stories/strands";
import "#/styles/stories/which-way-the-knot.css";

export const Route = createFileRoute("/stories/which-way-the-knot")({
	loader: async () => {
		const [khipus, colors, corpus, strands] = await Promise.all([
			getKhipus([RULE_ID, HALVES_ID, SOURCE_ID]),
			getColors(),
			readJson<KnotDirectionCorpus>("stories/knot-direction.json"),
			getStrands(),
		]);
		return {
			rule: khipus[RULE_ID],
			halves: khipus[HALVES_ID],
			source: khipus[SOURCE_ID],
			copyThreads: strands?.links[`${SOURCE_ID}|${HALVES_ID}`]?.threads ?? [],
			colors,
			corpus,
		};
	},
	head: () => ({ meta: [{ title: "Which way the knot — Khipu" }] }),
	component: WhichWayTheKnot,
});

/* S and Z take the two colours the other stories use for a binary; the knot
   glyphs lean the same way, so the direction is never colour alone. */
const INK: Record<Dir, string> = {
	Z: "var(--accent)",
	S: "var(--moiety-r)",
};
const DIR_LEGEND = [
	{ color: INK.Z, label: "Z — the strand crosses like the middle of a Z" },
	{ color: INK.S, label: "S — like the middle of an S" },
];

/** the weave draws only the figures the two khipus share, not the disagreements */
const onlyMatches = (t: StrandThread) =>
	t.kind === "exact" ? undefined : ("hidden" as const);

const OVERVIEW = { slot: 6, gap: 12, subOffset: 3, pxPerCm: 1.6, cordW: 1.6 };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const n = (x: number) => x.toLocaleString();

/**
 * Two cords with a knot each, tied the two ways. The single knot is a dot with
 * a scratch across it, the long knot a bar whose turns slope; both follow the
 * middle stroke of the letter, which is how the recording convention names
 * them (Ascher 1978, Urton 1994).
 */
function TwoWays() {
	const cord = "var(--ink-3)";
	const Cord = ({ x }: { x: number }) => (
		<line x1={x} y1={8} x2={x} y2={150} stroke={cord} strokeWidth={4} />
	);
	const Single = ({ x, dir }: { x: number; dir: Dir }) => {
		const y = 48;
		const s = dir === "S" ? 1 : -1;
		return (
			<g>
				<circle cx={x} cy={y} r={9} fill={INK[dir]} />
				<path
					d={`M${x - 5 * s} ${y - 5} L${x + 5 * s} ${y + 5}`}
					stroke="var(--surface)"
					strokeWidth={2.2}
					strokeLinecap="round"
				/>
			</g>
		);
	};
	const Long = ({ x, dir }: { x: number; dir: Dir }) => {
		const top = 84;
		const s = dir === "S" ? 1 : -1;
		return (
			<g>
				<rect x={x - 8} y={top} width={16} height={46} rx={3} fill={INK[dir]} />
				{[0, 1, 2, 3].map((i) => (
					<path
						key={i}
						d={`M${x - 8 - 3 * s} ${top + 8 + i * 10 + 4} L${x + 8 + 3 * s} ${top + 8 + i * 10 - 4}`}
						stroke="var(--surface)"
						strokeWidth={1.8}
					/>
				))}
			</g>
		);
	};
	return (
		<svg
			viewBox="0 0 360 170"
			className="wwk-twoways"
			role="img"
			aria-label="A single knot and a long knot tied S, beside the same knots tied Z"
		>
			<Cord x={70} />
			<Single x={70} dir="S" />
			<Long x={70} dir="S" />
			<text x={70} y={166} textAnchor="middle" className="wwk-svg-label">
				S
			</text>
			<text x={126} y={52} className="wwk-svg-note">
				single knot
			</text>
			<text x={126} y={110} className="wwk-svg-note">
				long knot, 4 turns
			</text>
			<Cord x={290} />
			<Single x={290} dir="Z" />
			<Long x={290} dir="Z" />
			<text x={290} y={166} textAnchor="middle" className="wwk-svg-label">
				Z
			</text>
		</svg>
	);
}

/** One split bar per knot type: the S share and the Z share of its clusters. */
function SplitBars({ table }: { table: KnotDirectionCorpus["table"] }) {
	return (
		<div className="wwk-split">
			{TYPES.map((t) => {
				const row = table[t];
				const z = zShare(row);
				return (
					<div className="wwk-split-row" key={t}>
						<div className="wwk-split-label">
							{TYPE_LABEL[t]}
							<small>{n(row.S + row.Z)} clusters</small>
						</div>
						<div
							className="wwk-split-bar"
							title={`${TYPE_LABEL[t]}: ${n(row.S)} S, ${n(row.Z)} Z`}
						>
							<span
								style={{
									width: `calc(${(1 - z) * 100}% - 1px)`,
									background: INK.S,
								}}
							>
								<b>S {pct(1 - z)}</b>
							</span>
							<span
								style={{ width: `calc(${z * 100}% - 1px)`, background: INK.Z }}
							>
								<b>Z {pct(z)}</b>
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

/**
 * Every mixed-direction khipu as a dot: how much of its direction the majority
 * alone explains (x) against how much knot type explains (y). Dots on the
 * diagonal gain nothing from type; dots at the top are wholly explained by it.
 */
function ExplainedPlot({
	rows,
	mark,
	hover,
	onHover,
}: {
	rows: CorpusMixedRow[];
	mark: Set<string>;
	hover: string | null;
	onHover: (id: string | null) => void;
}) {
	const W = 520;
	const H = 360;
	const L = 44;
	const B = 34;
	const x0 = 0.5;
	const sx = (v: number) => L + ((v - x0) / (1 - x0)) * (W - L - 12);
	const T = 26;
	const sy = (v: number) => T + (1 - (v - x0) / (1 - x0)) * (H - B - T);
	const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
	const hovered = rows.find((r) => r.id === hover);
	return (
		<div className="wwk-plot-wrap">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="wwk-plot"
				role="img"
				aria-label="Scatter of 166 khipus: share of knot directions explained by the majority direction against share explained by knot type"
			>
				{ticks.map((t) => (
					<g key={t}>
						<line
							x1={L}
							x2={W - 12}
							y1={sy(t)}
							y2={sy(t)}
							className="wwk-grid"
						/>
						<text x={L - 6} y={sy(t) + 3} textAnchor="end" className="wwk-tick">
							{pct(t)}
						</text>
						<text
							x={sx(t)}
							y={H - B + 16}
							textAnchor="middle"
							className="wwk-tick"
						>
							{pct(t)}
						</text>
					</g>
				))}
				<line
					x1={sx(0.5)}
					y1={sy(0.5)}
					x2={sx(1)}
					y2={sy(1)}
					className="wwk-diag"
				/>
				<line
					x1={L}
					x2={W - 12}
					y1={sy(0.95)}
					y2={sy(0.95)}
					className="wwk-thresh"
				/>
				<text x={L + 4} y={sy(0.95) + 12} className="wwk-tick">
					95 % explained by type
				</text>
				<text x={sx(0.8) + 8} y={sy(0.8) + 4} className="wwk-tick">
					on the diagonal, type adds nothing
				</text>
				<text x={L} y={12} className="wwk-axis">
					share explained by knot type ↑
				</text>
				<text x={W - 12} y={H - 4} textAnchor="end" className="wwk-axis">
					by majority direction alone
				</text>
				{rows.map((r) => {
					const marked = mark.has(r.id);
					const isHover = hover === r.id;
					return (
						<circle
							key={r.id}
							cx={sx(Math.max(x0, r.baseline))}
							cy={sy(Math.max(x0, r.explained))}
							r={marked || isHover ? 6 : 4}
							className={`wwk-dot ${marked ? "is-marked" : ""} ${isHover ? "is-hover" : ""}`}
							onPointerEnter={() => onHover(r.id)}
							onPointerLeave={() => onHover(null)}
						>
							<title>
								{r.id} {r.aliases.join("/")} · {r.n} clusters · type explains{" "}
								{pct(r.explained)}, majority {pct(r.baseline)}
							</title>
						</circle>
					);
				})}
			</svg>
			<div className="wwk-plot-caption" aria-live="polite">
				{hovered ? (
					<>
						<strong>{hovered.id}</strong> {hovered.aliases.join(" · ")} ·{" "}
						{hovered.recorder} · {n(hovered.n)} clusters · rule{" "}
						{ruleText(hovered.rule)} · type explains {pct(hovered.explained)},
						majority alone {pct(hovered.baseline)}
					</>
				) : (
					<>Hover a dot for the khipu. Ringed dots are KH0450 and KH0285.</>
				)}
			</div>
		</div>
	);
}

type HalvesLayer = "direction" | "recorded";

function WhichWayTheKnot() {
	const { rule, halves, source, copyThreads, colors, corpus } =
		Route.useLoaderData();
	const copy = useMemo(
		() => copyDirections(source, halves, copyThreads),
		[source, halves, copyThreads],
	);
	const dirsById = useMemo(() => {
		const l1 = (cs: Cord[]) =>
			cs
				.filter((c) => c.level === 1)
				.sort((a, b) => a.ordinal - b.ordinal)
				.map(cordDirSL);
		return new Map([
			[SOURCE_ID, l1(source.cords)],
			[HALVES_ID, l1(halves.cords)],
		]);
	}, [source, halves]);
	const weaveColor = useCallback(
		(id: string, i: number) => {
			const d = dirsById.get(id)?.[i];
			return d ? INK[d] : undefined;
		},
		[dirsById],
	);
	const [layer, setLayer] = useState<HalvesLayer>("direction");
	const [hover, setHover] = useState<string | null>(null);

	const ruleProfile = useMemo(() => profile(rule), [rule]);
	const halvesProfile = useMemo(() => profile(halves), [halves]);
	const runs = useMemo(() => directionRuns(halves), [halves]);
	const rules = useMemo(() => ruleCounts(corpus.mixed), [corpus]);
	const resid = useMemo(() => residual(corpus.mixed), [corpus]);
	const recorders = useMemo(() => recorderSummary(corpus.recorders), [corpus]);
	const table = corpus.table;
	const totalClusters = TYPES.reduce((a, t) => a + table[t].S + table[t].Z, 0);
	const mixed = corpus.mixed.length;
	const marks = useMemo(() => new Set([RULE_ID, HALVES_ID]), []);
	const halvesCords = halves.cords.filter((c) => c.level === 1).length;
	const bigRuns = runs.filter((r) => r.n >= 5);

	const paintDir = (c: Cord): string | null => {
		const d = cordDir(c);
		return d ? INK[d] : null;
	};
	const rulePaint = (c: Cord): string | null => {
		// on KH0450 the cord's direction is its knot type: units-only cords S, tens-and-above Z
		const d = cordDir(c);
		return d ? INK[d] : null;
	};

	const layers: Layer[] = [
		{
			title: "Observed",
			body: (
				<>
					{n(totalClusters)} knot clusters in {corpus.nKhipus} khipus carry a
					direction reading. Single knots are Z in {pct(zShare(table.S))} of
					cases, figure-eights in {pct(zShare(table.E))}, long knots in{" "}
					{pct(zShare(table.L))}. In {corpus.explained95} of the {mixed} khipus
					that mix directions, knowing the knot type predicts the direction of
					at least 95 % of clusters; the majority direction alone does so in{" "}
					{corpus.baseline95}.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					On most khipus that mix S and Z, the pattern is consistent with one
					maker tying two knot types with two motions (a long knot wrapped, a
					single knot tied over), each producing a fixed direction. On those
					khipus direction does not look like a free choice. Any directional
					sign would have to be in the {resid.length} khipus with at least 15 %
					of clusters against their type's rule.
				</>
			),
			level: "likely",
		},
		{
			title: "Context",
			body: (
				<>
					The per-khipu rule tracks the recorder: Urton's khipus are Z/Z, S/S or
					Z/S in near-equal numbers, Pereyra's mostly Z/Z, Quave's mostly S/S,
					Clindaniel's almost all Z. Part of that is the collections each
					recorded; part may be the convention each applied to the same knot. In
					the Santa Valley khipus, where a binary has been read as moiety, it is
					in how the cord is attached, not in knot direction.
				</>
			),
			level: "likely",
		},
		{
			title: "Interpretation",
			body: (
				<>
					Whether the residual carries meaning is open. KH0285 changes direction
					once, at a cord boundary, consistent with a change of hand or session;
					KH0280 switches on whole cords of a tally-style khipu. We found no
					khipu that flips direction cord by cord within a group in a way that
					follows colour, position or value once knot type is accounted for.
				</>
			),
			level: "open",
		},
	];

	return (
		<StoryPage
			kicker="Corpus · knot direction"
			title="Which way the knot"
			standfirst={
				<>
					Every khipu knot can be tied in one of two mirror-image ways, and
					since the 1990s the choice has been proposed as a possible binary
					sign. Across {n(totalClusters)} recorded knot clusters, direction
					mostly follows the kind of knot. In {corpus.explained95} of the{" "}
					{mixed} khipus that mix the two directions, knot type (single, long or
					figure-eight) predicts the direction of at least 95 % of clusters.
				</>
			}
			meta={
				<>
					<span>
						Corpus: {corpus.nKhipus} khipus in the Khipu Field Guide release of
						17 September 2026
					</span>
					<span>
						Exhibits:{" "}
						<Link to="/khipus/$id" params={{ id: RULE_ID }}>
							{rule.aliases.join(" · ")} · {RULE_ID}
						</Link>{" "}
						(Berlin, Pachacamac) and{" "}
						<Link to="/khipus/$id" params={{ id: HALVES_ID }}>
							{halves.aliases.join(" · ")} · {HALVES_ID}
						</Link>{" "}
						(Lima, Banco Central)
					</span>
					<span>
						Figures from scripts/knot_direction_by_type.py; a parallel analysis
						in scripts/nonnumeric/ reaches a consistent result from the recorder
						side
					</span>
				</>
			}
		>
			<div className="wwk-story">
				<Step n={1} title="Two ways to tie the same knot">
					<Prose>
						<p>
							A khipu knot is either an overhand knot (a single knot, worth ten,
							a hundred or a thousand by its height on the cord), a long knot
							(the units two to nine, counted in turns) or a figure-eight (one).
							Each can be tied in two mirror-image ways. Following the textile
							convention for yarn, recorders name them after the letters S and
							Z: the crossing strand of an S knot runs like the middle stroke of
							an S, a Z knot like the middle of a Z. The Aschers recorded
							direction from the 1970s; Gary Urton made it systematic in 1994.
						</p>
					</Prose>
					<Wide caption="The same two knots tied S (left) and Z (right). On the diagrams in this site a single knot's dot carries a scratch in the cord colour, a long knot's turns slope, both following the letter.">
						<div className="wwk-twoways-wrap">
							<TwoWays />
						</div>
					</Wide>
				</Step>

				<Step n={2} title="The hypothesis: a binary sign">
					<Prose>
						<p>
							In <em>Signs of the Inka Khipu</em> (2003) Urton set out seven
							binary choices a khipu maker faced at every cord (fibre, spin and
							ply of the thread, how the cord hangs on the primary, colour
							order, and the direction of each knot) and argued that together
							they had the capacity of a code, in which knot direction could
							mark a category as attachment marks one at Santa. Marcia Ascher
							(2005) asked how spin, ply and knot direction could contribute and
							found, on her smaller set, that direction mostly ran one way
							within a khipu. The corpus is now about three times the size she
							had, so we ask: when a khipu mixes S and Z knots, what does the
							choice track?
						</p>
					</Prose>
				</Step>

				<Step n={3} title="Direction follows the kind of knot">
					<Prose>
						<p>
							Pooled over the corpus, single knots and figure-eights lean Z (
							{pct(zShare(table.S))} and {pct(zShare(table.E))}); long knots
							split almost evenly ({pct(zShare(table.L))} Z). A sign chosen
							freely would not be expected to depend on knot type, since all
							three are tied on the same cords.
						</p>
					</Prose>
					<Wide>
						<Figure
							title="Direction by knot type, whole corpus"
							note={`${n(totalClusters)} knot clusters with a recorded direction, ${corpus.nKhipus} khipus. Expanding single-knot clusters to their individual knots moves the single-knot Z share to 71 %.`}
							table={{
								head: ["knot type", "S", "Z", "Z share"],
								rows: TYPES.map((t) => [
									TYPE_LABEL[t],
									table[t].S,
									table[t].Z,
									pct1(zShare(table[t])),
								]),
							}}
						>
							<Legend items={DIR_LEGEND} />
							<SplitBars table={table} />
						</Figure>
					</Wide>
					<Prose>
						<p>
							Within single khipus the split is sharper. {mixed} khipus have at
							least 40 direction readings and at least eight of each direction,
							enough to test a directional sign. For each, take the majority
							direction of each knot type as that khipu's rule and count the
							clusters that obey it. In {corpus.explained95} of the {mixed}, at
							least 95 % do; the majority direction alone reaches 95 % in{" "}
							{corpus.baseline95}. In {corpus.explained90} the rule explains at
							least 90 %. The commonest rules are {rules[0].rule} ({rules[0].n}{" "}
							khipus), {rules[1].rule} ({rules[1].n}) and its mirror{" "}
							{rules[2].rule} ({rules[2].n}): long knots one way, single knots
							the same or the other way, figure-eights with the singles.
						</p>
					</Prose>
					<Wide
						caption={`Each dot is one of the ${mixed} mixed-direction khipus. On the diagonal, knot type adds nothing to the majority direction; most dots sit near the top edge. Hover for the khipu; the corpus figures are in the JSON the page loads.`}
					>
						<Legend
							items={[
								{ color: "var(--ink-3)", label: "one khipu" },
								{ color: "var(--accent)", label: "KH0450 and KH0285, below" },
							]}
						/>
						<ExplainedPlot
							rows={corpus.mixed}
							mark={marks}
							hover={hover}
							onHover={setHover}
						/>
					</Wide>
				</Step>

				<Step n={4} title="A rule khipu">
					<Prose>
						<p>
							KH0450 (UR212), one of the two Berlin Pachacamac khipus behind the
							Basel fragments, records {n(ruleProfile.n)} directed knot
							clusters, {ruleProfile.S} S and {ruleProfile.Z} Z, close to an
							even mix. Its rule is {ruleText(ruleProfile.rule)}, and{" "}
							{ruleProfile.explained === 1
								? "every cluster obeys it"
								: `${pct(ruleProfile.explained)} of clusters obey it`}
							. Colouring cords by knot direction therefore sorts them by value:
							a cord under ten has only a long knot and is S; a cord of ten or
							more has a single knot and is Z. Here the S/Z split coincides with
							the decimal place.
						</p>
					</Prose>
					<Wide caption="KH0450 with each cord coloured by the majority direction of its knots. Hover a cord to read it.">
						<Legend items={DIR_LEGEND} />
						<KhipuDiagram
							khipu={rule}
							colors={colors}
							layout={OVERVIEW}
							paint={rulePaint}
							showGroups
							fit
						/>
					</Wide>
					<Wide>
						<Figure
							title="KH0450, clusters by type and direction"
							table={{
								head: ["knot type", "S", "Z"],
								rows: TYPES.map((t) => [
									TYPE_LABEL[t],
									ruleProfile.byType[t].S,
									ruleProfile.byType[t].Z,
								]),
							}}
						>
							<table className="wwk-table">
								<thead>
									<tr>
										<th>knot type</th>
										<th className="num">S</th>
										<th className="num">Z</th>
										<th>rule</th>
									</tr>
								</thead>
								<tbody>
									{TYPES.map((t) => (
										<tr key={t}>
											<td>{TYPE_LABEL[t]}</td>
											<td className="num">{ruleProfile.byType[t].S}</td>
											<td className="num">{ruleProfile.byType[t].Z}</td>
											<td>
												<span
													className="wwk-swatch"
													style={{
														background: INK[ruleProfile.rule[t] ?? "Z"],
													}}
												/>
												{ruleProfile.rule[t]}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Figure>
					</Wide>
				</Step>

				<Step n={5} title="Where direction still varies">
					<Prose>
						<p>
							Take the clusters that go against their type's rule as the
							residual. {resid.length} khipus have 15 % or more of their
							clusters in the residual; these are where a directional sign could
							survive, and the appropriate test set for the hypothesis. The most
							extreme is KH0285 (UR053C), a single group of {halvesCords} cords
							in the Banco Central collection in Lima, with {halvesProfile.S} S
							and {halvesProfile.Z} Z clusters and no type rule: type explains{" "}
							{pct(halvesProfile.explained)}, the same as the majority.
						</p>
						<p>
							Cord by cord, it does not look like a per-cord code. Direction
							runs in blocks along the primary:{" "}
							{bigRuns
								.map((r) => `${r.n} cords ${r.dir} (p${r.from}–p${r.to})`)
								.join(", then ")}
							, with {runs.length - bigRuns.length} stray cords of one or two
							between them. Every knot type switches together at each block
							boundary, and the blocks do not follow colour or value. The
							parallel analysis found the same pattern on the ~40 khipus whose
							long knots change direction at all, consistent with production
							episodes (a second sitting or a second hand) rather than a sign
							tied cord by cord.
						</p>
					</Prose>
					<Wide
						caption={
							layer === "direction"
								? `KH0285 coloured by the direction of each cord's knots: ${bigRuns.map((r) => `${r.n} cords ${r.dir}`).join(", then ")}.`
								: "KH0285 as recorded: the cord colours, with the knot marks leaning by direction."
						}
					>
						<LayerTabs
							value={layer}
							onChange={setLayer}
							options={[
								{ value: "direction", label: "Knot direction" },
								{ value: "recorded", label: "As recorded" },
							]}
						/>
						{layer === "direction" && <Legend items={DIR_LEGEND} />}
						<KhipuDiagram
							khipu={halves}
							colors={colors}
							layout={{ ...OVERVIEW, slot: 9, pxPerCm: 2.2 }}
							paint={layer === "direction" ? paintDir : undefined}
							tooltip={layer === "recorded"}
							fit
						/>
					</Wide>
					{copy.flipped.length > 0 && (
						<>
							<Prose>
								<p>
									One example shows the same thing from another side. KH0285 is
									not an original: it is the retied copy of KH0284 (UR053B),
									whose values reappear on it in order, with the source's
									subsidiaries tied as pendants of their own (see{" "}
									<Link to="/stories/totals-that-travel">
										Totals that travel
									</Link>
									). One person recorded both, so the recorder cannot explain a
									difference between them. Of the {copy.threads.length} figures
									the two share, {copy.flipped.length} (the source's{" "}
									{copy.sourceFrom} to {copy.sourceTo}, {copy.flippedSubs} of
									them from subsidiaries) are tied S on the source and Z on the
									copy: all {copy.clusters.source.S} of their single and long
									knots S on one, all {copy.clusters.copy.Z} Z on the other. The
									other {copy.same.length} are S on both. The switch does not
									follow the copied passage: the copy begins inside its S block,
									and the Z block ends partway through the copied figures. The
									same numbers were tied in the other direction when they were
									tied again, and the change falls where a new stretch of work
									begins, not where the content changes. It is one pair, and the
									copy also changed how the cords hang, so it illustrates the
									block reading rather than testing it.{" "}
									<Conf level="likely">Direction changed on retying</Conf>
								</p>
							</Prose>
							<Wide
								caption={`KH0284 above, its copy KH0285 below, each cord coloured by the direction of its single and long knots; a thread joins each figure the two share. ${copy.flipped.length} source figures tied S reappear tied Z (${copy.copyFrom}–${copy.copyTo} on the copy). Same recorder for both.`}
							>
								<Legend items={DIR_LEGEND} />
								<StrandWeave
									top={[SOURCE_ID]}
									bottom={[HALVES_ID]}
									variant="hero"
									cordColor={weaveColor}
									emphasis={onlyMatches}
									caption={false}
								/>
							</Wide>
						</>
					)}
					<Wide caption="The residual, ranked: khipus with at least 15 % of clusters against their own type rule. Slot-in-group is the position of the deviant cords' first slot where it is concentrated.">
						<div className="wwk-scroll">
							<table className="wwk-table">
								<thead>
									<tr>
										<th>khipu</th>
										<th>recorder</th>
										<th className="num">clusters</th>
										<th className="num">S</th>
										<th className="num">Z</th>
										<th>type rule</th>
										<th className="num">explained</th>
										<th className="num">against rule</th>
									</tr>
								</thead>
								<tbody>
									{resid.map((r) => (
										<tr
											key={r.id}
											className={hover === r.id ? "is-hover" : undefined}
											onPointerEnter={() => setHover(r.id)}
											onPointerLeave={() => setHover(null)}
										>
											<td>
												<Link to="/khipus/$id" params={{ id: r.id }}>
													{r.id}
												</Link>{" "}
												<small>{r.aliases.join(" · ")}</small>
											</td>
											<td>{r.recorder}</td>
											<td className="num">{r.n}</td>
											<td className="num">{r.S}</td>
											<td className="num">{r.Z}</td>
											<td>{ruleText(r.rule)}</td>
											<td className="num">{pct(r.explained)}</td>
											<td className="num">{pct(r.deviant)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							Two caveats. KH0280 (UR050) and KH0099 (AS086) switch direction on
							whole cords, but every group on them is a single cord, so the
							position "slot 1" says nothing; KH0280 belongs to a family of
							camelid-fibre khipus whose cords carry only long knots of three to
							nine turns, whose decimal values in the Field Guide are sums of
							tally turns, and which the{" "}
							<Link to="/stories/knots-that-are-not-decimal">
								non-decimal survey
							</Link>{" "}
							treats on its own terms. KH0607 (QU019), also on the list, is the
							one khipu where the parallel analysis found direction tracking the
							recto/verso attachment of the cord.
						</p>
					</Prose>
				</Step>

				<Step n={6} title="The recorder in the record">
					<Prose>
						<p>
							A direction reading is made by a person turning a cord in the
							hand, and the corpus was recorded by a dozen people over fifty
							years. Grouping every khipu with at least twenty readings by
							recorder and by its single-knot / long-knot rule shows large
							differences between recorders: Urton's{" "}
							{recorders.find((r) => r.recorder === "Urton")?.khipus} khipus
							divide between Z/Z, S/S and Z/S; Pereyra's are Z/Z in{" "}
							{recorders.find((r) => r.recorder === "Pereyra")?.zz} of{" "}
							{recorders.find((r) => r.recorder === "Pereyra")?.khipus}; Quave's
							are S/S in {recorders.find((r) => r.recorder === "Quave")?.ss} of{" "}
							{recorders.find((r) => r.recorder === "Quave")?.khipus}. The share
							of single knots read as Z runs from{" "}
							{pct(Math.min(...recorders.map((r) => r.zShareSingles)))} to{" "}
							{pct(Math.max(...recorders.map((r) => r.zShareSingles)))} between
							recorders. Some of that may reflect the different collections each
							recorded, and some the convention each applied to the same knot.
							Either way, direction should be analysed within one recorder
							before comparing across them.
						</p>
					</Prose>
					<Wide caption="Recorders with at least ten khipus of twenty or more direction readings. The rule is the majority direction of single knots / long knots on each khipu.">
						<div className="wwk-scroll">
							<table className="wwk-table">
								<thead>
									<tr>
										<th>recorder</th>
										<th className="num">khipus</th>
										<th className="num">Z / Z</th>
										<th className="num">S / S</th>
										<th className="num">Z / S</th>
										<th className="num">S / Z</th>
										<th className="num">single knots read Z</th>
									</tr>
								</thead>
								<tbody>
									{recorders.map((r) => (
										<tr key={r.recorder}>
											<td>{r.recorder}</td>
											<td className="num">{r.khipus}</td>
											<td className="num">{r.zz}</td>
											<td className="num">{r.ss}</td>
											<td className="num">{r.zs}</td>
											<td className="num">{r.sz}</td>
											<td className="num">
												<span className="wwk-bar-cell">
													<i
														style={{
															width: `${r.zShareSingles * 100}%`,
															background: INK.Z,
														}}
													/>
													{pct(r.zShareSingles)}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
				</Step>

				<Step n={7} title="What this does and does not say">
					<Prose>
						<p>
							This does not show that knot direction never meant anything. It
							shows that on most khipus direction largely follows knot type, so
							a count of S and Z knots is mostly a count of knot types, and any
							test of direction as a sign should use the residual, within one
							recorder, with knot type held fixed. The recto/verso attachment
							that divides the Santa Valley groups into moieties is a different
							channel, not addressed here.
						</p>
						<p>
							Ascher's 2005 paper reached a cautious version of the same
							conclusion from the khipus she and Robert Ascher recorded; her
							tables should be compared with these before the corpus figure is
							presented as new. The nL+E compound and rare knot types are
							covered in the non-decimal survey.
						</p>
					</Prose>
					<Layers heading="The four layers of this reading" layers={layers} />
					<Prose>
						<p>
							<Conf level="firm">Corpus fact</Conf>{" "}
							<Conf level="likely">Not a free sign in most khipus</Conf>{" "}
							<Conf level="open">Any coding in the residual</Conf>
						</p>
					</Prose>
				</Step>

				<Sources
					items={[
						{
							who: "Urton, G.",
							what: "A new twist in an old yarn: variation in knot directionality in the Inka khipus",
							where: "Baessler-Archiv 42 (1994), 271–305",
						},
						{
							who: "Urton, G.",
							what: "Signs of the Inka Khipu: Binary Coding in the Andean Knotted-String Records",
							where: "University of Texas Press, 2003",
						},
						{
							who: "Ascher, M.",
							what: "How can spin, ply, and knot direction contribute to understanding the quipu code?",
							where:
								"Latin American Antiquity 16(1), 2005, 99–111 — to be compared with the corpus figures here",
						},
						{
							who: "Medrano, M. & Urton, G.",
							what: "Toward the decipherment of a set of mid-colonial khipus from the Santa Valley",
							where:
								"Ethnohistory 65(1), 2018 — the recto/verso moiety reading",
						},
						{
							who: "FitzPatrick, M.",
							what: "Knot tricks: what mathematical knot theory can reveal about the structure of khipu knot encoding",
							where: "Latin American Antiquity, 2026",
						},
						{
							who: "This project",
							what: "scripts/knot_direction_by_type.py --json and scripts/nonnumeric/le_compound_and_direction.py",
							where:
								"Khipu Field Guide data as released 17 September 2026; figures recomputed 19 September 2026",
						},
					]}
				/>
			</div>
		</StoryPage>
	);
}
