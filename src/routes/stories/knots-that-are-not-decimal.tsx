import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CordReader from "#/components/story/CordReader";
import {
	HeightStrip,
	KNOT_MARKS,
	KnotMap,
} from "#/components/story/Kh0100Stages";
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
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getKhipus } from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { Cord, Khipu } from "#/lib/khipu/types";
import {
	ASCHER_BIG_KNOTS,
	ASCHER_ORDERS,
	altCounts,
	attachmentRuns,
	attributeVersusLegal,
	BIG,
	bigLongKnots,
	bothOrders,
	CLOSE_CM,
	CORPUS,
	CORPUS_FAMILY,
	CORPUS_REPUNIT_CLOSEST,
	closePairs,
	clusterSizes,
	colourCounts,
	cordNamed,
	distinctOrders,
	eightAboveOther,
	grammarTest,
	HIGH_TURNS,
	halfProfile,
	halvesOf,
	halvesView,
	hasNetherKnot,
	hasTwoLong,
	heights,
	highTurnByTwist,
	isKnotted,
	isPlainWhite,
	KFG_REENCODED_2023,
	KFG_REENCODED_2025,
	KHIPU_ID,
	kfgRuleCheck,
	kfgTerms,
	knotEntries,
	knotsText,
	knottedCords,
	knotUnits,
	type Legality,
	largestCluster,
	largestValues,
	legality,
	legalTopDown,
	longAboveSingle,
	longestRuns,
	MUNICH_GAFFRON,
	names,
	pendantLengths,
	pendants,
	plainVersusColouredTwist,
	pText,
	repunitTest,
	SPLIT_AT,
	signatureCounts,
	singlesOnly,
	sortedKnots,
	subsidiaries,
	tally,
	twistByColour,
	twistCounts,
	typeSignature,
	valuedButIllegal,
	word,
	wordCounts,
} from "#/lib/stories/kh0100";
import "#/styles/stories/knots-that-are-not-decimal.css";

export const Route = createFileRoute("/stories/knots-that-are-not-decimal")({
	loader: async () => {
		const [khipus, colors] = await Promise.all([
			getKhipus([KHIPU_ID]),
			getColors(),
		]);
		return { khipu: khipus[KHIPU_ID], colors };
	},
	head: () => ({ meta: [{ title: "Knots that are not decimal — Khipu" }] }),
	component: KnotsThatAreNotDecimal,
});

type HalfLayer = "attachment" | "twist" | "colour" | "grammar";

const OVERVIEW = { slot: 6, gap: 12, subOffset: 3, pxPerCm: 1.8, cordW: 1.6 };

const LEGAL_PAINT: Record<Legality, string | null> = {
	both: "var(--band-a)",
	"top-down only": "var(--band-a)",
	"bottom-up only": "var(--accent)",
	neither: "var(--moiety-r)",
};

const LEGAL_LABEL: Record<Legality, string> = {
	both: "legal either way up",
	"top-down only": "legal only from the top",
	"bottom-up only": "legal only upside down",
	neither: "legal neither way",
};

function pct(x: number) {
	return `${Math.round(x * 100)}%`;
}

function ord(n: number) {
	const r = n % 100;
	if (r >= 11 && r <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function per100(n: number, of: number) {
	return ((100 * n) / of).toFixed(1);
}

/** "3 (p3, p9, p22)" — a count with the names behind it. */
function listed(ns: string[]) {
	return ns.join(", ");
}

/** Can a knot-type order such as "L S" be a decimal cord at all? Two units knots, or a units knot above a single-knot cluster, cannot. */
function orderIsDecimal(order: string) {
	const t = order.split(" ");
	const units = t.filter((x) => x !== "S").length;
	return units <= 1 && !(units === 1 && t[t.length - 1] === "S");
}

function joinAnd(xs: string[]) {
	return xs.length <= 1
		? xs.join("")
		: `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function KnotsThatAreNotDecimal() {
	const { khipu, colors } = Route.useLoaderData();
	const [half, setHalf] = useState<HalfLayer>("attachment");

	const all = khipu.cords;
	const knotted = useMemo(() => knottedCords(khipu), [khipu]);
	const pend = useMemo(() => pendants(khipu), [khipu]);
	const subs = useMemo(() => subsidiaries(khipu), [khipu]);
	const bare = useMemo(() => all.filter((c) => c.knots.length === 0), [all]);
	const lengths = useMemo(() => pendantLengths(khipu), [khipu]);
	const colours = useMemo(() => colourCounts(khipu), [khipu]);
	const twist = useMemo(() => twistCounts(pend), [pend]);
	const sigs = useMemo(() => signatureCounts(all), [all]);
	const ordersPend = useMemo(() => distinctOrders(pend), [pend]);
	const ordersAll = useMemo(() => distinctOrders(all), [all]);
	const extraOrders = useMemo(() => {
		const onPendants = new Set(pend.filter(isKnotted).map(typeSignature));
		return subs.filter(
			(c) => isKnotted(c) && !onPendants.has(typeSignature(c)),
		);
	}, [subs, pend]);
	const runsLegal = useMemo(
		() => longestRuns(pend.filter(isKnotted), legalTopDown),
		[pend],
	);
	const sSizes = useMemo(() => clusterSizes(all, "S"), [all]);
	const lSizes = useMemo(() => clusterSizes(all, "L"), [all]);
	const big = useMemo(() => bigLongKnots(all), [all]);
	const bigCords = new Set(big.map((b) => b.cord.name)).size;
	const bigByTurns = useMemo(
		() => clusterSizes(all, "L").filter((r) => r.size >= BIG),
		[all],
	);
	const above = useMemo(() => names(all, longAboveSingle), [all]);
	const twoLong = useMemo(() => names(all, hasTwoLong), [all]);
	const eAbove = useMemo(() => names(all, eightAboveOther), [all]);
	const singles = useMemo(() => all.filter(singlesOnly), [all]);
	const grammar = useMemo(() => grammarTest(all), [all]);
	const illegalValued = useMemo(() => valuedButIllegal(all), [all]);
	const rule = useMemo(() => kfgRuleCheck(all), [all]);
	const top5 = useMemo(() => largestValues(all, 5), [all]);
	const close = useMemo(() => closePairs(all), [all]);
	const rep = useMemo(() => repunitTest(all), [all]);
	const repValues = useMemo(
		() => tally(rep.repunit.map((c) => c.value ?? 0)),
		[rep],
	);
	const alt = useMemo(() => altCounts(all), [all]);
	const words = useMemo(() => wordCounts(all), [all]);
	const pairs = useMemo(() => bothOrders(all), [all]);
	const hts = useMemo(() => heights(all), [all]);
	const runs = useMemo(() => attachmentRuns(khipu), [khipu]);
	const [firstHalf, secondHalf] = useMemo(() => halvesOf(khipu), [khipu]);
	const profiles = useMemo(
		() => [
			halfProfile(
				`p${firstHalf[0]?.ordinal}–p${firstHalf.at(-1)?.ordinal}`,
				firstHalf,
			),
			halfProfile(
				`p${secondHalf[0]?.ordinal}–p${secondHalf.at(-1)?.ordinal}`,
				secondHalf,
			),
		],
		[firstHalf, secondHalf],
	);
	const halves = useMemo(() => halvesView(khipu), [khipu]);
	const byColour = useMemo(() => twistByColour(khipu), [khipu]);
	const twistTest = useMemo(() => plainVersusColouredTwist(khipu), [khipu]);
	const attachTest = useMemo(
		() => attributeVersusLegal(khipu, (c) => c.attach === "R"),
		[khipu],
	);
	const twistLegal = useMemo(
		() => attributeVersusLegal(khipu, (c) => c.twist === "S"),
		[khipu],
	);
	const highTurn = useMemo(() => highTurnByTwist(khipu), [khipu]);
	const nether = useMemo(() => all.filter(hasNetherKnot).length, [all]);
	const total = all.reduce((a, c) => a + (c.value ?? 0), 0);

	const p2 = cordNamed(khipu, "p2");
	const p85 = cordNamed(khipu, "p85");
	const p84 = cordNamed(khipu, "p84");
	const p39 = cordNamed(khipu, "p39");
	const bigNames = new Set(big.map((b) => b.cord.name));
	const aboveSet = new Set(above);
	const reencoded = new Set([...KFG_REENCODED_2023, ...KFG_REENCODED_2025]);
	const topOrders = sigs.slice(0, 7);
	const impossibleTop = topOrders.filter((o) => !orderIsDecimal(o.key));
	const repeatedThree = words.find(
		(w) => w.key.split(" ").length >= 3 && w.n > 1,
	);
	const versoFirst = runs.find((r) => r.attach === "V" && r.n > 1);
	const familyRank = CORPUS_FAMILY.findIndex((r) => r.id === khipu.id) + 1;
	const sPlace = hts.byPlace;

	const legalityPaint = (c: Cord): string | null =>
		c.knots.length ? LEGAL_PAINT[legality(c)] : null;

	const halfPaint = (c: Cord): string | null => {
		if (c.level > 1) return null;
		if (half === "attachment")
			return c.attach === "V" ? "var(--accent)" : "var(--moiety-r)";
		if (half === "twist")
			return c.twist === "Z" ? "var(--accent)" : "var(--band-a)";
		if (half === "colour")
			return isPlainWhite(c) ? "var(--band-a)" : "var(--moiety-r)";
		return legalityPaint(c);
	};
	const halfBand = (g: GroupBox): string | null =>
		g.index === 0
			? "color-mix(in oklab, var(--band-b) 45%, transparent)"
			: null;
	const halfLabel = (g: GroupBox): string =>
		`${profiles[g.index]?.label} · ${g.index === 0 ? "recto" : "verso"}`;

	return (
		<StoryPage
			kicker="KH0100 · Munich"
			title="Knots that are not decimal"
			standfirst={
				<>
					In 1978 Marcia and Robert Ascher declined to give values to a white
					khipu in Munich, because its knot clusters do not follow the base-ten
					positional system. The database that now holds it carries a value on
					every cord, the largest {p85.value?.toLocaleString()}. Tested cord by
					cord, about half the cords are well-formed decimal and half are not;
					those that are not share recurring features: long knots of up to{" "}
					{lSizes.at(-1)?.size} turns, long knots tied above single knots, and
					cords of lone knots that the workbook reads as{" "}
					{repValues.map((v) => v.key).join(", ")}.
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
						{khipu.museum.name} (now Museum Fünf Kontinente), Munich, inventory{" "}
						{khipu.museum.number}
					</span>
					<span>
						Described by the Aschers as AS087, 1978; recorded for the Open Khipu
						Repository by C. Brezine, {khipu.created}
					</span>
				</>
			}
		>
			<div className="kh0100-story">
				<Step n={1} title="A khipu the Aschers would not read">
					<Prose>
						<p>
							The museum's record says the khipu was bought from Carl Eduard
							Gaffron in 1907, gives its provenance as "Peru" and nothing more,
							dates it 1000–1500 on curatorial grounds, and lists the material
							as camelid hair, cotton queried; the Field Guide workbook records
							the primary cord as cotton. There is no find-spot and no
							radiocarbon date.
						</p>
						<p>
							The record: a white primary cord, {khipu.primary.twist}
							-plied, {khipu.primary.length} cm long and knotted at the end,
							carrying {pend.length} pendants of {lengths.min} to {lengths.max}{" "}
							cm (median {lengths.median}) and {subs.length} subsidiaries. Of
							the {all.length} cords {knotted.length} are knotted;{" "}
							{listed(bare.map((c) => c.name))} is bare. There are{" "}
							{khipu.stats.nKnots} knots: {knotUnits(all, "S")} single knots in{" "}
							{knotEntries(all, "S")} clusters, {knotEntries(all, "L")} long
							knots and {knotEntries(all, "E")} figure-eights. Every cord is
							white or white mottled with a second colour:{" "}
							{colours.map((c) => `${c.key} ${c.n}`).join(", ")}. Pendant twist
							is {twist.s} S against {twist.z} Z.{" "}
							<Conf level="firm">Recorded structure</Conf>
						</p>
						<p>
							The Aschers catalogued it as AS087 in their 1978 Databook and
							wrote, in the note the Field Guide reproduces:
						</p>
						<p className="kh0100-quote">
							No numerical interpretation is possible as the knot clusters do
							not conform to the base ten positional system. Nineteen different
							knot cluster orders are found on the pendants.
						</p>
						<p>
							The values that the Field Guide now carries did not come from
							them. The Open Khipu Repository's record was created by Carrie
							Brezine in December 2005 for Gary Urton's project, and it carries
							a value on every cord; the Field Guide inherited it, and its
							workbook change log shows the editor considering the Aschers' note
							in November 2023 and leaving the values in place. So the khipu has
							two readings on file: one that says it cannot be read, and one
							that sums to {total.toLocaleString()}. This page tests both
							against the recorded knots, cord by cord.
						</p>
					</Prose>
					<Wide
						caption={
							<>
								{khipu.id} as recorded, drawn as plied cord. The pendants are
								set out in order, not at measured positions: no position along
								the primary cord was recorded for any of them (the repository
								holds 0 for each), and the workbook's two "groups", p1 alone and
								p2–p89, carry no information, so neither is drawn.
							</>
						}
					>
						<KhipuDiagram
							khipu={khipu}
							colors={colors}
							layout={OVERVIEW}
							style="physical"
							showGroups={false}
							fit
						/>
					</Wide>
				</Step>

				<Step n={2} title="Every cord, top to bottom">
					<Prose>
						<p>
							The usual khipu convention is that single knots in clusters of one
							to nine carry the higher places, the units digit is one long knot
							of two to nine turns or one figure-eight for 1, and the units sit
							lowest on the cord. The figure below lays out every knotted cord
							as a column with its knots at their recorded heights, so the order
							of knot types down each cord can be compared.
						</p>
						<p>
							Counting the distinct top-to-bottom sequences of knot types on the{" "}
							{pend.filter((c) => c.knots.length).length} knotted pendants gives{" "}
							{ordersPend}, which is the Aschers' figure of {ASCHER_ORDERS}{" "}
							exactly; over all {knotted.length} knotted cords it is {ordersAll}
							, the extra one being {extraOrders.map((c) => c.name).join(", ")},
							a subsidiary carrying a lone figure-eight. The commonest orders
							are {topOrders.map((s) => `${s.key} (${s.n})`).join(", ")}.{" "}
							{impossibleTop.length} of the {topOrders.length} (
							{joinAnd(impossibleTop.map((o) => `"${o.key}"`))}) are impossible
							in a decimal cord, which allows one long knot or figure-eight and
							only at the bottom. <Conf level="firm">Recount</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Every knotted cord of {khipu.id}, attachment at the top, knots
								at their recorded height in cm. Dots are single-knot clusters
								sized by count, bars are long knots with length by turns, rings
								are figure-eights. Columns tinted orange have a long knot above
								a single-knot cluster; the blue mark under a column flags a long
								knot of {BIG} or more turns. Dashed columns are subsidiaries.
								Hover a column for its knots and workbook value.
							</>
						}
					>
						<KnotMap
							cords={knotted}
							band={(c) => (aboveSet.has(c.name) ? "var(--moiety-r)" : null)}
							mark={(c) => (bigNames.has(c.name) ? "var(--accent)" : null)}
							title={`Knot map of every knotted cord of ${khipu.id}`}
						/>
						<Legend
							items={[
								...KNOT_MARKS,
								{
									color: "var(--moiety-r)",
									label: "long knot above a single-knot cluster",
								},
								{
									color: "var(--accent)",
									label: `long knot of ${BIG}+ turns on the cord`,
								},
							]}
						/>
					</Wide>
					<Prose>
						<p>
							{above.length} cords carry a long knot higher on the cord than a
							single-knot cluster ({listed(above)}):{" "}
							{per100(above.length, knotted.length)} in every hundred knotted
							cords, against {CORPUS.longAboveSinglePer100} per hundred across
							all {CORPUS.khipus} khipus with published cords. {twoLong.length}{" "}
							cords carry two or three long knots. And {eAbove.length} cords (
							{listed(eAbove)}) have a figure-eight with another knot below it.
						</p>
						<p>
							Then the knots past nine. The Aschers wrote that{" "}
							{ASCHER_BIG_KNOTS} knots "contain 10, 11, 12, or 13 knots". They
							meant long knots: the largest cluster of single knots anywhere on
							the khipu is {largestCluster(all, "S")} (
							{sSizes.map((r) => `${r.n} of ${r.size}`).join(", ")}), but the
							long knots run to {lSizes.at(-1)?.size} turns. In the data as it
							stands {big.length} long knots on {bigCords} cords have {BIG}{" "}
							turns or more:{" "}
							{bigByTurns.map((r) => `${r.n} of ${r.size} turns`).join(", ")}.
							No decimal cord can hold one. <Conf level="firm">Counted</Conf>
						</p>
						<p>
							A caution on those turn counts. The workbook's change log shows
							that {KFG_REENCODED_2023.length} of these knots (
							{listed(KFG_REENCODED_2023)}) were originally encoded as long
							knots of one, two or three turns carrying values of 11 to 13, and
							were re-encoded in November 2023 to match the value;{" "}
							{listed(KFG_REENCODED_2025)}'s was changed the same way in June
							2025. The repository's own knot table holds the high turn counts
							too, so they were in the record before the workbook was edited and
							were not invented in 2023; but the Aschers counted{" "}
							{ASCHER_BIG_KNOTS} such knots and the data hold {big.length}, and
							which is right cannot be settled without the object.{" "}
							<Conf level="likely">Turn counts of 10–13</Conf>
						</p>
					</Prose>
					<Wide
						caption={`The ${big.length} long knots of ${BIG} or more turns. "Re-encoded" marks the cords whose knot string was rewritten in the workbook to agree with the recorded value.`}
					>
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Cord</th>
										<th className="num">Turns</th>
										<th className="num">Height</th>
										<th>All knots on the cord</th>
										<th>Twist</th>
										<th className="num">Workbook value</th>
										<th>Re-encoded</th>
									</tr>
								</thead>
								<tbody>
									{big.map((b) => (
										<tr key={`${b.cord.name}-${b.knot.pos}`}>
											<td>
												<Chip cord={b.cord} colors={colors} /> {b.cord.name}
											</td>
											<td className="num">{b.knot.n}</td>
											<td className="num">{b.knot.pos} cm</td>
											<td>{knotsText(b.cord)}</td>
											<td>{b.cord.twist}</td>
											<td className="num">{b.cord.value}</td>
											<td className={reencoded.has(b.cord.name) ? "" : "muted"}>
												{reencoded.has(b.cord.name)
													? KFG_REENCODED_2025.includes(b.cord.name)
														? "2025"
														: "2023"
													: "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
				</Step>

				<Step n={3} title="The grammar test">
					<Prose>
						<p>
							Write the convention as a rule and apply it to each cord. Reading
							from the attachment down: every single-knot cluster has one to
							nine knots, every long knot two to nine turns, there is at most
							one units knot (a long knot or a figure-eight), and if there is
							one it is the last knot on the cord. Apply the same rule to the
							reversed sequence to see whether a cord would be legal if it were
							hung upside down.
						</p>
						<p>
							Of {grammar.knotted} knotted cords, {grammar.both} are legal
							either way up, {grammar.topDownOnly} only from the top,{" "}
							{grammar.bottomUpOnly} only upside down, and {grammar.neither}{" "}
							neither way. So {grammar.topDown} cords,{" "}
							{pct(grammar.topDown / grammar.knotted)}, are well-formed decimal
							cords as they hang, and {grammar.knotted - grammar.topDown} are
							not. Read from the top, the first thing that goes wrong is{" "}
							{grammar.violations
								.map((v) => `${v.key} on ${v.n} cords`)
								.join(", ")}
							. <Conf level="firm">Grammar test</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Each pendant painted by the outcome of the test. Grey cords are
								legal decimal cords as they hang; blue cords would be legal only
								if the khipu were hung upside down; orange cords are legal
								neither way. The bare cord keeps its recorded colour.
							</>
						}
					>
						<KhipuDiagram
							khipu={khipu}
							colors={colors}
							layout={OVERVIEW}
							style="physical"
							paint={legalityPaint}
							showGroups={false}
							tooltip
							fit
						/>
						<Legend
							items={[
								{ color: LEGAL_PAINT.both ?? "", label: LEGAL_LABEL.both },
								{
									color: LEGAL_PAINT["bottom-up only"] ?? "",
									label: LEGAL_LABEL["bottom-up only"],
								},
								{
									color: LEGAL_PAINT.neither ?? "",
									label: LEGAL_LABEL.neither,
								},
							]}
						/>
					</Wide>
					<Prose>
						<p>
							All {singles.length} cords that carry nothing but single-knot
							clusters pass the test, and so does {p2.name}, which reads{" "}
							{p2.value?.toLocaleString()} in orthodox form: {knotsText(p2)}.
							The {grammar.bottomUpOnly} cords legal only upside down are the
							ones with a units knot, a long knot or a figure-eight, above a
							single-knot cluster and nothing else wrong, for example{" "}
							{names(all, (c) => legality(c) === "bottom-up only")
								.slice(0, 4)
								.join(", ")}
							. Nothing else about them suggests they were read from the bottom.
							The {grammar.neither} cords legal neither way are where the two or
							three long knots and the long knots of {BIG}+ turns live.
						</p>
						<p>
							The workbook gives a value to every knotted cord regardless:{" "}
							{illegalValued} of its values sit on cords that fail the test as
							they hang. The Aschers' statement holds for the cords that fail
							and is too broad for those that pass. The two kinds are
							interleaved: along the pendants no run of legal cords is longer
							than {runsLegal.pass} and no run of illegal ones longer than{" "}
							{runsLegal.fail}. Decimal and non-decimal cords are mixed along
							the whole length. <Conf level="firm">Half decimal, half not</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={4} title={`Where ${p85.value?.toLocaleString()} comes from`}>
					<Prose>
						<p>
							One rule reproduces the workbook values almost entirely: rank a
							cord's single-knot clusters from the lowest upward and give them
							10, 100, 1,000 and so on in that order, whatever their heights;
							and let every long knot and figure-eight add its turn or knot
							count wherever it sits. Applied to all {rule.cords} cords the rule
							returns the recorded value on {rule.matches}. The one exception is{" "}
							{rule.mismatches.map((m) => m.cord.name).join(", ")}, where{" "}
							{knotsText(p39)} was entered as {p39.value} rather than the rule's{" "}
							{rule.mismatches[0]?.rule}: its two single knots,{" "}
							{close.find((c) => c.cord.name === p39.name)?.gap} cm apart, were
							both read as tens. <Conf level="firm">Rule recovered</Conf>
						</p>
						<p>
							The rule looks like a mechanical way of filling in a form that
							requires a place value for every cluster, not a reading of the
							cord. Its largest product is {p85.name}.
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Two cords read out with the workbook's per-knot values.{" "}
								{p2.name} is an orthodox decimal cord: thousands, hundreds,
								tens, descending down the cord. {p85.name} is not: its "units"
								are a four-turn long knot near the top and a figure-eight near
								the bottom, and single knots read as ten-thousands and thousands
								sit either side of the long knot. The reader labels the places
								the workbook assigned; it does not vouch for them.
							</>
						}
					>
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>
										{p2.name}: {p2.value?.toLocaleString()}, decimal
									</h3>
								</figcaption>
								<CordReader
									cord={p2}
									colors={colors}
									pxPerCm={5}
									title={`Pendant 2, ${p2.value}`}
								/>
							</div>
							<div className="figure">
								<figcaption>
									<h3>
										{p85.name}: {p85.value?.toLocaleString()}, by the rule
									</h3>
								</figcaption>
								<CordReader
									cord={p85}
									colors={colors}
									pxPerCm={5}
									title={`Pendant 85, ${p85.value}`}
								/>
							</div>
						</div>
					</Wide>
					<Wide
						caption={`The ${top5.length} largest workbook values, taken apart by the rule. ${top5.filter(legalTopDown).length} of the ${top5.length} pass the grammar test, and of those only ${p2.name} has clusters of more than one knot; ${p84.name} is four lone single knots.`}
					>
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Cord</th>
										<th>Knots, top to bottom</th>
										<th>Rule</th>
										<th className="num">Value</th>
										<th>Decimal?</th>
									</tr>
								</thead>
								<tbody>
									{top5.map((c) => (
										<tr key={c.name}>
											<td>
												<Chip cord={c} colors={colors} /> {c.name}
											</td>
											<td>{knotsText(c)}</td>
											<td>
												{kfgTerms(c)
													.map((t) => t.term.toLocaleString())
													.join(" + ")}
											</td>
											<td className="num">{c.value?.toLocaleString()}</td>
											<td className={legalTopDown(c) ? "ok" : "no"}>
												{legalTopDown(c) ? "yes" : LEGAL_LABEL[legality(c)]}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							Even the clusters are not certain. On {close.length} cords two
							adjacent single knots sit less than {CLOSE_CM} cm apart, close
							enough to be one cluster of two:{" "}
							{close
								.map(
									(p) =>
										`${p.cord.name} (${p.a.pos} and ${p.b.pos} cm, read as ${p.placeA.toLocaleString()} and ${p.placeB.toLocaleString()})`,
								)
								.join("; ")}
							. In {close.filter((p) => p.placeA !== p.placeB).length} of the{" "}
							{close.length} they were given different place values, in{" "}
							{close.filter((p) => p.placeA === p.placeB).length} the same, and
							two of them are inside {p85.name} and {p84.name}. Across the
							corpus's {CORPUS.nonZeroValues.toLocaleString()} non-zero cord
							values, {p85.value?.toLocaleString()} ranks {CORPUS.rankOf11115}
							th; only {CORPUS.valuesTenThousandPlus} cords in the corpus reach
							ten thousand. Here nothing checks it.{" "}
							<Conf level="firm">Segmentation open</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={5} title="Other readings">
					<Prose>
						<p>
							Take the cords the rule read as{" "}
							{repValues.map((v) => v.key).join(", ")}. Each is a series of
							single knots, one knot per cluster, spaced down the cord.{" "}
							{rep.repunit.length} of the {rep.multi.length} cords with two or
							more single-knot clusters are built this way, {pct(rep.share)}:{" "}
							{rep.repunit.map((c) => `${c.name} (${c.value})`).join(", ")}.
							Across the corpus the same construction accounts for{" "}
							{CORPUS.repunitCords} of{" "}
							{CORPUS.multiSingleCords.toLocaleString()} such cords,{" "}
							{pct(CORPUS.repunitCords / CORPUS.multiSingleCords)}, and the
							chance of drawing {rep.repunit.length} or more in{" "}
							{rep.multi.length} from the rest of the corpus is about one in{" "}
							{(1 / CORPUS.repunitTailP / 1e9).toFixed(0)} thousand million.
							Only{" "}
							{joinAnd(
								CORPUS_REPUNIT_CLOSEST.filter((r) => r.id !== khipu.id)
									.slice(0, 3)
									.map((r) => `${r.id} (${r.repunit} of ${r.multi})`),
							)}{" "}
							come close. As account entries the resulting values (
							{repValues
								.map(
									(v) =>
										`${v.key.toLocaleString()} ${v.n === 1 ? "once" : `${v.n} times`}`,
								)
								.join(", ")}
							) would be unusual; the clusters may be marks counted one at a
							time rather than digits.{" "}
							<Conf level="firm">Repunit cords over-represented</Conf>{" "}
							<Conf level="open">What the marks count</Conf>
						</p>
					</Prose>
					<Wide
						caption={`The ${rep.repunit.length} cords whose every cluster is one single knot, with the heights of the knots and the value the workbook gave them.`}
					>
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Cord</th>
										<th>Colour</th>
										<th className="num">Knots</th>
										<th>Heights</th>
										<th className="num">Workbook value</th>
									</tr>
								</thead>
								<tbody>
									{rep.repunit.map((c) => (
										<tr key={c.name}>
											<td>
												<Chip cord={c} colors={colors} /> {c.name}
											</td>
											<td>{c.color}</td>
											<td className="num">{c.knots.length}</td>
											<td>
												{sortedKnots(c)
													.map((k) => `${k.pos}`)
													.join(", ")}{" "}
												cm
											</td>
											<td className="num">{c.value?.toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							Otherwise the cords rarely repeat. Written as words, with each
							knot's count and type in order, the {knotted.length} knotted cords
							use {alt.distinctWords} distinct words, {alt.wordsOnce} of them
							once. The commonest are{" "}
							{words
								.slice(0, 6)
								.map((w) => `${w.key} (${w.n})`)
								.join(", ")}
							.{" "}
							{repeatedThree
								? `The only word of three knots that recurs is ${repeatedThree.key}, on ${names(all, (c) => word(c) === repeatedThree.key).join(" and ")}.`
								: ""}{" "}
							{pairs.length} words occur in both orders, for example{" "}
							{pairs[0]?.a} {pairs[0]?.na} times and {pairs[0]?.b}{" "}
							{pairs[0]?.nb} times, which a positional system would forbid.
							Counting each cord other ways, the total turns run {alt.turns.min}{" "}
							to {alt.turns.max} (median {alt.turns.median}), the total knots{" "}
							{alt.knots.min} to {alt.knots.max}, and the clusters per cord{" "}
							{alt.clustersPerCord.map((c) => `${c.n} of ${c.key}`).join(", ")}.
							Apart from most cords carrying two clusters, none of these
							distributions shows a peak or period that would suggest a second
							reading. <Conf level="open">No alternative count</Conf>
						</p>
						<p>
							Nor do the knot heights define registers. Where a khipu is read
							positionally, the tens sit at one height and the hundreds above
							them at another; here the single knots the workbook read as tens
							run from {sPlace[0]?.stats.min} to {sPlace[0]?.stats.max} cm from
							the attachment (median {sPlace[0]?.stats.median}), the hundreds
							from {sPlace[1]?.stats.min} to {sPlace[1]?.stats.max} (median{" "}
							{sPlace[1]?.stats.median}), the thousands from{" "}
							{sPlace[2]?.stats.min} to {sPlace[2]?.stats.max}, and the long
							knots anywhere from {hts.long.min} to {hts.long.max} cm. The
							topmost knot on a cord sits at a median {hts.top.median} cm, the
							lowest at {hts.lowest.median}; the lowest knot lies at a median{" "}
							{hts.lowestFraction.median.toFixed(2)} of the cord's length, and
							the correlation between cord length and the height of the first
							knot is {hts.rLengthTop.toFixed(2)}. The bands overlap almost
							completely. <Conf level="firm">No fixed registers</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Knot heights, one dot per knot, grouped by the place value the
								workbook gave the cluster. The bar is the median of each row. If
								the khipu were read in fixed registers, the rows would separate.
							</>
						}
					>
						<HeightStrip
							title="Knot heights by the place value the workbook assigned"
							rows={[
								...sPlace.map((b) => ({
									label: `single knots as ×${b.place.toLocaleString()} (${b.stats.n})`,
									heights: b.heights,
								})),
								{
									label: `long knots (${hts.long.n})`,
									heights: all.flatMap((c) =>
										c.knots.filter((k) => k.type === "L").map((k) => k.pos),
									),
									color: "var(--accent)",
								},
								{
									label: `figure-eights (${hts.eight.n})`,
									heights: all.flatMap((c) =>
										c.knots.filter((k) => k.type === "E").map((k) => k.pos),
									),
									color: "var(--moiety-r)",
								},
							]}
						/>
					</Wide>
				</Step>

				<Step n={6} title="Two halves">
					<Prose>
						<p>
							The khipu does show structure in its construction. The pendants
							are attached recto from p{runs[0]?.from} to p{runs[0]?.to}, with{" "}
							{runs
								.filter((r) => r.attach === "V" && r.from < SPLIT_AT)
								.map((r) => `p${r.from}`)
								.join(" and ")}{" "}
							the only verso cords before the switch, and verso from p
							{versoFirst?.from} to the end, with{" "}
							{runs
								.filter((r) => r.attach === "R" && r.from >= SPLIT_AT)
								.map((r) => `p${r.from}`)
								.join(" and ")}{" "}
							the only recto cords after it. Splitting at p{SPLIT_AT} gives two
							halves of {profiles[0].n} and {profiles[1].n} pendants.
						</p>
						<p>
							The halves differ in yarn. The second half has{" "}
							{profiles[1].zTwist} Z-plied pendants of {profiles[1].n} against{" "}
							{profiles[0].zTwist} of {profiles[0].n} in the first, and{" "}
							{profiles[1].plainWhite} plain white cords against{" "}
							{profiles[0].plainWhite}. The two are linked: twist follows
							colour. Of the plain white pendants {twistTest.a} of{" "}
							{twistTest.a + twistTest.b} are Z-plied; of the mottled and
							coloured pendants {twistTest.c} of {twistTest.c + twistTest.d} is
							(
							{byColour
								.map((r) => `${r.colour} ${r.s} S / ${r.z} Z`)
								.join(", ")}
							). Fisher's exact test gives p {pText(twistTest.p)}.{" "}
							<Conf level="firm">Twist follows colour</Conf>
						</p>
						<p>
							They do not differ in grammar. {profiles[0].legal} of{" "}
							{profiles[0].knotted} knotted cords in the first half pass the
							decimal test and {profiles[1].legal} of {profiles[1].knotted} in
							the second; attachment side against legality gives p{" "}
							{pText(attachTest.p)}, twist against legality p{" "}
							{pText(twistLegal.p)}. What does change is the long knots: the
							second half carries {profiles[1].highTurnKnots} long knots of{" "}
							{HIGH_TURNS} or more turns to the first half's{" "}
							{profiles[0].highTurnKnots}, and on the khipu as a whole{" "}
							{highTurn.z} such knots sit on Z-plied cords against {highTurn.s}{" "}
							on S-plied. That is observed, not tested, and the numbers are
							small.{" "}
							<Conf level="likely">Halves differ in yarn, not grammar</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								The two attachment halves as bands, with the pendants painted by
								attachment (recto orange, verso blue), by twist (Z blue, S
								grey), by colour (plain white grey, mottled or coloured orange),
								or by the grammar test as in step 3. Subsidiaries keep their
								recorded colour.
							</>
						}
					>
						<LayerTabs
							value={half}
							onChange={setHalf}
							options={[
								{ value: "attachment", label: "Attachment" },
								{ value: "twist", label: "Twist" },
								{ value: "colour", label: "Colour" },
								{ value: "grammar", label: "Grammar" },
							]}
						/>
						<KhipuDiagram
							khipu={halves}
							colors={colors}
							layout={OVERVIEW}
							style="physical"
							paint={halfPaint}
							groupBand={halfBand}
							groupLabel={halfLabel}
							showGroups
							tooltip={false}
							fit
						/>
						<Legend
							items={
								half === "attachment"
									? [
											{ color: "var(--moiety-r)", label: "attached recto" },
											{ color: "var(--accent)", label: "attached verso" },
										]
									: half === "twist"
										? [
												{ color: "var(--accent)", label: "Z-plied" },
												{ color: "var(--band-a)", label: "S-plied" },
											]
										: half === "colour"
											? [
													{ color: "var(--band-a)", label: "plain white" },
													{
														color: "var(--moiety-r)",
														label: "white mottled with a colour, or coloured",
													},
												]
											: [
													{
														color: LEGAL_PAINT.both ?? "",
														label: LEGAL_LABEL.both,
													},
													{
														color: LEGAL_PAINT["bottom-up only"] ?? "",
														label: LEGAL_LABEL["bottom-up only"],
													},
													{
														color: LEGAL_PAINT.neither ?? "",
														label: LEGAL_LABEL.neither,
													},
												]
							}
						/>
					</Wide>
					<Wide caption="The two halves compared. Legal means a knotted cord that passes the decimal test as it hangs.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Pendants</th>
										<th className="num">Verso</th>
										<th className="num">Z-plied</th>
										<th className="num">Plain white</th>
										<th className="num">Legal</th>
										<th className="num">Single knots only</th>
										<th className="num">With a long knot</th>
										<th className="num">Long knots of {HIGH_TURNS}+ turns</th>
									</tr>
								</thead>
								<tbody>
									{profiles.map((p) => (
										<tr key={p.label}>
											<td>
												{p.label} · {p.n}
											</td>
											<td className="num">{p.verso}</td>
											<td className="num">{p.zTwist}</td>
											<td className="num">{p.plainWhite}</td>
											<td className="num">
												{p.legal} / {p.knotted}
											</td>
											<td className="num">{p.singlesOnly}</td>
											<td className="num">{p.withLong}</td>
											<td className="num">{p.highTurnKnots}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
				</Step>

				<Step n={7} title="In the corpus, and what stays unread">
					<Prose>
						<p>
							{khipu.id} is at the far end of the range but not unique. Across
							the {CORPUS.khipus} khipus with published cords,{" "}
							{CORPUS.longAboveSingleCords} cords in{" "}
							{CORPUS.longAboveSingleKhipus} khipus have a long knot above a
							single-knot cluster, and by that count {khipu.id} ranks{" "}
							{ord(familyRank)}. Long knots of {BIG} or more turns number{" "}
							{CORPUS.bigLongKnots} in {CORPUS.bigLongKnotKhipus} khipus, and{" "}
							{khipu.id} holds {pct(big.length / CORPUS.bigLongKnots)} of them,
							at {per100(big.length, knotted.length)} per hundred knotted cords
							against {CORPUS.bigLongPer100} corpus-wide. By the share of its
							knotted cords that fail the decimal test it ranks{" "}
							{ord(CORPUS.illegalShareRank)} of the {CORPUS.illegalShareRanked}{" "}
							khipus with twenty or more knotted cords, where the median share
							is {CORPUS.illegalShareMedian}. Clusters of ten or more single
							knots, which would be another way of breaking the system, do
							exist, {CORPUS.sClustersTenPlus} of them in{" "}
							{CORPUS.sClustersTenPlusKhipus} khipus; none is here.
						</p>
						<p>
							The closest match in this scan is in the same museum.{" "}
							{MUNICH_GAFFRON.find((r) => r.id === "KH0108")?.id}, which the
							Aschers' note also records as Gaffron's, from Pachacamac, has{" "}
							{MUNICH_GAFFRON.find((r) => r.id === "KH0108")?.big} long knots of{" "}
							{BIG}+ turns and{" "}
							{MUNICH_GAFFRON.find((r) => r.id === "KH0108")?.longAbove} cords
							with a long knot above a single. The{" "}
							{MUNICH_GAFFRON.filter((r) => r.id !== "KH0108").length} other
							Munich khipus the Aschers grouped with this one as Gaffron's have
							none of either;{" "}
							{
								MUNICH_GAFFRON.filter(
									(r) => r.id !== "KH0108" && r.illegal <= 1,
								).length
							}{" "}
							of them pass the decimal test on all or all but one of their
							cords, and{" "}
							{MUNICH_GAFFRON.filter((r) => r.id !== "KH0108" && r.illegal > 1)
								.map((r) => `${r.id} fails it on ${r.illegal} of ${r.knotted}`)
								.join(", ")}{" "}
							by a different route, runs of two or more long or figure-eight
							knots. Whether the two share a maker, a place or a convention
							would need study of the objects.{" "}
							<Conf level="open">Whether the pair is a family</Conf>
						</p>
					</Prose>
					<Wide caption="Left: the khipus with most cords carrying a long knot above a single-knot cluster, from a scan of all published workbooks. Right: the other Munich khipus the Aschers' note records as Gaffron's, with the count of knotted cords failing the decimal test.">
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>Long knots above single knots</h3>
								</figcaption>
								<div className="ledger">
									<table className="ledger-table">
										<thead>
											<tr>
												<th>Khipu</th>
												<th>Provenance</th>
												<th className="num">Knotted</th>
												<th className="num">L above S</th>
												<th className="num">L of {BIG}+</th>
											</tr>
										</thead>
										<tbody>
											{CORPUS_FAMILY.map((r) => (
												<tr key={r.id}>
													<td>
														<Link to="/khipus/$id" params={{ id: r.id }}>
															{r.id}
														</Link>
													</td>
													<td>{r.provenance}</td>
													<td className="num">{r.knotted}</td>
													<td className="num">{r.longAbove}</td>
													<td className="num">{r.big}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
							<div className="figure">
								<figcaption>
									<h3>The Munich khipus recorded as Gaffron's</h3>
								</figcaption>
								<div className="ledger">
									<table className="ledger-table">
										<thead>
											<tr>
												<th>Khipu</th>
												<th className="num">Fail decimal</th>
												<th className="num">Knotted</th>
												<th className="num">L above S</th>
												<th className="num">L of {BIG}+</th>
											</tr>
										</thead>
										<tbody>
											{[
												{
													id: khipu.id,
													illegal: grammar.knotted - grammar.topDown,
													knotted: grammar.knotted,
													longAbove: above.length,
													big: big.length,
												},
												...MUNICH_GAFFRON,
											].map((r) => (
												<tr key={r.id}>
													<td>
														<Link to="/khipus/$id" params={{ id: r.id }}>
															{r.id}
														</Link>
													</td>
													<td className="num">{r.illegal}</td>
													<td className="num">{r.knotted}</td>
													<td className="num">{r.longAbove}</td>
													<td className="num">{r.big}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</Wide>
					<Prose>
						<p>
							The non-decimal cords remain unread. The{" "}
							{grammar.knotted - grammar.topDown} cords that fail the decimal
							test have no reading: no other way of counting them produces a
							pattern, {alt.wordsOnce} of the {alt.distinctWords} knot words
							occur once, and the heights define no registers, so nothing says
							what a {lSizes.at(-1)?.size}
							-turn long knot above a single knot means, or what the repunit
							cords count. Sabine Hyland's 2024 paper on knot anomalies names a
							knot tied below the units position a "nether knot", reports one on
							at least one pendant in more than a fifth of the repository's
							khipus, and proposes a reading by ethnographic analogy; on this
							khipu {nether} of {knotted.length} knotted cords carry a knot
							below their first long knot or figure-eight. The Field Guide's
							bibliography for this khipu lists her chapter at p. 172, but the
							chapter itself could not be obtained, so her reading is named here
							and not applied. <Conf level="open">Nether knots</Conf>
						</p>
						<p>
							Two smaller matters are also open. The Aschers noted that several
							two- and three-turn long knots were "constructed in a reverse
							manner"; the 2005 recorder wrote against that note that it is
							incorrect and the long knots are Z or without axis, and the data
							cannot arbitrate. And no position along the primary cord was
							recorded for any pendant, so whether the cords were spaced in
							groups is unknown. Settling these points needs the object itself,{" "}
							{khipu.primary.length} cm of primary cord held in Munich.
						</p>
					</Prose>
					<Wide>
						<Layers
							heading={`${khipu.id}, read in layers`}
							layers={explain(khipu, {
								knotted: knotted.length,
								legal: grammar.topDown,
								above: above.length,
								big: big.length,
								maxTurns: lSizes.at(-1)?.size ?? 0,
								repunit: rep.repunit.length,
								multi: rep.multi.length,
								ruleMatches: rule.matches,
								ruleCords: rule.cords,
								twistP: twistTest.p,
								nether,
							})}
						/>
					</Wide>
				</Step>
			</div>
			<Sources
				items={[
					{
						who: "Khipu Field Guide (Ashok Khosla)",
						what: "KH0100 catalogue page: the Aschers' Databook notes, statistics and bibliography",
						where: "khipufieldguide.com",
						href: "https://www.khipufieldguide.com/catalog/KH0100.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0100 workbook with its ChangeLog sheet (K. Thompson, 2023 and 2025)",
						where: "khipufieldguide.com, Excel databook",
						href: "https://www.khipufieldguide.com/databook/excel_khipus/KH0100.xlsx",
					},
					{
						who: "Khipu Field Guide",
						what: "Fieldmark notebooks (none lists KH0100)",
						where: "khipufieldguide.com",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/",
					},
					{
						who: "Open Khipu Repository",
						what: "Record 1000310 (UR1087): notes, creation record, cord and knot tables",
						where: "khipu.db, record created 5 December 2005",
					},
					{
						who: "Museum Fünf Kontinente, Munich",
						what: "Object record G-3304: Gaffron purchase 1907, dated 1000–1500, 59 × 23.5 × 1 cm, camelid hair / cotton (?)",
						where: "Online collection database",
						href: "https://onlinedatenbank-museum-fuenf-kontinente.de/detail/collection/fc7b61e5-e2d2-451f-9e0f-3780f217abe9",
					},
					{
						who: "Marcia & Robert Ascher",
						what: "Code of the Quipu: Databook, AS087, pp. 618–623 and 669",
						where:
							"University Microfilms, Ann Arbor, 1978 — quoted via the Field Guide page and the repository notes, not read directly",
					},
					{
						who: "Sabine Hyland",
						what: "Knot anomalies on Inka khipus: revising Locke's knot typology",
						where:
							"In Orsini & Villa (eds), Actas de la IX jornada internacional de textiles precolombinos y amerindios, Zea Books, 2024, pp. 162–180 — abstract only",
						href: "https://digitalcommons.unl.edu/pctix/8",
					},
					{
						who: "University of St Andrews research portal",
						what: "Bibliographic record and abstract for Hyland 2024",
						where: "research-portal.st-andrews.ac.uk",
						href: "https://research-portal.st-andrews.ac.uk/en/publications/knot-anomalies-on-inka-khipus-revising-lockes-knot-typology",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("AB", colors), label: "AB light brown" },
					{ color: hexFor("VB", colors), label: "VB vivid dark greenish blue" },
					{ color: hexFor("DB", colors), label: "DB deep brown" },
					{ color: hexFor("BG", colors), label: "BG grayish blue" },
				]}
			/>
		</StoryPage>
	);
}

interface Summary {
	knotted: number;
	legal: number;
	above: number;
	big: number;
	maxTurns: number;
	repunit: number;
	multi: number;
	ruleMatches: number;
	ruleCords: number;
	twistP: number;
	nether: number;
}

function explain(khipu: Khipu, s: Summary): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					{khipu.stats.nPendants} pendants and {khipu.stats.nSubsidiaries}{" "}
					subsidiaries on an {khipu.primary.length} cm white primary cord, no
					positions along it recorded; {khipu.stats.nKnots} knots on {s.knotted}{" "}
					cords, all white or white-mottled. Described in 1978, entered in the
					repository in 2005; long knots of up to {s.maxTurns} turns, {s.above}{" "}
					cords with a long knot above a single-knot cluster.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					{s.legal} of {s.knotted} knotted cords are legal decimal cords; the
					rest are not, and the workbook's values on them follow a
					rank-from-the-bottom rule that reproduces {s.ruleMatches} of{" "}
					{s.ruleCords} values. {s.repunit} of {s.multi} multi-cluster
					single-knot cords are one knot per cluster. Twist follows colour (p{" "}
					{pText(s.twistP)}); knot heights define no registers.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: (
				<>
					Provenance "Peru", bought from Gaffron in 1907, museum date 1000–1500.
					The Aschers gave it no values; the repository record gives every cord
					one. KH0108, another Munich Gaffron khipu from Pachacamac, shares the
					high-turn long knots and the long-above-single cords; the other Munich
					Gaffron khipus have neither construction. Hyland (2024) treats knots
					below the units position across the corpus; {s.nether} cords here
					carry one.
				</>
			),
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "About half the knotted cords are decimal and the rest are not, on one primary cord. The non-decimal cords may record counts or categories in a non-positional convention: lone knots in series, long knots whose turn count runs past nine, long knots placed above single knots. What they record is unknown; nothing here goes further than saying they are not decimal numbers in the usual khipu sense.",
			level: "open",
		},
	];
}
