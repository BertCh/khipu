import { createFileRoute, Link } from "@tanstack/react-router";
import BarList, { type BarRow } from "#/components/charts/BarList";
import Columns, { type Column } from "#/components/charts/Columns";
import Figure, { StatTile } from "#/components/charts/Figure";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import StrandWeave from "#/components/story/StrandWeave";
import { getCodes, getColors, getCorpus, getKhipu } from "#/lib/khipu/data";
import { knotTypeName } from "#/lib/khipu/describe";
import type { Counts } from "#/lib/khipu/types";
import {
	countWord,
	getNetworkSummary,
	useStoryCount,
} from "#/lib/stories/networkSummary";
import "#/styles/cards.css";

const HERO_ID = "KH0238";
/** the Large zoom of the khipu page: room for the rope to read as rope */
const HERO_LAYOUT = { slot: 16, subOffset: 6, pxPerCm: 5, cordW: 3.4 };
/** The archive panel's weave: a passage of UR006, from the same Leymebamba
 * find as the hero, repeated on UR021 (Urton, published). The hero itself is
 * in no value link, so nothing is drawn over it. */
const WEAVE_TOP = ["KH0242"];
const WEAVE_BOTTOM = ["KH0257"];
const WEAVE_WINDOW = { id: "KH0242", from: 266, to: 302 };

export const Route = createFileRoute("/")({
	loader: async () => {
		const [corpus, colors, codes, hero, network] = await Promise.all([
			getCorpus(),
			getColors(),
			getCodes(),
			getKhipu(HERO_ID),
			getNetworkSummary(),
		]);
		return { corpus, colors, codes, hero, network };
	},
	component: Overview,
});

function Overview() {
	const { corpus, colors, codes, hero, network } = Route.useLoaderData();
	const nStories = useStoryCount();

	// --- derived series -----------------------------------------------------
	const cordsPerKhipu = binsFromCounts(corpus.cordsPerKhipu, 25, 500);
	const cordLength = binsFromCounts(corpus.cordLength, 5, 100);
	const museums = topWithOther(corpus.museum, 10, "Other museums");
	const provenance = topN(
		Object.fromEntries(
			Object.entries(corpus.provenance).filter(([k]) => k !== "Unknown"),
		),
		10,
	);
	const colorRows: BarRow[] = topN(corpus.colorCords, 12).map((r) => ({
		...r,
		label: r.key,
		sublabel: colors[r.key]?.name,
		color: colors[r.key]?.hex,
	}));
	const knotRows: BarRow[] = topN(corpus.knotTypes, 9).map((r) => ({
		...r,
		label: knotTypeName(r.key),
		sublabel: r.key,
	}));
	const totalValued = Object.values(corpus.leadingDigit).reduce(
		(a, b) => a + b,
		0,
	);
	const benford: Column[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
		(d) => ({
			key: d,
			label: d,
			value: corpus.leadingDigit[d] ?? 0,
			marker: Math.round(totalValued * Math.log10(1 + 1 / Number(d))),
		}),
	);
	const levels: Column[] = Object.entries(corpus.level)
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(([k, v]) => ({ key: k, label: `level ${k}`, value: v }));
	const unknownProvenance = corpus.provenance.Unknown ?? 0;

	return (
		<main className="page-wrap">
			<h1 className="page-title">Knots, cords, and colours</h1>
			<p className="lede">
				{corpus.nKhipus.toLocaleString()} khipus recorded cord by cord:{" "}
				{corpus.nCords.toLocaleString()} cords carrying{" "}
				{corpus.nKnots.toLocaleString()} knots, from the Khipu Field Guide and
				the Open Khipu Repository.
			</p>

			{hero && (
				<section className="section" aria-labelledby="hero-title">
					<div className="diagram-tools">
						<span id="hero-title">
							<Link to="/khipus/$id" params={{ id: hero.id }}>
								{hero.id}
							</Link>{" "}
							from {hero.provenance ?? "an unknown site"}, held by{" "}
							{hero.museum.name}. {hero.stats.nPendants} pendant cords in{" "}
							{hero.stats.nGroups} groups; hover a cord to read it.
						</span>
					</div>
					<KhipuDiagram
						khipu={hero}
						colors={colors}
						codes={codes}
						layout={HERO_LAYOUT}
						style="physical"
						fit
					/>
				</section>
			)}

			<section className="section home-panels" aria-label="Read further">
				<Link to="/stories" className="archive-band home-panel">
					<div className="archive-band-body">
						<span className="story-card-kicker">
							{countWord(nStories, true)} stories
						</span>
						<h2>Partial readings</h2>
						<p>
							A storehouse ledger found under chili peppers, a census of 1670,
							accounts tied twice and copies now in different museums. Each
							story adds one layer of reading at a time and says where it stops.
						</p>
						<span className="archive-band-more">Read the stories →</span>
					</div>
				</Link>
				{network && (
					<Link to="/network" className="archive-band home-panel">
						<div className="archive-band-body">
							<span className="story-card-kicker">
								{network.khipus} khipus · {network.links} links ·{" "}
								{network.islands} islands
							</span>
							<h2>The connected archive</h2>
							<p>
								Khipus that share values with another, often now held in
								different museums, drawn as one map.
							</p>
						</div>
						<div className="archive-panel-art">
							<StrandWeave
								top={WEAVE_TOP}
								bottom={WEAVE_BOTTOM}
								window={WEAVE_WINDOW}
								inset={false}
								variant="divider"
								interactive={false}
								caption={false}
							/>
							<p className="archive-band-caption">
								A passage of Leymebamba UR006 (above) repeated on UR021 (below);
								published by Urton.
							</p>
						</div>
						<span className="archive-band-more">Open the network →</span>
					</Link>
				)}
			</section>

			<div className="stats">
				<StatTile
					label="khipus"
					value={corpus.nKhipus}
					hint={`${corpus.nInOkr} also in the OKR`}
				/>
				<StatTile label="cords" value={corpus.nCords} />
				<StatTile label="knots" value={corpus.nKnots} />
				<StatTile label="museums and collections" value={corpus.nMuseums} />
				<StatTile
					label="Ascher colour codes in use"
					value={Object.keys(corpus.colorCords).length}
				/>
			</div>

			<section className="section">
				<h2>The corpus</h2>
				<p className="prose">
					Most khipus are small; a few are very large. Provenance is unknown for{" "}
					{unknownProvenance} of them.
				</p>
				<div className="figures">
					<Figure
						title="Cords per khipu"
						note="Counting pendants and their subsidiaries together. Bins of 25 cords."
						table={{
							head: ["Cords", "Khipus"],
							rows: cordsPerKhipu.map((b) => [b.label, b.value]),
						}}
					>
						<Columns data={cordsPerKhipu} series="khipus" unit="khipus" />
					</Figure>
					<Figure
						title="Where they are kept"
						note="Khipus by holding institution. Berlin's Ethnologisches Museum holds the largest single collection."
						table={{
							head: ["Museum", "Khipus"],
							rows: museums.map((r) => [r.label, r.value]),
						}}
					>
						<BarList rows={museums} share total={corpus.nKhipus} />
					</Figure>
					<Figure
						title="Where they were found"
						note="Recorded provenance, when known. Pachacamac, near Lima, leads."
						table={{
							head: ["Site", "Khipus"],
							rows: provenance.map((r) => [r.label, r.value]),
						}}
					>
						<BarList rows={provenance} share total={corpus.nKhipus} />
					</Figure>
					<Figure
						title="Cord colours"
						note="The twelve most used Ascher colour codes, counted by cords that use them. White is most common; browns follow."
						table={{
							head: ["Code", "Name", "Cords"],
							rows: colorRows.map((r) => [r.key, r.sublabel ?? "", r.value]),
						}}
					>
						<BarList rows={colorRows} share total={corpus.nCords} />
					</Figure>
				</div>
			</section>

			<section className="section">
				<h2>How numbers were tied</h2>
				<p className="prose">
					Numeric knots are decimal. Single knots stack for tens, hundreds and
					thousands; a long knot's turns give the units from 2 to 9; a
					figure-eight is 1. The leading digits of the recorded cord values
					follow Benford's law closely, as counted quantities often do.
				</p>
				<div className="figures">
					<Figure
						title="Knot types"
						note="Physical knots across the corpus. A long knot is counted once regardless of its turns."
						table={{
							head: ["Type", "Code", "Knots"],
							rows: knotRows.map((r) => [r.label, r.sublabel ?? "", r.value]),
						}}
					>
						<BarList rows={knotRows} share total={corpus.nKnots} />
					</Figure>
					<Figure
						title="Leading digit of cord values"
						note={`Cords with a non-zero value (${totalValued.toLocaleString()}), by first digit, against the Benford expectation.`}
						table={{
							head: ["Digit", "Observed", "Benford"],
							rows: benford.map((b) => [b.label, b.value, b.marker ?? 0]),
						}}
					>
						<Columns
							data={benford}
							series="observed cords"
							markerSeries="Benford expected"
							unit="cords"
						/>
					</Figure>
					<Figure
						title="Cord lengths"
						note="Pendant and subsidiary cord lengths in 5 cm bins. Most cords are 25–40 cm; many of the short ones are broken."
						table={{
							head: ["Length", "Cords"],
							rows: cordLength.map((b) => [b.label, b.value]),
						}}
					>
						<Columns data={cordLength} series="cords" unit="cords" />
					</Figure>
					<Figure
						title="Depth of the hierarchy"
						note="Cords by level: pendants hang from the primary cord, subsidiaries from pendants, and so on up to six deep."
						table={{
							head: ["Level", "Cords"],
							rows: levels.map((b) => [b.label, b.value]),
						}}
					>
						<Columns data={levels} series="cords" unit="cords" labelEvery={1} />
					</Figure>
				</div>
			</section>
		</main>
	);
}

// --- small data helpers ----------------------------------------------------

function topN(counts: Counts, n: number): BarRow[] {
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([key, value]) => ({ key, label: key, value }));
}

function topWithOther(counts: Counts, n: number, otherLabel: string): BarRow[] {
	const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
	const head = sorted
		.slice(0, n)
		.map(([key, value]) => ({ key, label: key, value }));
	const rest = sorted.slice(n).reduce((a, [, v]) => a + v, 0);
	if (rest > 0) head.push({ key: "__other", label: otherLabel, value: rest });
	return head;
}

/** Same, from precomputed {binStart: count}. */
function binsFromCounts(counts: Counts, width: number, cap: number): Column[] {
	const nBins = Math.ceil(cap / width) + 1;
	const bins = Array.from({ length: nBins }, (_, i) => ({
		key: String(i * width),
		label: i === nBins - 1 ? `${cap}+` : `${i * width}`,
		value: 0,
	}));
	for (const [k, v] of Object.entries(counts)) {
		const i = Math.min(nBins - 1, Math.floor(Number(k) / width));
		bins[i].value += v;
	}
	return bins;
}
