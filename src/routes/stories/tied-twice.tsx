import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CoastMap from "#/components/story/CoastMap";
import CordReader from "#/components/story/CordReader";
import { EvidenceDeck } from "#/components/story/CrossLink";
import {
	Facsimile,
	imageUrl,
	ObjectFile,
	Photo,
	Profiles,
	PullQuote,
	Timeline,
} from "#/components/story/Dossier";
import { Chip } from "#/components/story/Ledger";
import Radiocarbon from "#/components/story/Radiocarbon";
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
import StrandWeave, {
	useStepHighlight,
	type WeaveMark,
	type WeaveRange,
} from "#/components/story/StrandWeave";
import { type Highlight, PairStage } from "#/components/story/TiedTwiceStages";
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getKhipus } from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { DISTANCES } from "#/lib/stories/coast";
import {
	cordAt,
	l1Index,
	partSpan,
	summaryThreads,
} from "#/lib/stories/storyIsland";
import {
	attachments,
	blanks,
	cordNamed,
	differences,
	FIELDS,
	fieldColours,
	HUACHO,
	HUACHO_A_ID,
	HUACHO_B_ID,
	longKnotDirections,
	PACHACAMAC_ID,
	PARTS,
	pairRows,
	pairStats,
	partOfGroup,
	type SummaryRow,
	stubs,
	subsidiaryCounts,
	summaryRows,
	survivingSubs,
	type UnitRow,
	VERDICT_TEXT,
	type Verdict,
} from "#/lib/stories/tiedtwice";
import "#/styles/stories/pairs.css";
import "#/styles/stories/tied-twice.css";

export const Route = createFileRoute("/stories/tied-twice")({
	loader: async () => {
		const ids = [PACHACAMAC_ID, HUACHO_B_ID, HUACHO_A_ID];
		const [khipus, colors] = await Promise.all([getKhipus(ids), getColors()]);
		return {
			a: khipus[PACHACAMAC_ID],
			b: khipus[HUACHO_B_ID],
			c: khipus[HUACHO_A_ID],
			colors,
		};
	},
	head: () => ({ meta: [{ title: "An account tied twice — Khipu" }] }),
	component: TiedTwice,
});

const WEAVE_NAMES = {
	[PACHACAMAC_ID]: "AS175",
	[HUACHO_B_ID]: "UR233",
	[HUACHO_A_ID]: "UR232",
};

type OverviewLayer = "recorded" | "parts";

const OVERVIEW = { slot: 6, gap: 10, subOffset: 3, pxPerCm: 1.6, cordW: 1.6 };

/** UR233 restates part 1, UR232 part 3. */
const [sideB, sideA] = HUACHO;

/** The museum's photographs, published under CC BY-NC-SA 4.0. */
const PHOTO_CREDIT = (
	<>
		Photograph: Staatliche Museen zu Berlin, Ethnologisches Museum,{" "}
		<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
			CC BY-NC-SA 4.0
		</a>
	</>
);

/** The radiocarbon result for VA 63038: Cherkinsky & Urton 2014, table 1. */
const RADIOCARBON = {
	lab: "UGAMS-4574",
	bp: "333 ± 23",
	ranges: [
		{ from: 1503, to: 1592, p: 0.73 },
		{ from: 1615, to: 1647, p: 0.27 },
	],
};

function verdictClass(v: Verdict) {
	return v === "exact" ? "ok" : v === "one" || v === "ten" ? "muted" : "no";
}

const fmt = (v: number | null | undefined) =>
	v == null ? "—" : v.toLocaleString();

/** A knotless cord as a chip, so a blank position reads as a position. */
function BlankChip({ cord, colors }: { cord: Cord; colors: ColorTable }) {
	return (
		<span
			className="chip chip-blank"
			title={`${cord.name}: ${cord.color ?? "no colour"}, ${cord.length ?? "?"} cm, no knots`}
		>
			<i
				style={{ background: hexFor(cord.colorParsed?.[0]?.codes[0], colors) }}
				aria-hidden="true"
			/>
			blank
		</span>
	);
}

/** Every unit of a Huacho piece beside the AS175 group it restates. */
function PairTable({
	rows,
	colors,
	aliasA,
	aliasB,
	blankAt,
}: {
	rows: UnitRow[];
	colors: ColorTable;
	aliasA: string;
	aliasB: string;
	blankAt: number;
}) {
	return (
		<div className="ledger">
			<table className="ledger-table">
				<thead>
					<tr>
						<th>Unit</th>
						<th>{aliasA}, five fields</th>
						<th>{aliasB}, six cords</th>
						<th>Differs</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => {
						const byB = new Map(r.fields.map((f) => [f.b?.name, f]));
						const diffs = r.fields.filter(
							(f) => f.verdict !== "exact" && f.verdict !== "na",
						);
						return (
							<tr key={r.unit}>
								<td className="num">
									{r.unit + 1} <span className="muted">· g{r.group + 1}</span>
								</td>
								<td>
									<span className="chips">
										{r.fields.map((f) =>
											f.a ? (
												<Chip
													key={f.a.name}
													cord={f.a}
													colors={colors}
													match={f.verdict === "exact"}
												/>
											) : (
												<span key={`missing-${f.field}`} className="chip">
													<span className="muted">lost</span>
												</span>
											),
										)}
									</span>
								</td>
								<td>
									<span className="chips">
										{r.b.map((c, i) =>
											i === blankAt ? (
												<BlankChip key={c.name} cord={c} colors={colors} />
											) : (
												<Chip
													key={c.name}
													cord={c}
													colors={colors}
													match={byB.get(c.name)?.verdict === "exact"}
												/>
											),
										)}
									</span>
								</td>
								<td>
									{diffs.length === 0 ? (
										<span className="ok">no</span>
									) : (
										diffs.map((f) => (
											<span key={f.field} className={verdictClass(f.verdict)}>
												{FIELDS[f.field].label}: {fmt(f.va)} · {fmt(f.vb)}
												{f === diffs[diffs.length - 1] ? "" : "; "}
											</span>
										))
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function statsText(s: ReturnType<typeof pairStats>) {
	return `${s.exact} of ${s.compared} fields hold the same number, ${s.one} are a single knot apart, ${s.ten} differ by a round ten, ${s.register} by a register, and ${s.no} disagree outright`;
}

/** A twist code in words. */
function twistWord(t: string | null | undefined) {
	return t === "S" ? "S-plied" : t === "Z" ? "Z-plied" : "ply not recorded";
}

function TiedTwice() {
	const { a, b, c, colors } = Route.useLoaderData();
	const [layer, setLayer] = useState<OverviewLayer>("recorded");
	const rowsB = useMemo(() => pairRows(a, b, sideB), [a, b]);
	const rowsA = useMemo(() => pairRows(a, c, sideA), [a, c]);
	const statsB = useMemo(() => pairStats(rowsB), [rowsB]);
	const statsA = useMemo(() => pairStats(rowsA), [rowsA]);
	const diffsB = useMemo(() => differences(rowsB), [rowsB]);
	const summary = useMemo(() => summaryRows(a, c), [a, c]);
	const subsB = useMemo(() => survivingSubs(a, b, sideB), [a, b]);
	const subsA = useMemo(() => survivingSubs(a, c, sideA), [a, c]);
	const subCounts = useMemo(() => subsidiaryCounts(a), [a]);
	const stubsB = useMemo(() => stubs(b), [b]);
	const stubsA = useMemo(() => stubs(c), [c]);
	const blanksB = useMemo(() => blanks(rowsB), [rowsB]);
	const blanksA = useMemo(() => blanks(rowsA), [rowsA]);
	const coloursB = useMemo(() => fieldColours(rowsB), [rowsB]);
	const coloursA = useMemo(() => fieldColours(rowsA), [rowsA]);
	const longA = useMemo(() => longKnotDirections(a), [a]);
	const longB = useMemo(() => longKnotDirections(b), [b]);
	const longC = useMemo(() => longKnotDirections(c), [c]);
	const attB = useMemo(() => attachments(b), [b]);
	const attC = useMemo(() => attachments(c), [c]);

	const p132 = cordNamed(a, "p132");
	const p15 = cordNamed(c, "p15");
	// the same 177 tied by both hands: group 13's green field
	const hand177 = rowsB[12].fields[2];
	const exactA = summary.filter((r) => r.verdictA === "exact").length;
	const exactB = summary.filter((r) => r.verdictB === "exact").length;
	const oneA = summary.filter((r) => r.verdictA === "one").length;
	const oneB = summary.filter((r) => r.verdictB === "one").length;
	const row335 = summary.find((r) => r.k === 2 && r.field === 2) as SummaryRow;
	const [picked, setPick] = useState<number | null>(null);
	const pickAt = picked ?? summary.indexOf(row335);
	const pick = summary[pickAt] ?? row335;
	const firstFive = rowsB.slice(0, 5);
	const plusTen = firstFive.filter((r) => r.fields[3].verdict === "ten").length;
	const blanksBFull = blanksB.filter((x) => (x.length ?? 0) >= 30).length;
	const blanksBLen = [
		Math.min(
			...blanksB.filter((x) => (x.length ?? 0) >= 30).map((x) => x.length ?? 0),
		),
		Math.max(...blanksB.map((x) => x.length ?? 0)),
	];
	const blanksAStub = blanksA.filter((x) => (x.length ?? 0) < 3).length;
	const subsBExact = subsB.filter((s) => s.verdict === "exact").length;
	const total = (k: Khipu) => k.stats.nPendants;
	const agree = statsB.exact + statsA.exact;
	const compared = statsB.compared + statsA.compared;

	// the weave: AS175's three parts as cord ranges, lit step by step
	const indexA = useMemo(() => l1Index(a), [a]);
	const parts = useMemo(
		() => ({
			p1: partSpan(a, "1"),
			p2: partSpan(a, "2"),
			p3: partSpan(a, "3"),
		}),
		[a],
	);
	const stepHl = useStepHighlight<WeaveRange | null>({
		4: parts.p1,
		5: parts.p3,
		6: null,
	});
	// the summary fan: UR232's seven terms into the picked part-2 cord only
	// (fifteen fans at once are a haze), labelled with the terms' values and
	// their sum at the fan point
	const allFans = useMemo(() => summaryThreads(a, c, summary), [a, c, summary]);
	const fan = useMemo(
		() => [{ ...allFans, threads: [allFans.threads[pickAt]] }],
		[allFans, pickAt],
	);
	const fanMarks = useMemo((): WeaveMark[] => {
		const t = allFans.threads[pickAt];
		if (!t) return [];
		const indexC = l1Index(c);
		const miss = pick.verdictB !== "exact" && pick.verdictB !== "one";
		const sum =
			pick.verdictB === "exact"
				? `Σ ${fmt(pick.sumB)} = ${fmt(pick.target.value)}`
				: pick.verdictB === "one"
					? `Σ ${fmt(pick.sumB)} · one knot off`
					: `Σ ${fmt(pick.sumB)} ≠ ${fmt(pick.target.value)}`;
		return [
			{
				kind: "value",
				id: PACHACAMAC_ID,
				cord: t.a[0],
				label: fmt(pick.target.value),
				tone: miss ? "miss" : "key",
			},
			...pick.terms.flatMap((term): WeaveMark[] =>
				term.b
					? [
							{
								kind: "value",
								id: HUACHO_A_ID,
								cord: cordAt(indexC, term.b),
								label: fmt(term.b.value ?? 0),
								tone: "quiet",
							},
						]
					: [],
			),
			{
				kind: "gather",
				id: HUACHO_A_ID,
				cords: t.b,
				label: sum,
				tone: miss ? "miss" : "key",
			},
		];
	}, [allFans, pickAt, pick, c]);

	const paint = (cord: Cord): string | null => {
		if (layer !== "parts" || cord.level > 1) return null;
		return partOfGroup(cord.group ?? -1).key === "2" ? "var(--accent)" : null;
	};
	const groupBand = (g: GroupBox): string | null => {
		if (layer !== "parts") return null;
		const p = partOfGroup(g.index);
		return p.key === "2" ? "var(--band-b)" : "var(--band-a)";
	};
	const groupLabel = (g: GroupBox): string | null => {
		if (layer !== "parts") return null;
		const p = partOfGroup(g.index);
		return g.index === p.from ? p.label : null;
	};

	const highlightsB: Highlight[] = [
		{
			unit: 0,
			label: "Unit 1",
			caption: (
				<>
					The first group of AS175 has lost its white cord; the four that remain
					read {rowsB[0].a.map((x) => x.value ?? 0).join(" · ")}. UR233's first
					unit reads {rowsB[0].b.map((x) => x.value ?? 0).join(" · ")}: a white
					cord of 23, then the same 26, then a knotless cord, then 160, 110 and
					30. The light brown 100 has become 110.
				</>
			),
			callout: rowsB[0].blank
				? {
						side: "b",
						name: rowsB[0].blank.name,
						text: "no knots",
						sub: "the added third cord",
						at: 0.55,
					}
				: undefined,
		},
		{
			unit: 11,
			label: "Unit 12",
			caption: (
				<>
					Group 12 holds the largest number in part 1: 290 on the green cord.
					UR233's twelfth unit holds it too, on grayish blue, with the same 5,
					5, 100 and 55 around it.
				</>
			),
		},
		{
			unit: 12,
			label: "Unit 13",
			caption: (
				<>
					Group 13 reads 62 · 0 · 177 · 0 · 20, and the white 62 carries a white
					subsidiary of 25. UR233's unit reads the same five, and its first cord
					carries one of the five subsidiaries that survive on the piece: it
					reads 25.
				</>
			),
			callout: subsB[0]
				? {
						side: "b",
						name: subsB[0].b.name,
						text: `subsidiary ${fmt(subsB[0].b.value)}`,
						sub: `AS175 has ${fmt(subsB[0].aSub?.value)} here`,
						dx: 60,
						at: 0.6,
					}
				: undefined,
		},
		{
			unit: 19,
			label: "Unit 20",
			caption: (
				<>
					Group 20 and unit 20 agree on 0, 0, 30 and 46. On the light brown cord
					AS175 reads 10, one single knot at 18 cm; UR233 reads 100, one single
					knot at 7.5 cm. The same knot, one register apart.
				</>
			),
		},
	];

	const highlightsA: Highlight[] = [
		{
			unit: 2,
			label: "Unit 3",
			caption: (
				<>
					Group 27 of AS175 reads 4 · 4 · 108 · 0 · 0. UR232's third unit reads
					4 · 4 · 18 · 0 · 0. The green cord's single knot sits at 15 cm on one
					khipu and 17.5 on the other; the Aschers read it as a hundred, Urton
					as a ten; see step 8.
				</>
			),
		},
		{
			unit: 12,
			label: "Unit 13",
			caption: (
				<>
					Group 37: 10 · 12 · 29 · 50 · 60 on both. On UR232 the unit is white,
					reddish brown, white, a knotless brown cord, light brown, white and
					gray.
				</>
			),
		},
		{
			unit: 17,
			label: "Unit 18",
			caption: (
				<>
					Group 42: 0 · 0 · 41 · 0 · 49 on both. Here UR232 wears the colours
					UR233 uses for the same fields: grayish blue for the green field,
					light greenish gray for the last.
				</>
			),
		},
	];

	return (
		<StoryPage
			kicker="Berlin"
			title="An account tied twice"
			standfirst={
				<>
					Two khipus in the Berlin museum, catalogued from sites 150 km apart
					and recorded by different scholars, carry the same numbers in the same
					order: one in groups of five cords, the other in groups of six, in
					different colours. The three summary groups on the first khipu agree
					more often with the second khipu's figures than with its own.
				</>
			}
			meta={
				<>
					<span>
						Objects:{" "}
						<Link to="/khipus/$id" params={{ id: a.id }}>
							AS175 · {a.id}
						</Link>
						,{" "}
						<Link to="/khipus/$id" params={{ id: b.id }}>
							UR233 · {b.id}
						</Link>
						,{" "}
						<Link to="/khipus/$id" params={{ id: c.id }}>
							UR232 · {c.id}
						</Link>
					</span>
					<span>
						Ethnologisches Museum, Berlin, VA 42518 and VA 63038 (A and B)
					</span>
					<span>
						Recorded by Marcia and Robert Ascher; by Gary Urton, entered 2013
					</span>
				</>
			}
		>
			<StrandWeave
				top={[PACHACAMAC_ID]}
				bottom={[HUACHO_B_ID, HUACHO_A_ID]}
				names={WEAVE_NAMES}
				spliced="bottom"
				variant="divider"
				caption={false}
				interactive={false}
			/>
			<EvidenceDeck
				items={[
					{
						value: `${agree}/${compared}`,
						label: "fields hold the same number",
						note: "across 42 units, field for field, in order",
					},
					{
						value: `${exactB} of 15`,
						label: "summary sums exact with the other khipu's figures",
						note: `${exactA} of 15 with the figures on its own cords`,
					},
					{
						value: `${DISTANCES.pachacamacHuacho} km`,
						label: "between the catalogued find-spots",
						note: "Pachacámac and Huacho, on the same coast",
					},
					{
						value: "1503–1647",
						label: "radiocarbon range of the Huacho pieces",
						note: "late Inka or early colonial; the Pachacámac khipu is undated",
					},
				]}
			/>

			<Step n={1} title="The objects">
				<Prose>
					<p>
						The Ethnologisches Museum in Berlin holds more khipus in this corpus
						than any other collection, and two of its khipus carry this account.
						Neither has an excavation record; each reached the museum with a
						place name attached and little else.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The two objects as the museum photographs them, with what the
							catalogue and the recorded cords say about each. The outlines on
							the first photograph mark the three parts the Aschers read in the
							spacing of its groups.
						</>
					}
				>
					<div className="object-files">
						<ObjectFile
							heading="VA 42518"
							sub="AS175 · KH0192 · “Pachacámac”"
							photo={
								<Photo
									src={imageUrl("images/tied-twice/va42518.jpg")}
									srcSet={`${imageUrl("images/tied-twice/va42518-1000.jpg")} 1000w, ${imageUrl("images/tied-twice/va42518.jpg")} 1800w`}
									sizes="(max-width: 860px) 100vw, 560px"
									width={1800}
									height={1251}
									alt="Khipu VA 42518 laid flat: a long horizontal primary cord with two dense blocks of tan and olive pendant cords and a small bunch of three groups hanging between them."
									marks={[
										{
											box: [7.5, 8, 39.5, 88],
											label: "part 1 · 21 groups",
											tone: "muted",
										},
										{
											box: [49.5, 8, 8.5, 52],
											label: "part 2 · 3 groups",
											at: "below",
										},
										{
											box: [61, 8, 37.5, 88],
											label: "part 3 · 21 groups",
											tone: "muted",
										},
									]}
									credit={PHOTO_CREDIT}
								/>
							}
							rows={[
								{ term: "Museum", value: "Ethnologisches Museum, Berlin" },
								{
									term: "Acquired",
									value:
										"1907, with the collection of Wilhelm Gretzer; the purchase financed by Julius van der Zypen",
								},
								{ term: "Catalogued as", value: "Peru, Pachacámac" },
								{
									term: "Museum dating",
									value: "Inka period, 1400–1550 (not radiocarbon dated)",
								},
								{ term: "Size", value: "90 × 83 cm; cotton" },
								{
									term: "Museum note",
									value: (
										<q>
											three groups of pendant strings, an A-B-A configuration of
											21 × 5, 3 × 5 and 21 × 5; green, blue, tan, brown, white
											pendants always in the same order; the main cord broken at
											the start
										</q>
									),
								},
								{
									term: "Recorded by",
									value: "Marcia and Robert Ascher, as AS175",
								},
								{
									term: "Cords",
									value: `${total(a)} pendants and ${a.stats.nSubsidiaries} subsidiaries in ${a.stats.nGroups} groups; ${a.stats.nKnots} knots`,
								},
								{
									term: "Primary cord",
									value: `${a.primary.length} cm, brown and white, ${twistWord(a.primary.twist)}, broken at its beginning`,
								},
							]}
						/>
						<ObjectFile
							heading="VA 63038"
							sub="UR233 · KH0470 and UR232 · KH0469 · “Huachó”"
							photo={
								<Photo
									src={imageUrl("images/tied-twice/va63038.jpg")}
									srcSet={`${imageUrl("images/tied-twice/va63038-1000.jpg")} 1000w, ${imageUrl("images/tied-twice/va63038.jpg")} 1800w`}
									sizes="(max-width: 860px) 100vw, 560px"
									width={1800}
									height={937}
									alt="Khipu VA 63038 laid on a table: a thick pale primary cord runs down the middle with pendant cords fanning out to both sides, and a colour scale beside it."
									marks={[
										{
											box: [40, 36, 8, 30],
											label: "the splice and the museum label",
											at: "below",
										},
									]}
									credit={PHOTO_CREDIT}
								/>
							}
							rows={[
								{ term: "Museum", value: "Ethnologisches Museum, Berlin" },
								{
									term: "Acquired",
									value:
										"no collector or date in the online record; the accession series VA 63038–63043 also holds a second Huacho khipu and three from Nazca",
								},
								{ term: "Catalogued as", value: "Peru, Huachó" },
								{
									term: "Dating",
									value: `museum: Inka period, 1400–1550; radiocarbon ${RADIOCARBON.bp} BP (${RADIOCARBON.lab}), 1503–1592 or 1615–1647`,
								},
								{ term: "Size", value: "82 × 80 cm; cotton" },
								{
									term: "Museum note",
									value: (
										<q>
											irregular groupings with tan, brown and blue colours in
											monochrome, speckled and spliced combinations; knots tied
											to both recto and verso of the main string; main string 4
											mm, pendants 1.5–2.5 mm
										</q>
									),
								},
								{
									term: "Recorded by",
									value:
										"Gary Urton, as two pieces, UR232 and UR233, entered 1 May 2013",
								},
								{
									term: "Cords",
									value: `UR233: ${total(b)} pendants, ${b.stats.nSubsidiaries} subsidiaries, ${b.stats.nKnots} knots. UR232: ${total(c)} pendants, ${c.stats.nSubsidiaries} subsidiaries, ${c.stats.nKnots} knots`,
								},
								{
									term: "Primary cords",
									value: `${b.primary.length} cm and ${c.primary.length} cm, ${twistWord(b.primary.twist)}, each spliced at its beginning to the other`,
								},
							]}
						/>
					</div>
				</Wide>
				<Prose>
					<p>
						VA 42518 was bought in 1907 with the collection of Wilhelm Gretzer,
						a German merchant in Lima, and catalogued as coming from Pachacámac,
						the shrine in the Lurín valley south of the city. Some fifty khipus
						in this corpus share that accession series and provenance; the
						Aschers' notes call them "the Pachacamac quipus" and warn that the
						attribution is the dealer's, not an excavator's. Marcia and Robert
						Ascher recorded it as AS175.
					</p>
					<p>
						VA 63038 is a later accession catalogued as coming from Huacho, some
						150 km up the coast: two pieces, each spliced at its beginning to
						the other, which Gary Urton recorded as UR232 and UR233. A thread
						from it was radiocarbon dated at the University of Georgia:{" "}
						{RADIOCARBON.bp} years before 1950, calibrated to 1503–1592 (73%) or
						1615–1647 (27%); late Inka or early colonial.{" "}
						<Conf level="firm">Catalogue record</Conf>
					</p>
					<p>
						The Khipu Field Guide lists thirteen publications for AS175 and two
						for the Huacho pieces; none connects them. Urton's 2005 survey of
						duplicate accounts names three matched pairs in the Berlin
						collection, not including this one. This project found the match by
						scanning the 684 khipus with published cords for groups whose
						numbers recur, in order, on another khipu.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The three records at one spacing per cord: AS175 above, the two
							Huacho pieces below, joined at their splice. Each thread joins a
							field of AS175 to the cord that carries it on UR233 (part 1) or
							UR232 (part 3); solid where the numbers are the same, dashed where
							a knot apart, red and barred where they differ, dotted with a ring
							where the Huacho cord is blank. {agree} of {compared} fields hold
							the same number. Part 2, the three summary groups, has no thread
							to either piece.
						</>
					}
				>
					<StrandWeave
						top={[PACHACAMAC_ID]}
						bottom={[HUACHO_B_ID, HUACHO_A_ID]}
						names={WEAVE_NAMES}
						spliced="bottom"
						marks={[
							{
								id: PACHACAMAC_ID,
								from: parts.p1.from,
								to: parts.p1.to,
								label: "part 1 · 21 groups",
							},
							{
								id: PACHACAMAC_ID,
								from: parts.p2.from,
								to: parts.p2.to,
								label: "part 2 · summary · no counterpart",
								tone: "key",
							},
							{
								id: PACHACAMAC_ID,
								from: parts.p3.from,
								to: parts.p3.to,
								label: "part 3 · 21 groups",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={2} title="The makers">
				<Prose>
					<p>
						Their names are not recorded. They were presumably khipukamayuq, the
						specialists who kept Inka records on knotted cord. The numbers are
						tied as clusters of knots, one cluster per decimal place, the units
						nearest the free end. A long knot of two to nine turns is a units
						digit; single overhand knots count tens, hundreds and thousands; a
						figure-of-eight knot is a one in the units. Leland Locke established
						this in 1923 from khipus whose top cords summed their pendants, and
						every number in this story is read that way.
					</p>
					<p>
						Colour, attachment side, ply direction, subsidiaries and knotless
						cords may carry further distinctions. The comparison shows which of
						these the two makers shared and which they did not.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The green cord of group 13 on AS175 and the cord in the same field
							of UR233's thirteenth unit both read 177: a single knot for the
							hundred, seven singles for the tens, a seven-turn long knot for
							the units. The Pachacámac cord is 50 cm long and its long knot is
							tied Z; the Huacho cord is 36 cm and its long knot is tied S.
						</>
					}
				>
					<div className="hands">
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>AS175, pendant {hand177.a?.name.slice(1)}: 177</h3>
									<p>
										Dark grayish green, {hand177.a?.length} cm, recorded by the
										Aschers.
									</p>
								</figcaption>
								{hand177.a && (
									<CordReader
										cord={hand177.a}
										colors={colors}
										pxPerCm={5}
										title="Pendant 62 of AS175, read as 177"
									/>
								)}
							</div>
						</div>
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>UR233, pendant {hand177.b?.name.slice(1)}: 177</h3>
									<p>
										Grayish blue, {hand177.b?.length} cm, recorded by Urton.
									</p>
								</figcaption>
								{hand177.b && (
									<CordReader
										cord={hand177.b}
										colors={colors}
										pxPerCm={5}
										title="Pendant 76 of UR233, read as 177"
									/>
								)}
							</div>
						</div>
					</div>
				</Wide>
				<Prose>
					<p>
						Colonial chroniclers describe Inka record keeping as deliberately
						redundant. Garcilaso de la Vega, whose mother was Inka and who grew
						up in Cuzco, put it this way:
					</p>
				</Prose>
				<Wide>
					<PullQuote
						label="Colonial testimony"
						translation={
							<>
								Although every village, however small, had its own quipucamayus,
								and the larger ones had up to twenty or thirty, they all kept
								the same registers; and though a single one would have sufficed,
								the Incas preferred to have many, so that no fault should go
								unnoticed.
							</>
						}
						original={
							<>
								...aunque el pueblo fuese pequeño, había en él cuatro
								quipucamayus, y de allí arriba hasta veinte y treinta, y todos
								tenían unos mismos registros; y aunque por ser los registros
								todos unos, bastaba que hubiera un contador, querían los Incas
								que hubiese muchos en cada pueblo y en cada facultad, por
								excusar la falsedad que podía haber entre los pocos.
							</>
						}
						lang="es"
						cite={
							<>
								Inca Garcilaso de la Vega, Comentarios reales de los Incas
								(Lisbon, 1609), book VI, chapter 9. The English follows Harold
								Livermore's translation (Austin, 1966).
							</>
						}
					/>
				</Wide>
				<Prose>
					<p>
						Garcilaso is not always reliable, and he wrote in Spain forty years
						after leaving Peru. But the practice he describes would leave pairs
						like this one: the same figures in the same order, tied by two
						people who did not share a colour code.{" "}
						<Conf level="likely">Redundant records</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={3} title="The recorders">
				<Prose>
					<p>
						Two generations of scholars recorded the cords. As far as the
						published record shows, neither compared these two objects.
					</p>
				</Prose>
				<Wide>
					<Profiles
						items={[
							{
								name: "Marcia and Robert Ascher",
								dates: "1935–2013 · 1931–2014",
								role: "Recorded AS175",
								body: (
									<>
										A mathematician at Ithaca College and an anthropologist at
										Cornell, the Aschers spent the 1970s recording khipus cord
										by cord in museum collections. Their databooks, circulated
										on microfiche from 1978 and analysed in{" "}
										<em>Code of the Quipu</em> (1981), were the first large
										corpus of khipus recorded as numbers. VA 42518 is their
										175th.
									</>
								),
								saw: (
									<>
										Forty-five groups of five in three parts, a fixed colour
										order in part 1, and a relation between part 2 and the sums
										of part 3. They also recorded VA 63042 and VA 63043, in the
										Huacho khipu's accession series, but not VA 63038.
									</>
								),
							},
							{
								name: "Gary Urton",
								dates: "born 1946",
								role: "Recorded UR232 and UR233",
								body: (
									<>
										Professor of Pre-Columbian studies at Harvard, Urton founded
										the Khipu Database Project in 2002, combining the Ascher
										records with his own, and recorded several hundred khipus
										himself. His 2005 paper on "khipu archives" documented
										duplicate accounts in the surviving corpus, and his
										radiocarbon programme with Alexander Cherkinsky dated the
										Huacho khipu. He entered VA 63038 as two pieces on 1 May
										2013.
									</>
								),
								saw: (
									<>
										Two pieces spliced beginning to beginning, one hitched recto
										throughout and the other verso; 24 groups on one, 21 on the
										other; every long knot tied S. His 2005 list of matched
										pairs in Berlin does not include this one.
									</>
								),
							},
							{
								name: "This comparison",
								dates: "September 2026",
								role: "Set them side by side",
								body: (
									<>
										This project's scan of the 684 khipus with published cords
										for runs of five values that recur, in order, on another
										khipu returned 104 pairs. Nine share five or more runs: a
										duplicated database record, pairs Urton had already matched,
										and AS175 against the two Huacho pieces. The rest of this
										page goes through that match cord by cord.
									</>
								),
								saw: (
									<>
										{agree} of {compared} fields identical across 42 units; the
										Aschers' summary relation holds more often with the Huacho
										figures than with the Pachacámac ones.
									</>
								),
							},
						]}
					/>
				</Wide>
				<Prose>
					<p>
						The Aschers' note on AS175 is unusually full. The three-part
						structure and the summary relation were on record decades before the
						Huacho cords were.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The Aschers' catalogue note for AS175, as transcribed into the
							Open Khipu Repository. Their colour codes: W white, LB deep brown,
							YG green, YB light brown, YB:0G light brown mottled with olive.
							The equation and the table they refer to are not in the
							transcription.
						</>
					}
				>
					<Facsimile
						heading="AS175 · notes"
						sub="Marcia and Robert Ascher, Code of the Quipu: Databook"
						lines={[
							"This is one of several quipus acquired by the Museum in 1907 with provenance Pachacamac. For a list of them, see AS97.",
							"By spacing, the quipu is separated into 45 groups of 5 pendants each. There is a larger space after every 3rd group and a still larger space between the 21st and 22nd groups and the 24th and 25th groups. Thus, the quipu is in 3 parts: part 1 is 7 sets of 3 groups each; part 2 is 1 set of 3 groups; and part 3 is 7 sets of 3 groups.",
							"All groups in part 1 have the same color pattern: W (with a W subsidiary); LB (with an LB subsidiary); YG; YB; YB:0G. Groups in parts 2 and 3 have the same pattern for the first 3 pendant positions and then vary in one or both of the last 2 positions. Calling the colors in the part 1 pattern C1–C5, the color patterns are summarized in Table 1. (See table in notes)",
							"In parts 1 and 3, many values are repeated in the same position in consecutive groups or in the same position 2 groups later. The former can be represented as P(i,j) = P(i+1,j) and the latter as P(i,j) = P(i+2,j). In part 1, these hold in 20 and 12 places respectively; in part 2 in no places; and in part 3 in 27 and 18 places.",
							"The values in part 2 are related to the sums of values in part 3. Position by position, values in group 1 of part 2 are related to the sums of values in the first groups in each of the 7 sets in part 3; group 2 values are related to sums of values in the second groups of each of the sets; and group 3 values to the sums of values of the third group. (see equation)",
						]}
						cite="Open Khipu Repository, khipu_main.NOTES for KH0192; punctuation as transcribed, subscripts set inline."
					/>
				</Wide>
				<Wide
					caption={
						<>
							AS175 as recorded, and with the Aschers' three parts marked. The
							three groups of part 2, in blue, carry five of the six largest
							values on the khipu.
						</>
					}
				>
					<LayerTabs
						value={layer}
						onChange={setLayer}
						options={[
							{ value: "recorded", label: "As recorded" },
							{ value: "parts", label: "Three parts" },
						]}
					/>
					<KhipuDiagram
						khipu={a}
						colors={colors}
						layout={OVERVIEW}
						style="physical"
						paint={paint}
						groupBand={groupBand}
						groupLabel={groupLabel}
						showGroups
						tooltip={layer === "recorded"}
						fit
					/>
					{layer === "parts" && (
						<Legend
							items={[
								{
									color: "var(--band-a)",
									label: "parts 1 and 3, 21 groups each",
								},
								{ color: "var(--band-b)", label: "part 2, three groups" },
								{ color: "var(--accent)", label: "part 2 cords" },
							]}
						/>
					)}
				</Wide>
				<Wide caption="Timeline: what is known of the two objects and their records.">
					<Timeline
						events={[
							{
								when: "late 1400s",
								track: "world",
								title: "The Inka take the central coast",
								body: "Pachacámac becomes a provincial shrine of the empire; the valleys north to Huaura fall under the same administration.",
							},
							{
								when: "1503–1647",
								track: "object",
								span: true,
								title: "The Huacho khipu's cotton grows",
								body: "Radiocarbon range at two sigma for VA 63038. The Pachacámac khipu has not been dated.",
							},
							{
								when: "1533",
								track: "world",
								title: "Hernando Pizarro reaches Pachacámac",
								body: "The shrine is sacked in January; within a decade the coastal valleys are under Spanish encomienda, and khipus are read in colonial courts.",
							},
							{
								when: "1609",
								track: "world",
								title: "Garcilaso describes the record keepers",
								body: "Comentarios reales, book VI: several quipucamayus per village, all keeping the same registers.",
							},
							{
								when: "1907",
								track: "object",
								title: "VA 42518 enters the Berlin museum",
								body: "With the Gretzer collection, financed by Julius van der Zypen, catalogued Pachacámac.",
							},
							{
								when: "date unknown",
								track: "object",
								title: "VA 63038 is accessioned",
								body: "Catalogued Huachó. The online record gives no collector or date.",
							},
							{
								when: "1970s",
								track: "record",
								title: "The Aschers record AS175",
								body: "Every cord recorded; the three parts and the summary relation noted. Published on microfiche in 1978.",
							},
							{
								when: "2005",
								track: "record",
								title: "Urton publishes the duplicate accounts",
								body: "Khipu Archives, in Latin American Antiquity: matched pairs from Puruchuco and Berlin. Not this pair.",
							},
							{
								when: "2011",
								track: "record",
								title: "AS175 enters the Khipu Database",
								body: "The Ascher record for VA 42518 is keyed into the Harvard database on 11 November.",
							},
							{
								when: "2013",
								track: "record",
								title: "Urton records VA 63038",
								body: "Entered as UR232 and UR233 on 1 May, each noted as spliced at its beginning to the other.",
							},
							{
								when: "2014",
								track: "record",
								title: "The Huacho khipu is radiocarbon dated",
								body: "Cherkinsky and Urton, sample 63038, UGAMS-4574.",
							},
							{
								when: "2026",
								track: "record",
								title: "The two records are compared",
								body: "This project's scan for shared runs of values across the published corpus pairs AS175 with UR233 and UR232.",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={4} title="The same numbers, six cords at a time">
				<StrandWeave
					top={[PACHACAMAC_ID]}
					bottom={[HUACHO_B_ID, HUACHO_A_ID]}
					names={WEAVE_NAMES}
					spliced="bottom"
					variant="divider"
					reveal={false}
					highlight={stepHl}
					caption={false}
					className="tt-locator"
				/>
				<p className="pair-weave-note">
					The whole account, with part 1 and UR233 lit.
				</p>
				<Prose>
					<p>
						UR233 has {total(b)} pendants. Its recorder split them into 24
						groups by spacing, several of them fragments of one or two cords;
						read in sixes from the first cord, they form 21 units. Set unit 1
						beside group 1 of AS175, unit 2 beside group 2, and so on, and the
						same numbers appear in the same order, with one rule: the third cord
						of every Huacho unit is blank, and the five around it are the five
						fields of the Pachacamac group.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Part 1 of AS175 above, UR233 hung upside-down beneath it so the
							cords meet tip to tip. A line joins each field to the cord in the
							same position of the six-cord unit; blue where the numbers agree.
						</>
					}
				>
					<PairStage
						a={a}
						b={b}
						side={sideB}
						colors={colors}
						aliasA="AS175"
						highlights={highlightsB}
					/>
				</Wide>
				<Wide
					caption={
						<>
							Every unit of UR233 against the group of AS175 in the same
							position. Chips outlined in blue hold the number the other khipu
							records in that field.
						</>
					}
				>
					<PairTable
						rows={rowsB}
						colors={colors}
						aliasA="AS175 part 1"
						aliasB="UR233"
						blankAt={sideB.blankAt}
					/>
				</Wide>
				<Prose>
					<p>
						Across the 21 units, {statsText(statsB)}. The two outright
						disagreements are{" "}
						{diffsB
							.filter((d) => d.verdict === "no")
							.map(
								(d) =>
									`${fmt(d.va)} against ${fmt(d.vb)} in unit ${d.unit + 1}`,
							)
							.join(" and ")}
						. Of the 104 pairs our scan found sharing a run of five consecutive
						values, nine share five or more runs: a duplicated database record,
						pairs Urton had already matched, and this one.{" "}
						<Conf level="firm">Field-for-field match</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={5} title="The other piece">
				<StrandWeave
					top={[PACHACAMAC_ID]}
					bottom={[HUACHO_B_ID, HUACHO_A_ID]}
					names={WEAVE_NAMES}
					spliced="bottom"
					variant="divider"
					reveal={false}
					highlight={stepHl}
					caption={false}
					className="tt-locator"
				/>
				<p className="pair-weave-note">
					The whole account, with part 3 and UR232 lit.
				</p>
				<Prose>
					<p>
						UR232 is spliced to UR233 and shares its accession number. It too is
						21 units of six, and it restates part 3 of AS175, groups 25 to 45,
						in the same way, except that the blank cord is fourth rather than
						third. Its match is looser. {statsText(statsA)}.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Part 3 of AS175 above, UR232 beneath. Grey lines mark fields whose
							numbers differ; the third unit's 108 against 18 is picked up again
							in step 8.
						</>
					}
				>
					<PairStage
						a={a}
						b={c}
						side={sideA}
						colors={colors}
						aliasA="AS175"
						highlights={highlightsA}
					/>
				</Wide>
				<Wide caption="Every unit of UR232 against groups 25 to 45 of AS175.">
					<PairTable
						rows={rowsA}
						colors={colors}
						aliasA="AS175 part 3"
						aliasB="UR232"
						blankAt={sideA.blankAt}
					/>
				</Wide>
				<Wide
					caption={
						<>
							The join, in the museum's photograph: the pale primary cord with
							the museum's label tied to it, pendants hitched to both sides.
							Urton's notes record each piece as spliced at its beginning to the
							other.
						</>
					}
				>
					<div className="photo-pair">
						<div className="figure">
							<Photo
								src={imageUrl("images/tied-twice/va63038-splice.jpg")}
								width={620}
								height={700}
								alt="Close-up of the middle of khipu VA 63038: a thick pale cord runs top to bottom, a small white museum label hangs from it, and thin tan cords fan out left and right."
								credit={PHOTO_CREDIT}
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>The join</h3>
							</figcaption>
							<div className="figure-body prose">
								<p>
									Along the joined cord one restatement runs toward the splice
									and the other away from it. Every pendant of UR232 is attached
									verso ({attC.V ?? 0} of {total(c)}) and every pendant of UR233
									recto ({attB.R ?? 0} of {total(b)}). This is consistent with
									one khipu, tied one way throughout, whose two halves were
									recorded from opposite ends. Whether the pieces were one cord
									before the splice, and whether a summary like part 2 once sat
									between them, the record does not show.{" "}
									<Conf level="open">One object or two</Conf>
								</p>
							</div>
						</div>
					</div>
				</Wide>
			</Step>

			<Step n={6} title="What the Huacho copy has lost">
				<Prose>
					<p>
						On AS175 a subsidiary hangs from all {subCounts[0].n} surviving
						white cords and all {subCounts[1].n} deep brown ones, and from no
						cord of any other field. On the Huacho pieces those positions carry
						stubs: {stubsB.length} subsidiaries on UR233 and {stubsA.length} on
						UR232 are recorded as broken within 3 cm of the cord, all but three
						of them on the first cord of a unit. Five subsidiaries on UR233
						survive at full length.
					</p>
				</Prose>
				<Wide caption="The five subsidiaries that survive on UR233, each against the subsidiary AS175 carries on the same field of the same group.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Unit</th>
									<th>UR233 cord</th>
									<th>Its subsidiary</th>
									<th>AS175 cord</th>
									<th>Its subsidiary</th>
									<th>Check</th>
								</tr>
							</thead>
							<tbody>
								{subsB.map((s) => (
									<tr key={s.b.name}>
										<td className="num">{s.unit + 1}</td>
										<td>
											{s.b.parent}{" "}
											<span className="muted">
												{FIELDS[s.field].label} field
											</span>
										</td>
										<td>
											<Chip cord={s.b} colors={colors} />{" "}
											<span className="muted">{s.b.length} cm</span>
										</td>
										<td>{s.a?.name}</td>
										<td>
											{s.aSub ? (
												<>
													<Chip cord={s.aSub} colors={colors} />{" "}
													<span className="muted">{s.aSub.length} cm</span>
												</>
											) : (
												<span className="muted">none</span>
											)}
										</td>
										<td className={verdictClass(s.verdict)}>
											{VERDICT_TEXT[s.verdict]}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						{subsBExact === subsB.length
							? "All five"
							: `${subsBExact} of the five`}{" "}
						hold the number AS175 holds. This suggests the Huacho pieces once
						carried the same subsidiaries in the same places, since broken or
						cut off;{" "}
						{subsA.length === 0
							? "none survives on UR232"
							: `${subsA.length} survive on UR232`}
						. The blank cords went the other way: on UR233 {blanksBFull} of the
						21 are full length, {blanksBLen[0]} to {blanksBLen[1]} cm, knotless
						and mostly mottled; on UR232 {blanksAStub} of the 21 are stubs under
						3 cm. A cord tied into every unit and never knotted is more likely a
						marker than a number. The Pachacamac khipu has no such cord, so it
						gives no clue to what the marker meant.{" "}
						<Conf level="likely">Subsidiaries cut away</Conf>{" "}
						<Conf level="open">The blank cord</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={7} title="Where they differ">
				<Prose>
					<p>
						In the first five units of UR233 the light brown field reads{" "}
						{firstFive.map((r) => fmt(r.fields[3].vb)).join(", ")} where AS175
						reads 100 {plusTen} times over, and the white field is one knot off
						in {firstFive.filter((r) => r.fields[0].verdict === "one").length}{" "}
						of the five. From unit 7 on, the two agree. One reading is that one
						khipu records a later state of the first five entries.
					</p>
					<p>
						The colours differ. AS175 uses five colours in a fixed order. UR233
						uses fourteen: the Aschers' green field is grayish green in some
						units and grayish blue in others, the light brown field is light
						brown for nine units and then light yellowish brown, and the white
						field is white in four units and light brown in all but one of the
						rest. UR232 differs again. If colour carried meaning beyond marking
						the field, the two makers did not share it.
					</p>
				</Prose>
				<Wide caption="What each field is called on the three records: the fixed colour of AS175, then the colours UR233 and UR232 use in that position, with the number of units each colour serves.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Field</th>
									<th>AS175</th>
									<th>UR233 (part 1)</th>
									<th>UR232 (part 3)</th>
								</tr>
							</thead>
							<tbody>
								{FIELDS.map((f) => (
									<tr key={f.code}>
										<td>{f.i + 1}</td>
										<td>
											<span className="chip">
												<i
													style={{
														background: hexFor(f.code.split(":")[0], colors),
													}}
													aria-hidden="true"
												/>
												{f.code}
											</span>{" "}
											<span className="muted">{f.label}</span>
										</td>
										{[coloursB, coloursA].map((cols, ci) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: two fixed columns
											<td key={ci}>
												<span className="chips">
													{cols[f.i].colours.slice(0, 4).map((x) => (
														<span key={x.code} className="chip">
															<i
																style={{
																	background: hexFor(
																		x.code.split(/[:\-(]/)[0],
																		colors,
																	),
																}}
																aria-hidden="true"
															/>
															{x.code.replace(/\(.*$/, "")}{" "}
															<span className="muted">×{x.n}</span>
														</span>
													))}
													{cols[f.i].colours.length > 4 && (
														<span className="muted">
															+{cols[f.i].colours.length - 4} more
														</span>
													)}
												</span>
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						The hands differ too. AS175's long knots are tied Z in{" "}
						{longA.Z ?? 0} cases and S in {longA.S ?? 0}; on the Huacho pieces
						every long knot is S ({longB.S ?? 0} and {longC.S ?? 0}), with the
						single knots Z on all three. And AS175's cords are longer: the
						hundreds of a part-1 cord sit around 20 cm from the primary and the
						units around 35, against 11 and 25 on UR233. The numbers and order
						match; the cordage, knotting and colours do not.{" "}
						<Conf level="firm">Different makers</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={8} title="The summary that checks both">
				<Prose>
					<p>
						Part 2 of AS175 is three groups of five, every cord in the tens or
						hundreds. The Aschers proposed that part 3's seven sets of three
						groups are what they total: the first summary group holds, field by
						field, the sum of the first group of every set, and likewise for the
						second and third. That gives fifteen sums, which can be checked
						against AS175's own part 3 or against UR232.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The three summary groups: the short bunch between the two long
							blocks in the museum's photograph. Its fifteen cords include five
							of the six largest values on the khipu.
						</>
					}
				>
					<div className="photo-pair">
						<div className="figure">
							<Photo
								src={imageUrl("images/tied-twice/va42518-part2.jpg")}
								width={760}
								height={900}
								alt="Close-up of the middle of khipu VA 42518: the end of one dense block of cords, a gap, and the shorter bunch of the three summary groups."
								credit={PHOTO_CREDIT}
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>Two checks</h3>
							</figcaption>
							<div className="figure-body prose">
								<p>
									A summary group is a claim about other cords: this one should
									equal the sum of those seven. On AS175 alone the claim can be
									tested against the seven cords the Aschers recorded. Because
									UR232 restates the same positions, it can also be tested
									against a different recorder's reading of a different maker's
									knots. Where the two tests disagree, the summary indicates
									which detail record it agrees with.
								</p>
							</div>
						</div>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							The summary test drawn: each of the fifteen cords of part 2
							(above) fans out to the seven UR232 cords the Aschers' rule adds
							into it (below). {exactB} fans add up exactly
							{oneB ? `, ${oneB} are a single knot off (dashed)` : ""}, and the{" "}
							{15 - exactB - oneB} red, barred fans miss (the buttons above, in
							the same marks). One fan is drawn at a time, with each term's
							value under its cord and the terms' sum at the fan point: group{" "}
							{pick.k + 22}, {FIELDS[pick.field].label} field,{" "}
							{fmt(pick.target.value)}. UR232's seven terms give{" "}
							{fmt(pick.sumB)} ({VERDICT_TEXT[pick.verdictB]}); AS175's own give{" "}
							{fmt(pick.sumA)} ({VERDICT_TEXT[pick.verdictA]}). AS175 cannot be
							fanned into itself, so its own sums are in the table below.
						</>
					}
				>
					<div className="tt-fan-pick" role="toolbar" aria-label="Summary cord">
						{summary.map((r, i) => (
							<button
								key={r.target.name}
								type="button"
								className={`btn is-${r.verdictB}`}
								aria-pressed={i === pickAt}
								onClick={() => setPick(i)}
								title={`Group ${r.k + 22}, ${FIELDS[r.field].label}: ${fmt(r.target.value)}; UR232 terms ${fmt(r.sumB)}`}
							>
								{fmt(r.target.value)}
							</button>
						))}
					</div>
					<StrandWeave
						top={[PACHACAMAC_ID]}
						bottom={[HUACHO_A_ID]}
						names={WEAVE_NAMES}
						threads={fan}
						marks={fanMarks}
						className="tt-fan"
						highlight={{
							id: PACHACAMAC_ID,
							from: cordAt(indexA, pick.target),
							to: cordAt(indexA, pick.target) + 1,
						}}
						caption={false}
					/>
				</Wide>
				<Wide
					caption={
						<>
							Each row is one cord of part 2 against the seven cords it should
							total. The seven terms are shown as AS175 records them, outlined
							in blue where UR232 records the same number; the two sums follow.
						</>
					}
				>
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Summary cord</th>
									<th>Field</th>
									<th>Seven terms, as AS175 records them</th>
									<th className="num">AS175 sum</th>
									<th>Check</th>
									<th className="num">UR232 sum</th>
									<th>Check</th>
								</tr>
							</thead>
							<tbody>
								{summary.map((r) => (
									<tr key={r.target.name}>
										<td>
											<Chip cord={r.target} colors={colors} />{" "}
											<span className="muted">g{PARTS[1].from + r.k + 1}</span>
										</td>
										<td>{FIELDS[r.field].label}</td>
										<td>
											<span className="chips">
												{r.terms.map((t) =>
													t.a ? (
														<Chip
															key={t.a.name}
															cord={t.a}
															colors={colors}
															match={
																t.b != null &&
																(t.a.value ?? 0) === (t.b.value ?? 0)
															}
														/>
													) : (
														<span key={t.group} className="chip muted">
															—
														</span>
													),
												)}
											</span>
										</td>
										<td className="num">{r.sumA}</td>
										<td className={verdictClass(r.verdictA)}>
											{VERDICT_TEXT[r.verdictA]}
										</td>
										<td className="num">
											{r.sumB}
											{r.partial && <span className="muted">*</span>}
										</td>
										<td className={verdictClass(r.verdictB)}>
											{VERDICT_TEXT[r.verdictB]}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="ledger-summary">
							With AS175's own part 3, {exactA} of 15 sums are exact and {oneA}{" "}
							off by one. With UR232's values, {exactB} are exact and {oneB} off
							by one. * UR232's unit 19 has five cords, so one term is missing
							and counted as 0.
						</p>
					</div>
				</Wide>
				<Prose>
					<p>
						An example is the green cord of the third summary group,{" "}
						{fmt(row335.target.value)}. AS175's seven terms sum to {row335.sumA}
						; UR232's sum to {row335.sumB}. The difference is one knot. Pendant
						132 of AS175 carries a single knot at 15 cm and an eight-turn long
						knot at 25.5 cm, which the Aschers read as 108; the same cord on
						UR232 has its single knot at 17.5 cm, which Urton read as 18. On
						this stretch of AS175 the hundreds of other cords sit at 13 to 15.5
						cm and their tens at 15.5 to 22, so a single knot at 15 cm sits on
						the boundary. The summary the Aschers identified is consistent with
						18.
					</p>
				</Prose>
				<Wide caption="The same cord on the two khipus. Only the place assigned to the single knot differs; the summary favours 18.">
					<div className="figures">
						<div className="figure">
							<figcaption>
								<h3>AS175, pendant 132: read as 108</h3>
							</figcaption>
							<CordReader
								cord={p132}
								colors={colors}
								pxPerCm={5}
								title="Pendant 132 of AS175, read as 108"
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>UR232, pendant 15: read as 18</h3>
							</figcaption>
							<CordReader
								cord={p15}
								colors={colors}
								pxPerCm={5}
								title="Pendant 15 of UR232, read as 18"
							/>
						</div>
					</div>
				</Wide>
				<Prose>
					<p>
						The deep brown field shows a larger gap. Its first two summary cords
						read 35 and 36. AS175's terms sum to 78 and 78; UR232's sum to 35
						and 36. Field by field, the Pachacamac summary agrees with the
						Huacho details more often than with its own. This suggests the two
						khipus are not simply a record and its copy but two records of one
						account, with the totals tied when the figures stood closer to the
						Huacho version. <Conf level="firm">Sums verified</Conf>{" "}
						<Conf level="likely">Two independent records</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={9} title="Two find-spots">
				<Wide>
					<div className="map-split">
						<CoastMap />
						<div className="prose">
							<p>
								Pachacámac lies in the Lurín valley, {DISTANCES.pachacamacLima}{" "}
								km south-east of the centre of Lima. It was a major coastal
								oracle long before the Inka, who built a Temple of the Sun there
								and made it a provincial centre. Its cemeteries were dug for
								antiquities through the nineteenth century, and dozens of khipus
								labelled "Pachacámac" reached museums in Berlin, Lima and
								elsewhere; Gretzer's are the largest such group.
							</p>
							<p>
								Huacho stands at the mouth of the Huaura valley,{" "}
								{DISTANCES.limaHuacho} km north-west of Lima along the coast
								road, in former Inka territory. Berlin holds a second khipu
								catalogued from there, VA 63040, in the same accession series as
								this one. The straight-line distance between the two find-spots
								is {DISTANCES.pachacamacHuacho} km.
							</p>
							<p>
								Neither attribution rests on an excavation record. The Gretzer
								lot's "Pachacámac" is the collector's label; the Aschers
								themselves list the khipus it covers and say no more of where
								they were found. VA 63038's "Huachó" comes with no collector and
								no date. The two names record what dealers said, not necessarily
								where the cords were tied. <Conf level="open">Provenance</Conf>
							</p>
						</div>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							The radiocarbon result for VA 63038, calibrated at two sigma:{" "}
							{RADIOCARBON.bp} years before 1950, sample {RADIOCARBON.lab}. The
							Spanish invasion falls inside the earlier range, so the cotton may
							date from Inka rule or the first colonial decades.
						</>
					}
				>
					<Radiocarbon
						from={1450}
						to={1700}
						ranges={RADIOCARBON.ranges}
						marks={[
							{ year: 1533, label: "Pizarro at Pachacámac, 1533" },
							{ year: 1609, label: "Garcilaso, 1609" },
						]}
						label={`Radiocarbon date of VA 63038: ${RADIOCARBON.bp} years before 1950, calibrated to 1503–1592 with 73% probability or 1615–1647 with 27%.`}
					/>
				</Wide>
			</Step>

			<Step n={10} title="Interpretation">
				<Prose>
					<p>
						Garcilaso wrote that villages kept several khipukamayuq on the same
						records, and Urton's 2005 survey found a handful of khipu pairs that
						seem to show it: the same numbers, in different colours, on two
						objects. This pair is among the larger such cases in the published
						corpus, with {agree} of {compared} fields agreeing, and the only one
						we know of where a summary on one object can be checked against the
						details on both.
					</p>
					<p>
						The pair may show something of the record-keeping process: two
						makers encoding one account, apparently at slightly different
						states, with the totals on one copy bearing on discrepancies in the
						other. The first five units of UR233 stand ten higher than AS175's;
						the summary on AS175 agrees with UR232 where AS175's own cords are a
						knot out. Neither object looks like a straight copy of the other;
						both may be working records of an account that was checked and
						revised.
					</p>
				</Prose>
				<Wide>
					<Layers
						heading="AS175 and VA 63038, read in layers"
						layers={explain(a, b, c, statsB, statsA, exactA, exactB)}
					/>
				</Wide>
				<Prose>
					<p>
						Our preferred reading: one account of 42 units in seven-by-three
						blocks, kept by two record keepers who agreed on the numbers and the
						order but not on the colours, one of whom added a blank marker cord
						to every unit. AS175 carries three groups of column totals that
						appear to have been tied when the details stood as UR232 has them.
						On provenance, either one of the dealers' labels ("Pachacámac" or
						"Huachó") is wrong, or two copies of one account ended up 150 km
						apart, as might happen if one was kept locally and the other sent
						elsewhere. <Conf level="open">One archive, two find-spots</Conf>
					</p>
					<p>
						Evidence that could settle it is in Berlin: the acquisition file for
						VA 63038, a fibre and dye comparison of the two objects, and a date
						for AS175 to compare with the 1503–1647 range of the Huacho pieces.
						The two disagreements in part 1 and the 17 in part 3 are specific
						knots that could be re-examined on the objects.
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "Marcia & Robert Ascher / Khipu Field Guide",
						what: "AS175 (KH0192), databook record and notes on its three parts",
						where:
							"khipufieldguide.com; notes transcribed in the Open Khipu Repository",
						href: "https://www.khipufieldguide.com/catalog/KH0192.html",
					},
					{
						who: "Gary Urton / Khipu Field Guide",
						what: "UR233 (KH0470) and UR232 (KH0469), VA 63038 B and A",
						where:
							"khipufieldguide.com; Harvard Khipu Database entries of May 2013",
						href: "https://www.khipufieldguide.com/catalog/KH0470.html",
					},
					{
						who: "Ethnologisches Museum, Staatliche Museen zu Berlin",
						what: "Object records and photographs, V A 42518 (Pachacámac, Gretzer collection) and V A 63038 (Huachó)",
						where:
							"search.smb.museum, retrieved September 2026; photographs CC BY-NC-SA 4.0",
						href: "https://id.smb.museum/object/39375",
					},
					{
						who: "Alexander Cherkinsky & Gary Urton",
						what: "Radiocarbon chronology of Andean khipus",
						where:
							"Open Journal of Archaeometry 2:5260, 2014, table 1, sample 63038 (UGAMS-4574)",
						href: "https://dash.harvard.edu/handle/1/16920717",
					},
					{
						who: "Gary Urton",
						what: "Khipu archives: duplicate accounts and identity labels in the Inka knotted-string records",
						where: "Latin American Antiquity 16(2), 2005",
					},
					{
						who: "Gary Urton",
						what: "Inka History in Knots: Reading Khipus as Primary Sources",
						where: "University of Texas Press, 2017, p. 261 (cites VA 63038)",
					},
					{
						who: "Marcia Ascher & Robert Ascher",
						what: "Code of the Quipu: A Study in Media, Mathematics, and Culture",
						where:
							"University of Michigan Press, 1981; the databooks, Ithaca, 1978 and 1988",
					},
					{
						who: "Leland L. Locke",
						what: "The Ancient Quipu or Peruvian Knot Record",
						where: "American Museum of Natural History, 1923",
					},
					{
						who: "Garcilaso de la Vega",
						what: "Comentarios reales de los Incas, book VI, chapter 9",
						where:
							"Lisbon, 1609; English after Harold V. Livermore, Royal Commentaries of the Incas, University of Texas Press, 1966",
					},
					{
						who: "Natural Earth",
						what: "Coastline and country outlines for the map",
						where: "naturalearthdata.com, public domain",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("LB", colors), label: "LB deep yellowish brown" },
					{ color: hexFor("YG", colors), label: "YG dark grayish green" },
					{ color: hexFor("YB", colors), label: "YB light yellowish brown" },
					{ color: hexFor("AB", colors), label: "AB light brown" },
					{ color: hexFor("RB", colors), label: "RB moderate reddish brown" },
					{ color: hexFor("PR", colors), label: "PR deep reddish brown" },
					{ color: hexFor("GG", colors), label: "GG grayish green" },
					{ color: hexFor("BG", colors), label: "BG grayish blue" },
					{ color: hexFor("LG", colors), label: "LG light greenish gray" },
					{ color: hexFor("KB", colors), label: "KB dark brown" },
				]}
			/>
			<p className="story-next">
				<Link to="/stories/tied-in-two-cities">
					Next: the same account on a Paris khipu and a Lima khipu →
				</Link>
			</p>
		</StoryPage>
	);
}

function explain(
	a: Khipu,
	b: Khipu,
	c: Khipu,
	statsB: ReturnType<typeof pairStats>,
	statsA: ReturnType<typeof pairStats>,
	exactA: number,
	exactB: number,
): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					AS175: {a.stats.nPendants} pendants and {a.stats.nSubsidiaries}{" "}
					subsidiaries in 45 groups of five, on a primary cord broken at its
					start. VA 63038: two spliced pieces, {b.stats.nPendants} and{" "}
					{c.stats.nPendants} pendants, 21 units of six each, most subsidiaries
					cut to stubs. Same museum, different accessions and provenances.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					UR233 restates part 1 of AS175 field for field ({statsB.exact} of{" "}
					{statsB.compared} exact) and UR232 part 3 ({statsA.exact} of{" "}
					{statsA.compared}), each with one blank cord added per unit. Five
					surviving subsidiaries match. Part 2 of AS175 sums part 3 by set
					position: {exactA} of 15 sums exact with AS175's own values, {exactB}{" "}
					with UR232's.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: "VA 42518 came with the Gretzer purchase of 1907, catalogued Pachacámac; VA 63038 is catalogued Huachó, without acquisition data, and radiocarbon dated 1503–1592 or 1615–1647. Garcilaso reports several khipu keepers per village keeping the same records; Urton 2005 documents three such pairs in Berlin, none this one.",
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "Probably two makers' records of one 42-unit account, differing in colour, cordage and knotting but not in the numbers; a column-total check on the Pachacamac copy that appears to have been tied when the figures stood as the Huacho copy has them. Either one of the two find-spots is wrong, or the account was kept in two places.",
			level: "open",
		},
	];
}
