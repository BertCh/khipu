import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CordReader from "#/components/story/CordReader";
import { LayoutStrip, TemplateGrid } from "#/components/story/Kh0135Stages";
import { Chip } from "#/components/story/Ledger";
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
import { hexFor, nameFor } from "#/lib/khipu/colors";
import {
	getColors,
	getCorpus,
	getKhipuIndex,
	getKhipus,
} from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { sliceKhipu } from "#/lib/stories/derive";
import "#/styles/stories/colour-without-numbers.css";
import {
	BLOCK,
	bigKhipus,
	blockLengthsByPosition,
	blockOfGroup,
	blockRows,
	blockSpans,
	brokenCords,
	COMPARISON_ID,
	codeCounts,
	coincidenceTest,
	colourCounts,
	forDrawing,
	groupSizeRuns,
	KHIPU_ID,
	knotDensityRank,
	knotHeightsByPosition,
	knotSummary,
	knotTypesByPosition,
	knottedByColour,
	knottedByPosition,
	knottedCords,
	knottedShare,
	knottedUnits,
	layoutSummary,
	lengthStats,
	measuredAreKnottedUnits,
	measuredCords,
	N_BLOCKS,
	oneIn,
	pAllOnColour,
	pairing,
	pWithinTwoUnits,
	TAIL_WIDTH_CM,
	TEMPLATE,
	TRIAD_SIBLINGS,
	TRIAD_WIDTH_CM,
	tailColourRuns,
	tailDecimal,
	tailGroups,
	tailOfGroup,
	tailSpans,
	templateCheck,
	triadPatterns,
	triadShare,
	triadSumTest,
} from "#/lib/stories/kh0135";

const SIBLING_ID = TRIAD_SIBLINGS[0];

export const Route = createFileRoute("/stories/colour-without-numbers")({
	loader: async () => {
		const [khipus, colors, index, corpus] = await Promise.all([
			getKhipus([KHIPU_ID, SIBLING_ID, COMPARISON_ID]),
			getColors(),
			getKhipuIndex(),
			getCorpus(),
		]);
		return {
			khipu: khipus[KHIPU_ID],
			sibling: khipus[SIBLING_ID] ?? null,
			comparison: khipus[COMPARISON_ID] ?? null,
			colors,
			index,
			corpus,
		};
	},
	head: () => ({ meta: [{ title: "Colour without numbers — Khipu" }] }),
	component: ColourWithoutNumbers,
});

type OverviewLayer = "recorded" | "blocks" | "knots";

const OVERVIEW = { slot: 8, gap: 14, subOffset: 4, pxPerCm: 2.6, cordW: 1.8 };
/** How many of the last blocks the overview diagram draws beside the ten seven-cord groups. */
const OVERVIEW_BLOCKS = 2;
const DETAIL = { slot: 13, gap: 22, subOffset: 5, pxPerCm: 3.2, cordW: 2.2 };
const SIBLING = { slot: 12, gap: 18, subOffset: 4, pxPerCm: 2.2, cordW: 2.2 };

const fmt = (x: number, d = 1) =>
	Number.isInteger(x) ? String(x) : x.toFixed(d);
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)} %`;
const list = (xs: (number | string)[]) => xs.join(", ");
const either = (xs: (number | string)[]) =>
	xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function knotsText(c: Cord) {
	return c.knots.map((k) => `${k.n}${k.type} at ${k.pos} cm`).join(", ");
}

function cordNamed(khipu: Khipu, name: string): Cord {
	const c = khipu.cords.find((x) => x.name === name);
	if (!c) throw new Error(`${khipu.id} has no cord ${name}`);
	return c;
}

function ColourWithoutNumbers() {
	const { khipu, sibling, comparison, colors, index, corpus } =
		Route.useLoaderData();
	const [layer, setLayer] = useState<OverviewLayer>("recorded");

	const runs = useMemo(() => groupSizeRuns(khipu), [khipu]);
	const tc = useMemo(() => templateCheck(khipu), [khipu]);
	const colours = useMemo(() => colourCounts(khipu), [khipu]);
	const tailRuns = useMemo(() => tailColourRuns(khipu), [khipu]);
	const ks = useMemo(() => knotSummary(khipu), [khipu]);
	const knotted = useMemo(() => knottedCords(khipu), [khipu]);
	const units = useMemo(() => knottedUnits(khipu), [khipu]);
	const share = useMemo(() => knottedShare(khipu), [khipu]);
	const lay = useMemo(() => layoutSummary(khipu), [khipu]);
	const spans = useMemo(() => blockSpans(khipu), [khipu]);
	const tails = useMemo(() => tailSpans(khipu), [khipu]);
	const measured = useMemo(() => measuredCords(khipu), [khipu]);
	const broken = useMemo(() => brokenCords(khipu), [khipu]);
	const twist = useMemo(() => codeCounts(khipu, "twist"), [khipu]);
	const attach = useMemo(() => codeCounts(khipu, "attach"), [khipu]);
	const term = useMemo(() => codeCounts(khipu, "term"), [khipu]);
	const drawing = useMemo(() => forDrawing(khipu), [khipu]);
	const overview = useMemo(
		() =>
			sliceKhipu(
				drawing.khipu,
				(c) =>
					blockOfGroup(c.group ?? -1) >= N_BLOCKS - OVERVIEW_BLOCKS ||
					tailOfGroup(c.group ?? -1) >= 0,
			),
		[drawing],
	);
	const pTwo = useMemo(() => pWithinTwoUnits(khipu), [khipu]);
	const coincidence = useMemo(() => coincidenceTest(khipu), [khipu]);
	const rank = useMemo(() => knotDensityRank(index, khipu.id), [index, khipu]);
	const big = useMemo(() => bigKhipus(index), [index]);

	// the knotted units are derived, not assumed: the one block and the one
	// tail group that carry any knot
	const b = (units.blocks[0] ?? 1) - 1;
	const j = (units.tails[0] ?? 1) - 1;
	const rows = useMemo(() => blockRows(khipu, b), [khipu, b]);
	const byPos = useMemo(() => knottedByPosition(khipu, b), [khipu, b]);
	const byColour = useMemo(() => knottedByColour(khipu, b), [khipu, b]);
	const pColour = useMemo(
		() => pAllOnColour(khipu, b, TEMPLATE[0]),
		[khipu, b],
	);
	const sumTest = useMemo(() => triadSumTest(khipu, b), [khipu, b]);
	const types = useMemo(() => knotTypesByPosition(khipu, b), [khipu, b]);
	const heights = useMemo(() => knotHeightsByPosition(khipu, b), [khipu, b]);
	const lens = useMemo(() => blockLengthsByPosition(khipu, b), [khipu, b]);
	const decimal = useMemo(() => tailDecimal(khipu, j), [khipu, j]);
	const pair = useMemo(() => pairing(khipu, b, j), [khipu, b, j]);
	const measuredOk = useMemo(
		() => measuredAreKnottedUnits(khipu, b, j),
		[khipu, b, j],
	);
	const tailLens = useMemo(() => lengthStats(tailGroups(khipu)[j]), [khipu, j]);
	const detail = useMemo(
		() =>
			sliceKhipu(
				khipu,
				(c) =>
					blockOfGroup(c.group ?? -1) === b || tailOfGroup(c.group ?? -1) === j,
			),
		[khipu, b, j],
	);

	const sib = useMemo(
		() =>
			sibling
				? {
						share: knottedShare(sibling),
						triads: triadShare(sibling),
						patterns: triadPatterns(sibling),
						max: sibling.stats.maxValue,
					}
				: null,
		[sibling],
	);
	const cmp = useMemo(
		() =>
			comparison
				? {
						share: knottedShare(comparison),
						groups: comparison.groups.length,
						colours: colourCounts(comparison),
					}
				: null,
		[comparison],
	);

	const triadsOfSelf = triadShare(khipu);
	const whiteCol = byColour.find((c) => c.code === TEMPLATE[0]);
	const brownCol = byColour.find((c) => c.code === TEMPLATE[1]);
	const sub = knotted.find((r) => r.where === "subsidiary");
	const firstValues = rows.map((r) => r.values[0]);
	const lastValues = rows.map((r) => r.values[r.values.length - 1]);
	const sums = rows.map((r) => r.values[0] + r.values[r.values.length - 1]);
	const eights = types[0].E ?? 0;
	const pos1Knotted = byPos[0];
	const lengthNote = khipu.cords.find((c) => c.notes)?.notes ?? "";
	const p1 = cordNamed(khipu, rows[0].cords[0].name);
	const p3 = cordNamed(khipu, rows[0].cords[2].name);
	const twoDigit = decimal.filter((d) => d.tens > 0);
	const tensOnly = decimal.find((d) => d.tens > 0 && d.units === 0);
	const totalKnots = khipu.stats.nKnots;
	const tailSection = tails[tails.length - 1];
	const tailEnd = tailSection.end;
	const primaryLen = khipu.primary.length ?? 0;
	const gapIrregular = lay.gaps.filter((g) => !Number.isInteger(g * 2));
	const measuredPendants = measured.filter((c) => c.level === 1).length;
	// the block's modal triad, e.g. 1·0·4, and the triads written otherwise
	const modalTriad = (() => {
		const m = new Map<string, number>();
		for (const r of rows) {
			const key = r.values.join("·");
			m.set(key, (m.get(key) ?? 0) + 1);
		}
		return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
	})();
	const offFormula = rows.filter((r) => r.values.join("·") !== modalTriad);
	const sumDeviants = rows.filter(
		(r) => r.values[0] + r.values[r.values.length - 1] !== sumTest.target,
	);
	// knot heights inside the knotted seven-cord group, tens and units apart
	const tailTens = decimal.flatMap((d) =>
		d.cord.knots.filter((k) => k.type === "S").map((k) => k.pos),
	);
	const tailUnits = decimal.flatMap((d) =>
		d.cord.knots.filter((k) => k.type !== "S").map((k) => k.pos),
	);
	const range = (xs: number[]) =>
		xs.length ? `${fmt(Math.min(...xs))} to ${fmt(Math.max(...xs))} cm` : "";

	const groupBand = (g: GroupBox): string | null => {
		if (layer !== "blocks") return null;
		const bl = blockOfGroup(g.index);
		const k = bl >= 0 ? bl : tailOfGroup(g.index);
		return k % 2 === 0 ? "var(--band-a)" : "var(--band-b)";
	};
	const groupLabel = (g: GroupBox): string | null => {
		if (layer !== "blocks") return null;
		const bl = blockOfGroup(g.index);
		if (bl >= 0) return g.index % BLOCK === 0 ? `Block ${bl + 1}` : null;
		return `${tailOfGroup(g.index) + 1}`;
	};
	const emphasis = (c: Cord) => layer !== "knots" || c.knots.length > 0;
	const ring = (c: Cord) =>
		layer === "knots" && c.knots.length > 0 ? "var(--accent)" : null;

	return (
		<StoryPage
			kicker="Berlin, from Pachacamac"
			title="Colour without numbers"
			standfirst={
				<>
					A khipu in Berlin, collected at Pachacamac before 1907, carries{" "}
					{khipu.stats.nCords} cords and almost no knots. Seventy three-cord
					groups, every one white, brown, white, stand in ten blocks of seven;
					ten groups of seven brown cords follow. Only {share.knotted} cords are
					tied, all of them in the last block and the last group. The layout is
					clear; what it recorded is not known.
				</>
			}
			meta={
				<>
					<span>
						Object:{" "}
						<Link to="/khipus/$id" params={{ id: khipu.id }}>
							{khipu.aliases.join(" · ")} · {khipu.id}
						</Link>
					</span>
					<span>
						Ethnologisches Museum, Berlin, V A 42538 (Gretzer collection,
						1906–07)
					</span>
					<span>
						Recorded by Marcia and Robert Ascher, Databook 1978; seen by Gary
						Urton
					</span>
				</>
			}
		>
			<div className="story-cwn">
				<Step n={1} title="Recorded in two footnotes">
					<Prose>
						<p>
							Berlin's V A 42538 came to the Ethnologisches Museum with the
							Wilhelm Gretzer collection, bought in 1906 and 1907 with Julius
							van der Zypen's money and labelled Pachacamac. The museum's record
							dates it Inka, 1400–1550, calls it a fragment, and gives its
							extent as 43 by 162 cm. The Aschers published it in 1978 as AS121.
							The Open Khipu Repository files it as UR1121, which is the
							repository's number for every Ascher khipu rather than a sign that
							it was recorded again; Gary Urton did see it, since the repository
							quotes his note on the primary cord's colour, which the Aschers
							left blank.
						</p>
						<p>
							What the record holds: a primary cord {primaryLen} cm long,{" "}
							{khipu.primary.twist}-twisted, with a twisted beginning and a
							broken end, carrying {khipu.stats.nPendants} pendants and{" "}
							{khipu.stats.nSubsidiaries} subsidiary in {khipu.stats.nGroups}{" "}
							groups. Every pendant is {twist[0].code}-twisted, and every one
							but{" "}
							{broken
								.filter((c) => c.level === 1)
								.map((c) => c.name)
								.join(", ")}{" "}
							ends in a finishing knot (
							{term.map((t) => `${t.code} ${t.n}`).join(", ")}). Attachment is
							unrecorded for all {attach[0].n} pendants; the museum says every
							one is tied verso. The primary's colour is unrecorded by the
							Aschers, "brown with some white" in Urton's note and medium brown
							for the museum; the data file's white is supported by nothing, so
							the figures below draw it neutral.{" "}
							<Conf level="firm">Recorded structure</Conf>
						</p>
						<p>
							The record itself is two-tier. The Aschers measured{" "}
							{measuredPendants} of the {khipu.stats.nPendants} pendants and
							gave the rest to two footnotes: "All pendants are finished ¢ but
							have no knots. The same description applies to the first 63 groups
							(1–189). The next 7 groups have knots and so their lengths and
							values are recorded." In the data file the unmeasured cords hold a
							length of zero and the note "{lengthNote}". The measured cords are{" "}
							{measuredOk ? "exactly" : "not exactly"} the knotted units.{" "}
							<Conf level="firm">Two-tier record</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								{khipu.id} to scale along its {primaryLen} cm primary cord, from
								the recorded group starts and the Aschers' widths of a triad (
								{TRIAD_WIDTH_CM} cm) and a seven-cord group ({TAIL_WIDTH_CM}{" "}
								cm). Knots are dots at their recorded distance down the cord;
								cord lengths are not to scale, since most were not taken. The
								primary is drawn neutral because its colour was not recorded.
							</>
						}
					>
						<LayoutStrip khipu={khipu} colors={colors} />
					</Wide>
				</Step>

				<Step n={2} title="Seventy triads in ten blocks">
					<Prose>
						<p>
							The recorder's group sizes come in two runs:{" "}
							{runs
								.map((r) => `${r.count} groups of ${r.size}`)
								.join(", then ")}
							. The triads are not evenly spread. Inside a block they start{" "}
							{fmt(lay.triadPitch ?? 0, 2)} cm apart, a {TRIAD_WIDTH_CM} cm
							group and a quarter-centimetre gap, and after every seventh the
							next starts {list([...new Set(lay.gaps.map((g) => fmt(g, 2)))])}{" "}
							cm later. That cuts the seventy into {spans.length} blocks of{" "}
							{BLOCK}, beginning at {list(spans.map((s) => fmt(s.start)))} cm.
							After the tenth block the primary runs {fmt(lay.silence)} cm with
							nothing on it. Then come the ten seven-cord groups, each{" "}
							{TAIL_WIDTH_CM} cm wide at a pitch of {fmt(lay.tailPitch ?? 0)}{" "}
							cm, from {fmt(lay.tailSection[0])} to {fmt(lay.tailSection[1])}{" "}
							cm; the primary breaks {fmt(primaryLen - tailEnd)} cm after the
							last of them. <Conf level="firm">Ten blocks of seven</Conf>
						</p>
						<p>
							One caution about the data. The per-cord positions in the file are
							an artefact of how it was built: the Aschers gave the start of
							each group and the space after each block, and the build read that
							space as the spacing inside the group. Everything above uses the
							group starts alone. One of the gaps computes as{" "}
							{list(gapIrregular)} cm where the Aschers wrote 6.5, a
							quarter-centimetre slip in the transcription of a single group
							start; the block starts are unaffected.
						</p>
					</Prose>
					<Wide caption="The ten blocks from the recorded group starts. Start and end in cm along the primary; the gap is the empty cord before the next block, or before the first seven-cord group.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Block</th>
										<th>Groups</th>
										<th>Pendants</th>
										<th className="num">Start</th>
										<th className="num">End</th>
										<th className="num">Pitch</th>
										<th className="num">Gap after</th>
										<th>Knots</th>
									</tr>
								</thead>
								<tbody>
									{spans.map((s, i) => {
										const first = rows.length ? i * BLOCK : 0;
										const g0 = first + 1;
										const g1 = first + BLOCK;
										const p0 = khipu.groups[first].first;
										const p1n = khipu.groups[first + BLOCK - 1].last;
										const hasKnots = units.blocks.includes(s.n);
										return (
											<tr key={s.n}>
												<td>{s.n}</td>
												<td>
													{g0}–{g1}
												</td>
												<td>
													p{p0}–p{p1n}
												</td>
												<td className="num">{fmt(s.start)}</td>
												<td className="num">{fmt(s.end)}</td>
												<td className="num">{fmt(s.pitch ?? 0, 2)}</td>
												<td className="num">
													{s.gapAfter == null ? "—" : fmt(s.gapAfter, 2)}
												</td>
												<td className={hasKnots ? "ok" : "muted"}>
													{hasKnots ? "yes" : "none"}
												</td>
											</tr>
										);
									})}
									<tr>
										<td>Groups of seven</td>
										<td>
											{khipu.groups.length - tails.length + 1}–
											{khipu.groups.length}
										</td>
										<td>
											p{khipu.groups[khipu.groups.length - tails.length].first}
											–p
											{khipu.groups[khipu.groups.length - 1].last}
										</td>
										<td className="num">{fmt(tails[0].start)}</td>
										<td className="num">{fmt(tailEnd)}</td>
										<td className="num">{fmt(lay.tailPitch ?? 0)}</td>
										<td className="num muted">broken end</td>
										<td className="ok">group {units.tails.join(", ")} only</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Wide>
					<Wide
						caption={
							<>
								The last {OVERVIEW_BLOCKS} of the ten blocks and all ten
								seven-cord groups, drawn by ordinal position rather than to
								scale; the whole khipu at this scale would be{" "}
								{N_BLOCKS / OVERVIEW_BLOCKS} times wider on the left. Cords
								without a recorded length are drawn at {drawing.nominal} cm, the
								mean of the measured pendants. Blocks and seven-cord groups as
								alternating bands; knotted cords ringed.
							</>
						}
					>
						<LayerTabs
							value={layer}
							onChange={setLayer}
							options={[
								{ value: "recorded", label: "As recorded" },
								{ value: "blocks", label: "Blocks" },
								{ value: "knots", label: "Knotted cords" },
							]}
						/>
						<KhipuDiagram
							khipu={overview}
							colors={colors}
							layout={OVERVIEW}
							style="physical"
							groupBand={groupBand}
							groupLabel={groupLabel}
							emphasis={emphasis}
							ring={ring}
							showGroups
							tooltip={layer === "recorded"}
							fit
						/>
					</Wide>
				</Step>

				<Step n={3} title="White, brown, white, seventy times">
					<Prose>
						<p>
							Compare each triad, cord by cord, with the template{" "}
							{TEMPLATE.join("–")}: {tc.matches} of {tc.total} match, with{" "}
							{tc.exceptions.length === 0
								? "no exception"
								: `${tc.exceptions.length} exceptions`}
							. By position the colours are{" "}
							{tc.byPosition
								.map((m) =>
									Object.entries(m)
										.map(([code, n]) => `${code} ${n}`)
										.join("/"),
								)
								.join(", then ")}
							. Over the whole khipu:{" "}
							{colours
								.map(
									(c) =>
										`${c.n} ${nameFor(c.code, colors).toLowerCase()} (${c.code})`,
								)
								.join(", ")}
							. The seven-cord groups are each a single colour, in the sequence{" "}
							{tailRuns
								.map((r) => (r.n === 1 ? r.code : `${r.n} × ${r.code}`))
								.join(", ")}
							, which is what the Aschers' second observation records.{" "}
							<Conf level="firm">Template holds</Conf>
						</p>
						<p>
							Two cautions. The Aschers did not tabulate the first 189 cords;
							the template's strictness is as good as their sentence "the same
							description applies to the first 63 groups". And the museum's own
							description, made independently, agrees on the structure,
							twenty-one cords a block, beginning with a light cord, two light
							to one dark, but reads the light cords as light brown rather than
							white and has the first nine seven-cord groups dark and only the
							tenth medium brown, where the Aschers have the first group medium
							as well.{" "}
							<Conf level="likely">
								Colour readings differ between recorders
							</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Every cord as a cell in its recorded colour: ten rows of seven
								triads, then ten rows of seven. Knotted cells are ringed and
								carry their value; the orange dot marks the one cord with a
								subsidiary.
							</>
						}
					>
						<TemplateGrid khipu={khipu} colors={colors} />
					</Wide>
					<Prose>
						<p>
							In this project's scan no other khipu in the corpus repeats a
							three-cord colour pattern even twenty times in a row; this one
							does it {tc.matches} times. Screening the {corpus.nKhipus} khipus
							for those with ten or more groups of which at least 85 % are
							threes finds {TRIAD_SIBLINGS.length + 1}: this khipu at{" "}
							{pct(triadsOfSelf.threes / triadsOfSelf.groups)},{" "}
							{TRIAD_SIBLINGS.map((id, i) => (
								<span key={id}>
									{i > 0 && " and "}
									<Link to="/khipus/$id" params={{ id }}>
										{id}
									</Link>
								</span>
							))}
							.{" "}
							{sibling && sib && (
								<>
									{sibling.id} ({sibling.aliases.join(", ")}, Berlin V A 42526)
									came from the same Gretzer lot with the same Pachacamac label.
									It is {sib.triads.threes} triads and nothing else,{" "}
									{sib.share.cords} cords of which {sib.share.knotted} carry
									knots, coloured{" "}
									{sib.patterns
										.map((p) => `${p.pattern} (${p.n})`)
										.join(" or ")}
									, with values up to {sib.max.toLocaleString()}. Its layout is
									similar, a white cord either side of a mottled one, but
									knotted.{" "}
								</>
							)}
							<Conf level="likely">
								Similar layout, one knotted and one not
							</Conf>
						</p>
					</Prose>
					{sibling && (
						<Wide
							caption={
								<>
									{sibling.id} for comparison: {sibling.stats.nGroups} triads,
									every cord knotted, values under each cord.
								</>
							}
						>
							<KhipuDiagram
								khipu={sibling}
								colors={colors}
								layout={SIBLING}
								style="physical"
								showValues
								showGroups
								fit
							/>
						</Wide>
					)}
				</Step>

				<Step n={4} title="Where the knots are">
					<Prose>
						<p>
							{ks.cords} of the {khipu.stats.nCords} cords carry any knot,{" "}
							{pct(share.share)}: {ks.clusters} knot clusters, {totalKnots}{" "}
							knots in all, a total value of {ks.total} and a largest value of{" "}
							{ks.max}. Every one of them is in block {list(units.blocks)} of
							the ten and seven-cord group {list(units.tails)} of the ten.
							Blocks{" "}
							{spans
								.filter((s) => !units.blocks.includes(s.n))
								.map((s) => s.n)
								.join(", ")}{" "}
							and groups{" "}
							{tails
								.filter((t) => !units.tails.includes(t.n))
								.map((t) => t.n)
								.join(", ")}{" "}
							have no knot at all. If {pTwo.knotted} knotted pendants were
							placed at random among {pTwo.pendants}, the chance that they would
							fall within two of the {pTwo.units} units is {oneIn(pTwo.p)}.{" "}
							<Conf level="firm">Two knotted units</Conf>
						</p>
						<p>
							Inside the knotted block, knots follow colour. The first cord of a
							triad is knotted in {byPos[0]} of {rows.length} triads, the middle
							cord in {byPos[1]}, the last in {byPos[2]}. That is{" "}
							{whiteCol?.knotted} of the {whiteCol?.total} white cords and{" "}
							{brownCol?.knotted} of the {brownCol?.total} brown ones. If{" "}
							{pColour.m} of the block's {pColour.total} cords had been knotted
							at random, all of them would avoid the brown cords{" "}
							{oneIn(pColour.p)}. The single subsidiary on the khipu is brown,
							reads {sub?.value}, and hangs from a white cord,{" "}
							{sub?.cord.parent}. In the one knotted block, the brown cords
							carry no numbers.{" "}
							<Conf level="firm">Block knots on white cords only</Conf>{" "}
							<Conf level="likely">Brown cord possibly not for numbers</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								The two knotted units drawn together: block {list(units.blocks)}{" "}
								on the left, seven-cord group {list(units.tails)} on the right,
								cut out of the whole so the knots are legible. The{" "}
								{fmt(lay.silence)} cm of empty primary cord between them is not
								shown. Values under each cord.
							</>
						}
					>
						<KhipuDiagram
							khipu={detail}
							colors={colors}
							layout={DETAIL}
							style="physical"
							showValues
							showGroups
							ring={(c) => (c.knots.length > 0 ? "var(--accent)" : null)}
							fit
						/>
					</Wide>
					<Wide caption="Every knotted cord on the khipu. Position is the cord's place in its three- or seven-cord group; the subsidiary is listed under the cord it hangs from.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Cord</th>
										<th>Where</th>
										<th className="num">Position</th>
										<th>Knots</th>
										<th className="num">Value</th>
										<th className="num">Length</th>
									</tr>
								</thead>
								<tbody>
									{knotted.map((r) => (
										<tr key={r.cord.name}>
											<td>
												<Chip cord={r.cord} colors={colors} /> {r.cord.name}
											</td>
											<td>
												{r.where === "block"
													? `block ${r.unit}, triad ${r.triad}`
													: r.where === "tail"
														? `seven-cord group ${r.unit}`
														: `subsidiary of ${r.cord.parent}`}
											</td>
											<td className="num">{r.position}</td>
											<td>{r.knots}</td>
											<td className="num">{r.value}</td>
											<td className="num">
												{r.cord.length} cm
												{r.cord.term === "B" && (
													<span className="muted"> broken</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
				</Step>

				<Step n={5} title="Ones and fours">
					<Prose>
						<p>
							Block {list(units.blocks)} follows one pattern. The first white
							cord carries a single figure-eight at{" "}
							{either(heights[0].map((h) => fmt(h)))} cm, the brown cord
							nothing, the last white cord a long knot at{" "}
							{either(heights[2].map((h) => fmt(h)))} cm. One discrepancy in the
							record: the data file puts every first-cord knot at{" "}
							{either(heights[0].map((h) => fmt(h)))} cm, where the Databook
							table has 10.0 for four of the five figure-eights and 10.5 only
							for p190 and for the two-turn knot on p199; no value is affected.
							Read as numbers the triads are{" "}
							{rows.map((r) => r.values.join("·")).join(", ")}: first cords{" "}
							{list(firstValues)}, last cords {list(lastValues)}. Of the{" "}
							{rows.length}, {rows.length - offFormula.length} read {modalTriad}
							; the{" "}
							{plural(offFormula.length, "exception is", "exceptions are")}{" "}
							{offFormula
								.map(
									(r) =>
										`triad ${r.triad} (${r.values.join("·")}${
											r.cords.some((c) => c.term === "B")
												? ", its last cord broken"
												: ""
										})`,
								)
								.join(" and ")}
							. First plus last comes to {sumTest.target} in {sumTest.hits} of
							the {sumTest.triads}: triad{" "}
							{offFormula.find((r) => !sumDeviants.includes(r))?.triad} keeps
							the sum while writing it differently, and only{" "}
							{sumDeviants.map((r) => `triad ${r.triad}`).join(" and ")}, with
							its broken last cord, falls short. The subsidiary adds{" "}
							{sub?.value} to triad {rows.find((r) => r.subs.length)?.triad},
							whose total becomes{" "}
							{(rows.find((r) => r.subs.length)?.sum ?? 0) +
								(rows.find((r) => r.subs.length)?.subSum ?? 0)}
							.
						</p>
						<p>
							Shuffling the last-cord values among the seven triads in every
							possible order, {sumTest.hits} or more triads still add to{" "}
							{sumTest.target} in {pct(sumTest.p)} of arrangements, about{" "}
							{oneIn(sumTest.p)}. That is a pattern, not a proof, and it rests
							on one block.{" "}
							<Conf level="open">Triads built to sum to {sumTest.target}</Conf>
						</p>
						<p>
							A second reading is possible. The first-cord knot is a lone
							figure-eight in {eights} of the {pos1Knotted} cases,{" "}
							{types[0].L ?? 0} a two-turn long knot; the last-cord knots are
							all long knots (
							{Object.entries(types[2])
								.map(([t, n]) => `${t} × ${n}`)
								.join(", ")}
							). The <Link to="/stories/twin-falls">Twin Falls</Link> reading
							treats a lone figure-eight as a label rather than a 1. Under that
							reading each triad here carries one number, {list(lastValues)},
							and a mark on its first cord, and only triad{" "}
							{
								rows.find((r) => r.cords[0].knots.some((k) => k.type === "L"))
									?.triad
							}{" "}
							with its two-turn knot breaks the rule. One block of seven cannot
							decide between the two.{" "}
							<Conf level="open">Figure-eight as marker</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								The first triad of block {list(units.blocks)}: {p1.name} with
								its figure-eight and {p3.name} with its four-turn long knot, the
								knots where the Aschers measured them. The brown cord between
								them is blank.
							</>
						}
					>
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>
										{p1.name}: {p1.color}, {knotsText(p1)}
									</h3>
								</figcaption>
								<CordReader
									cord={p1}
									colors={colors}
									pxPerCm={5}
									title={`${p1.name}, first cord of the triad`}
								/>
							</div>
							<div className="figure">
								<figcaption>
									<h3>
										{p3.name}: {p3.color}, {knotsText(p3)}
									</h3>
								</figcaption>
								<CordReader
									cord={p3}
									colors={colors}
									pxPerCm={5}
									title={`${p3.name}, last cord of the triad`}
								/>
							</div>
						</div>
					</Wide>
					<Wide caption="The knotted block triad by triad. First and last are the white cords; the middle column is the brown cord, blank throughout.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Triad</th>
										<th>Group</th>
										<th>First</th>
										<th>Middle</th>
										<th>Last</th>
										<th className="num">First + last</th>
										<th>Subsidiary</th>
										<th className="num">Lengths, cm</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r) => (
										<tr key={r.group}>
											<td>{r.triad}</td>
											<td className="muted">{r.group}</td>
											{r.cords.map((c) => (
												<td key={c.name}>
													<Chip cord={c} colors={colors} />{" "}
													<span className="muted">
														{c.knots.length ? knotsText(c) : "blank"}
													</span>
												</td>
											))}
											<td
												className={`num ${
													r.values[0] + r.values[r.values.length - 1] ===
													sumTest.target
														? "ok"
														: "no"
												}`}
											>
												{r.values[0] + r.values[r.values.length - 1]}
											</td>
											<td>
												{r.subs.length ? (
													r.subs.map((s) => (
														<span key={s.name}>
															<Chip cord={s} colors={colors} /> {s.name}, on{" "}
															{s.parent}
														</span>
													))
												) : (
													<span className="muted">—</span>
												)}
											</td>
											<td className="num">
												{r.cords.map((c) => c.length).join(" / ")}
											</td>
										</tr>
									))}
									<tr>
										<td>Σ</td>
										<td />
										<td>{firstValues.reduce((a, v) => a + v, 0)}</td>
										<td>{rows.reduce((a, r) => a + (r.values[1] ?? 0), 0)}</td>
										<td>{lastValues.reduce((a, v) => a + v, 0)}</td>
										<td className="num">{sums.reduce((a, v) => a + v, 0)}</td>
										<td>+{rows.reduce((a, r) => a + r.subSum, 0)}</td>
										<td className="num muted">
											means {lens.map((l) => fmt(l.mean, 1)).join(" / ")}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							The lengths show no pattern. Within the block the first, middle
							and last cords average{" "}
							{lens.map((l) => `${fmt(l.mean, 1)} cm`).join(", ")}, with no
							pattern by position; the seven-cord group's cords run{" "}
							{fmt(tailLens.min)} to {fmt(tailLens.max)} cm, mean{" "}
							{fmt(tailLens.mean, 1)}. The museum gives all pendants as 24.5 to
							41 cm, which is consistent with the {measuredPendants} that were
							measured.
						</p>
					</Prose>
				</Step>

				<Step n={6} title="The seven numbers">
					<Prose>
						<p>
							The tenth seven-cord group differs. Its cords read{" "}
							{list(decimal.map((d) => d.read))}, sum{" "}
							{decimal.reduce((a, d) => a + d.read, 0)}, in the ordinary decimal
							way: tens as single knots at {range(tailTens)}, units as long
							knots at {range(tailUnits)}. Of the seven, {twoDigit.length} carry
							a tens knot;{" "}
							{tensOnly
								? `${tensOnly.cord.name} is ${tensOnly.tens} single knots and no units knot, so ${tensOnly.read}.`
								: ""}{" "}
							Every row agrees with the value the Aschers wrote. These are the
							only two-digit numbers on the khipu; nothing in the triads exceeds{" "}
							{Math.max(...rows.flatMap((r) => r.values))}.{" "}
							<Conf level="firm">Plain decimal</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Two cords of group {list(units.tails)}: {twoDigit[0]?.cord.name}{" "}
								with a tens knot above a units knot, and {tensOnly?.cord.name}{" "}
								with two single knots in the tens place and nothing below.
							</>
						}
					>
						<div className="figures">
							{[twoDigit[0]?.cord, tensOnly?.cord]
								.filter((c): c is Cord => Boolean(c))
								.map((c) => (
									<div className="figure" key={c.name}>
										<figcaption>
											<h3>
												{c.name}: {c.color}, {knotsText(c)}
											</h3>
										</figcaption>
										<CordReader
											cord={c}
											colors={colors}
											pxPerCm={5}
											title={`${c.name}, value ${c.value}`}
										/>
									</div>
								))}
						</div>
					</Wide>
					<Wide caption="The tenth seven-cord group read register by register, against the triad totals of the tenth block set beside it cord for cord. No constant difference, ratio or sum links the two.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Cord</th>
										<th>Knots</th>
										<th className="num">Tens</th>
										<th className="num">Units</th>
										<th className="num">Read</th>
										<th className="num">Recorded</th>
										<th className="num">Triad {list(units.blocks)}.n total</th>
										<th className="num">Difference</th>
										<th className="num">Ratio</th>
									</tr>
								</thead>
								<tbody>
									{decimal.map((d, i) => (
										<tr key={d.cord.name}>
											<td>
												<Chip cord={d.cord} colors={colors} /> {d.cord.name}
											</td>
											<td>{knotsText(d.cord)}</td>
											<td className="num">{d.tens}</td>
											<td className="num">{d.units}</td>
											<td className="num">{d.read}</td>
											<td className={`num ${d.agrees ? "ok" : "no"}`}>
												{d.cord.value}
											</td>
											<td className="num">{pair.triadTotals[i]}</td>
											<td className="num">{pair.differences[i]}</td>
											<td className="num">
												{Number.isNaN(pair.ratios[i])
													? "—"
													: pair.ratios[i].toFixed(2)}
											</td>
										</tr>
									))}
									<tr>
										<td>Σ</td>
										<td />
										<td />
										<td />
										<td className="num">{pair.tailSum}</td>
										<td className="num">
											{decimal.reduce((a, d) => a + (d.cord.value ?? 0), 0)}
										</td>
										<td className="num">{pair.triadSum}</td>
										<td className="num">{pair.tailSum - pair.triadSum}</td>
										<td className="num">
											{(pair.tailSum / pair.triadSum).toFixed(2)}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							The Aschers ended their entry with a guess the Field Guide's
							transcription leaves out: "This quipu is probably incomplete. The
							values on the 70 pendants in part 2 perhaps were to be related to
							the 70 groups of part 1." The count is consistent with this:{" "}
							{tails.length} groups of {BLOCK} is{" "}
							{tailGroups(khipu).flat().length} single cords against {tc.total}{" "}
							triads. So is the placement. Paired block k with seven-cord group
							k, the two knotted units are the tenth of each kind, block{" "}
							{list(units.blocks)} and group {list(units.tails)}, as filling
							both parts from one index would give, though a match of one
							knotted unit with the other has one chance in {tails.length} of
							arising on its own; the pairing also puts the two{" "}
							{tailRuns[0].code}-coloured groups, the first and the last,
							against the first and last blocks.{" "}
							<Conf level="open">Two parts indexed together</Conf>
						</p>
						<p>
							The pairing gives no arithmetic. Cord for triad, the differences
							are {list(pair.differences)} and the ratios{" "}
							{list(pair.ratios.map((r) => r.toFixed(2)))}; the group sums to{" "}
							{pair.tailSum}, the block to {pair.triadSum} with its subsidiary.
							The Field Guide counts four "Ascher sums" on the khipu. Among{" "}
							{coincidence.values.length} values this small, runs that add up to
							another value are expected: the recorded order has{" "}
							{coincidence.observed} of them, and shuffling the same values{" "}
							{coincidence.shuffles.toLocaleString()} times gives at least as
							many {pct(coincidence.p, 0)} of the time. Nothing here links the
							seven numbers to the seven triads.{" "}
							<Conf level="open">Relation between the two parts</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={7} title="Colour without numbers">
					<Prose>
						<p>
							An almost empty khipu of this size is rare. The index lists {big}{" "}
							khipus with a hundred cords or more.{" "}
							{rank && (
								<>
									By knots per cord {khipu.id} is{" "}
									{rank.rank === 2 ? "second" : `number ${rank.rank}`} lowest of{" "}
									{rank.n}, at {rank.density.toFixed(2)} against a median of{" "}
									{rank.median.toFixed(2)}; ranked instead by the share of cords
									that carry any knot, as the analysis script does, it holds the
									same place at {pct(share.share)}.{" "}
								</>
							)}
							{comparison && cmp && (
								<>
									The only emptier one is{" "}
									<Link to="/khipus/$id" params={{ id: comparison.id }}>
										{comparison.id}
									</Link>{" "}
									({comparison.aliases.join(", ")}, American Museum of Natural
									History 41.2/6714): {cmp.share.cords} pendants in{" "}
									{cmp.groups === 1 ? "a single group" : `${cmp.groups} groups`}
									, {cmp.share.knotted} of them knotted, coloured{" "}
									{cmp.colours.map((c) => `${c.n} ${c.code}`).join(", ")},
									bought in 1969 and said to come from near Callango in the Ica
									valley.{" "}
								</>
							)}
							<Conf level="firm">Second emptiest large khipu</Conf>
						</p>
						<p>
							What the record shows. Someone strung {tc.total} three-cord
							groups, each a white cord, a brown cord and a white cord, in ten
							blocks of seven, and after them {tailGroups(khipu).flat().length}{" "}
							single brown cords in ten groups of seven, the first and last
							group in a different brown from the eight between. One block and
							one group carry knots: the block with the same small value on each
							triad's last white cord and a figure-eight on its first, the group
							with seven ordinary decimal numbers. The primary cord breaks{" "}
							{fmt(primaryLen - tailEnd)} cm after the last group, so the object
							may have gone on. Colour and position carry the structure; the
							numbers, where they exist, are few and small. The tenth of each
							part was filled, or is the only one that survives filled: the
							record cannot tell those apart.
						</p>
						<p>
							What it does not show. What the seventy slots stood for, and why
							only the tenth block and the tenth group carry knots, is not
							recoverable from a record in which blocks 1 to 9 and groups 1 to 9
							are blank. The Aschers' pairing of the two parts can be checked at
							one pair, and there it yields no arithmetic. The block's formula
							may be two numbers or a marker and one number. Attachment and
							per-cord positions were never recorded, so nothing that depends on
							them can be read, and the museum's light-brown reading of the
							Aschers' white cannot be settled from the file.{" "}
							<Conf level="open">What the form was for</Conf>
						</p>
					</Prose>
					<Wide>
						<Layers
							heading={`${khipu.id}, read in layers`}
							layers={explain(
								khipu,
								share,
								tc.matches,
								tc.total,
								units,
								sumTest.target,
								sumTest.hits,
								decimal.map((d) => d.read),
							)}
						/>
					</Wide>
				</Step>

				<Sources
					items={[
						{
							who: "Marcia Ascher & Robert Ascher",
							what: "Code of the Quipu: Databook (1978), entry AS121, pp. 800–803",
							where: "Cornell, Code of the Quipu site",
							href: "https://courses.cit.cornell.edu/quipu/data/as121.pdf",
						},
						{
							who: "Marcia Ascher & Robert Ascher",
							what: "Code of the Quipu: Databook (1978), entry AS190, p. 1129 (the comparison khipu KH0208)",
							where: "Cornell, Code of the Quipu site",
							href: "https://courses.cit.cornell.edu/quipu/data/as190.pdf",
						},
						{
							who: "Marcia Ascher & Robert Ascher",
							what: "Code of the Quipu databooks online: contents",
							where: "Cornell",
							href: "https://courses.cit.cornell.edu/quipu/contents.htm",
						},
						{
							who: "Khipu Field Guide (Ashok Khosla)",
							what: "Catalog page for KH0135 (UR1121, AS121): statistics, Ascher notes 1–3, Ascher-sum count",
							where: "khipufieldguide.com",
							href: "https://www.khipufieldguide.com/catalog/KH0135.html",
						},
						{
							who: "Khipu Field Guide",
							what: "Fieldmark notebooks: the Ascher-sum table lists KH0135 with 3 pendant–pendant and 1 indexed sum and nothing in any other fieldmark column",
							where: "khipufieldguide.com",
							href: "https://www.khipufieldguide.com/notebook/fieldmarks/",
						},
						{
							who: "Staatliche Museen zu Berlin, Ethnologisches Museum",
							what: "Object record V A 42538, Khipu: Gretzer collection, dating, dimensions, structural description",
							where: "search.smb.museum",
							href: "https://search.smb.museum/object/obj-39395",
						},
						{
							who: "Open Khipu Repository",
							what: "khipu.db record 1000077: investigator numbers, cord and knot tables, primary-cord colour note quoting G. Urton",
							where: "local sqlite copy, data/okr/data/khipu.db",
						},
						{
							who: "This site",
							what: "scripts/kh0135_analysis.py: the derivations above and the corpus screens (knotted share, triad share, template runs)",
							where: "run with --corpus for the rankings",
						},
					]}
				/>
				<Legend
					items={[
						{ color: hexFor("W", colors), label: "W white", outline: true },
						{
							color: hexFor("B", colors),
							label: `B ${nameFor("B", colors).toLowerCase()}`,
						},
						{
							color: hexFor("BB", colors),
							label: `BB ${nameFor("BB", colors).toLowerCase()}`,
						},
						{ color: "var(--accent)", label: "knotted cord" },
						{ color: "var(--moiety-r)", label: "subsidiary" },
					]}
				/>
			</div>
		</StoryPage>
	);
}

function explain(
	khipu: Khipu,
	share: { knotted: number; cords: number },
	matches: number,
	total: number,
	units: { blocks: number[]; tails: number[] },
	target: number,
	hits: number,
	tail: number[],
): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					{khipu.stats.nPendants} pendants and {khipu.stats.nSubsidiaries}{" "}
					subsidiary in {khipu.stats.nGroups} recorder groups on a{" "}
					{khipu.primary.length} cm primary cord, broken at its end;{" "}
					{share.knotted} cords with knots, {khipu.stats.nKnots} knots in all.
					Lengths taken for the knotted cords only; attachment not recorded.
					Aschers 1978, transcribed into the Open Khipu Repository in 2003; seen
					but not re-recorded by Urton.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					{total} triads in {N_BLOCKS} blocks of {BLOCK}, {matches} of {total}{" "}
					coloured {TEMPLATE.join("–")}; {N_BLOCKS} groups of {BLOCK} single
					brown cords, {tail.length * N_BLOCKS} against {total}. Knots in block{" "}
					{units.blocks.join(", ")} and group {units.tails.join(", ")} only, and
					in the block on its white cords only. {hits} of {BLOCK} triads have
					first + last = {target}. The group reads {tail.join(", ")} in plain
					decimal. No arithmetic between the two.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: "Pachacamac, by the dealer's label on the Gretzer collection (1906–07); the museum dates it 1400–1550. KH0112 from the same lot is sixteen triads in a similar white–mottled–white pattern, fully knotted. The Khipu Field Guide's fieldmark table lists this khipu only for four Ascher sums, which step 6 finds no more frequent than shuffling gives; the Aschers' fourth observation proposed that the seventy tail cords were to be related to the seventy triads.",
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "One reading: a colour-coded form of seventy slots with seventy corresponding cords, knotted in one block and one group before the record stops. Whether the other nine pairs were never filled, or were emptied, or continued on the missing length of primary, cannot be decided; what a slot stood for is unknown.",
			level: "open",
		},
	];
}
