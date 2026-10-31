import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BaselBands,
	PlacementTable,
	ReconstructionStrip,
} from "#/components/story/BaselStages";
import {
	ArchiveBridge,
	EvidenceDeck,
	PairedPassage,
	ValueRun,
} from "#/components/story/CrossLink";
import {
	Conf,
	Layers,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave from "#/components/story/StrandWeave";
import { getColors, getKhipus, getSilhouettes } from "#/lib/khipu/data";
import type { Khipu } from "#/lib/khipu/types";
import {
	alignedPassage,
	BASEL_FRAGMENT_IDS,
	BASEL_IDS,
	brownUnits,
	type HalfPlacement,
	placeFragments,
	ruleChance,
	subsidiaryValues,
	unitTotals,
	whiteUnits,
} from "#/lib/stories/basel";
import {
	GAFFRON_FRAGMENT_ID,
	PACHACAMAC_LONG_ID,
	PACHACAMAC_TABLE_ID,
	pachacamacReverse,
	pachacamacTable,
} from "#/lib/stories/crosslinks";
import { getStrands } from "#/lib/stories/strands";
import "#/styles/stories/pachacamac-fragment.css";

/** the fragments a strand ties to a Berlin khipu, for the weave and the bands */
const THREADED_FRAGMENTS = [
	"KH0682",
	"KH0683",
	"KH0686",
	"KH0688",
	"KH0689",
	"KH0690",
];

export const Route = createFileRoute("/stories/pachacamac-fragment")({
	loader: async () => {
		const [khipus, colors, silhouettes, strands] = await Promise.all([
			getKhipus([...BASEL_IDS]),
			getColors(),
			getSilhouettes(),
			getStrands(),
		]);
		return { khipus, colors, silhouettes, strands };
	},
	head: () => ({
		meta: [{ title: "The fragments between two archives — Khipu" }],
	}),
	component: PachacamacFragment,
});

function Passage({
	fragment,
	half,
	unitLabel,
	tone,
}: {
	fragment: Khipu;
	half: HalfPlacement;
	unitLabel: string;
	tone: "brown" | "white";
}) {
	const { left, right } = alignedPassage(fragment, half);
	return (
		<PairedPassage
			left={`${unitLabel} · unit #${half.unit.k} (g${half.unit.group + 1})`}
			right={`${fragment.id} · ${half.run.direction}`}
			leftValues={left}
			rightValues={right}
			leftTone={tone}
			rightTone={tone}
			reversed={half.run.direction === "reversed"}
		/>
	);
}

function PachacamacFragment() {
	const { khipus, colors, silhouettes, strands } = Route.useLoaderData();
	const table = khipus[PACHACAMAC_TABLE_ID];
	const long = khipus[PACHACAMAC_LONG_ID];
	const fragment = khipus[GAFFRON_FRAGMENT_ID];
	const fragments = BASEL_FRAGMENT_IDS.map((id) => khipus[id]);

	const reverse = pachacamacReverse(long, fragment);
	const tableMatch = pachacamacTable(table, fragment);
	const reverseExact = reverse.filter((f) => f.verdict === "exact").length;
	const tableExact = tableMatch.filter((f) => f.verdict === "exact").length;

	const placements = placeFragments(long, table, fragments);
	const byId = new Map(placements.map((p) => [p.id, p]));
	const twoSided = placements.filter((p) => p.brown && p.white);
	const ruleHolds = twoSided.filter((p) => p.ruleHolds).length;
	const placed = placements.filter((p) => p.brown || p.white).length;
	const units = whiteUnits(table).length;
	const brownCount = brownUnits(long).length;
	const totals = unitTotals(long, table);
	const kh0690 = byId.get("KH0690");
	const kh0682 = byId.get("KH0682");
	const kh0683 = byId.get("KH0683");

	// KH0683's six white cords carry two subsidiaries each; KH0147's unit 13
	// carries one NB:R subsidiary per cord — the values do not correspond.
	const unit13 = whiteUnits(table).find((u) => u.k === 13);
	const tableSubs = unit13 ? subsidiaryValues(table, unit13.cords) : [];
	const fragSubs = subsidiaryValues(
		khipus.KH0683,
		khipus.KH0683.cords
			.filter((c) => c.level === 1)
			.sort((a, b) => a.ordinal - b.ordinal),
	);

	return (
		<StoryPage
			kicker="Basel IVc.366.03"
			title="The fragments between two archives"
			standfirst={
				<>
					Ten small khipu fragments in Basel share one accession number. Six of
					them repeat groups from two Berlin khipus catalogued from Pachacamac
					(brown groups from one, white groups from the other), and the three
					that carry both follow one placement rule. They suggest a third record
					that paired the two accounts unit by unit, and that the Berlin pair
					list the same fourteen units in opposite orders.
				</>
			}
			meta={
				<>
					<span>
						KH0682–KH0691 · MM008–MM017 · Basel, reported from a burial near
						Huacho
					</span>
					<span>Compared with KH0147 / VA42510 and KH0450 / VA42513</span>
				</>
			}
		>
			<StrandWeave
				top={[PACHACAMAC_LONG_ID, PACHACAMAC_TABLE_ID]}
				bottom={THREADED_FRAGMENTS}
			/>
			<EvidenceDeck
				items={[
					{
						value: `${placed}/10`,
						label: "fragments placed",
						note: "on a Berlin group, by values",
					},
					{
						value: `${ruleHolds}/${twoSided.length}`,
						label: "two-sided fragments obey the unit rule",
						note: `1 in ${ruleChance(units, twoSided.length).toLocaleString()} if pairing were random`,
					},
					{
						value: `${units} = ${brownCount}`,
						label: "big groups on each Berlin khipu",
						note: "the same count on both",
					},
					{
						value: "3",
						label: "museum accession gap",
						note: "VA42510 to VA42513",
					},
				]}
			/>

			<Step n={1} title="Ten fragments on black fabric">
				<Prose>
					<p>
						The Museum der Kulturen in Basel keeps ten khipu fragments sewn to
						one black backing, under the single number IVc.366.03. The largest,
						KH0682, has 25 pendants; the smallest, three. Their primary cords
						are stubs of 1.5 to 6.5 cm. The Khipu Field Guide lists them under
						the collector Eduard Gaffron, but the museum's report for 1910,
						quoted by Manuel Medrano, says they were excavated by Arnold Masarey
						from a burial ground near Huacho and bought from him that year.
					</p>
					<p>
						KH0689 was the first to be placed; its recorder notes that the last
						pendant has a tenuous attachment and an unusual subsidiary
						structure. Its numbers, and those of five other fragments, place
						these six on the Berlin khipus.{" "}
						<Conf level="firm">Fragmentary objects</Conf>
					</p>
				</Prose>
				<Wide caption="The two Berlin khipus and the six fragments their values place, all at one pendant pitch, so a three-cord fragment is drawn three cords wide. Each fragment sits under the KH0147 cords it repeats. Brown threads run up to KH0450, white threads down to KH0147. The brown threads of KH0689 and KH0682 reach the far end of KH0450 while their white threads drop to the KH0147 cords just below: the two Berlin khipus hold the shared units in opposite orders. Hover over a thread for its value.">
					<BaselBands
						longId={PACHACAMAC_LONG_ID}
						tableId={PACHACAMAC_TABLE_ID}
						fragments={THREADED_FRAGMENTS}
						strands={strands}
						sils={silhouettes}
						colors={colors}
					/>
				</Wide>
			</Step>

			<Step n={2} title="A brown group that runs backwards">
				<Prose>
					<p>
						KH0450 ends with a 14-cord group. KH0689 begins with the same 13
						nonblank values in reverse order, while both leave the fourteenth
						field blank. Every value is preserved, including the less common
						212, 53, 31 and 25.{" "}
						<Conf level="firm">{reverseExact}/14 exact after reversal</Conf>
					</p>
				</Prose>
				<Wide caption="Reversed, the fragment's first group lines up in all fourteen positions.">
					<PairedPassage
						left="KH0450 · group 16"
						right="KH0689 · group 1"
						leftValues={reverse.map((field) => field.a)}
						rightValues={reverse.map((field) => field.b)}
						leftTone="brown"
						rightTone="brown"
						reversed
					/>
				</Wide>
			</Step>

			<Step n={3} title="A white group from a second object">
				<Prose>
					<p>
						KH0689's second group switches from brown to white. Its first six
						values and its eighth equal the same positions in KH0147's first
						group; the separate last pendant reads 7, the value in KH0147's
						ninth position. Only one retained position disagrees: 4 where KH0147
						is blank. KH0147's closing 136 is absent.{" "}
						<Conf level="likely">{tableExact}/10 aligned</Conf>
					</p>
				</Prose>
				<Wide caption="The break before 7 is a recorded group boundary on the fragment.">
					<PairedPassage
						left="KH0147 · group 1"
						right="KH0689 · groups 2 + 3"
						leftValues={tableMatch.map((field) => field.a)}
						rightValues={tableMatch.map((field) => field.b)}
						leftTone="white"
						rightTone="white"
						boundaryAfter={8}
					/>
				</Wide>
			</Step>

			<Step n={4} title="The same shape, twice more">
				<Prose>
					<p>
						KH0690 has the same anatomy: thirteen brown cords, a blank, five
						white cords. Its brown cords are KH0450's group 13 backwards (nine
						values in a row, with 23 for 22 and one cord dropped); its white
						cords are the first five of KH0147's group 7.
					</p>
					<p>
						KH0682 was catalogued from the other end. It opens with ten white
						cords that are KH0147's last group backwards (eight of ten; 14 and
						45 for 0 and 50), then a blank, then fourteen brown cords that are
						KH0450's first group forwards (103 for 102, 22 for 23, 84 and 6
						swapped), and one last white cord reading{" "}
						{kh0682?.tail?.value ?? 113}, which is the closing cord of KH0147's
						group {kh0682?.tail ? kh0682.tail.unit.group + 1 : 17}.{" "}
						<Conf level="firm">Value matches</Conf>
					</p>
				</Prose>
				<Wide caption="KH0690 against KH0450 unit 4 (its group 13, read backwards) and KH0147 unit 4 (its group 7, read forwards).">
					{kh0690?.brown && (
						<Passage
							fragment={khipus.KH0690}
							half={kh0690.brown}
							unitLabel="KH0450"
							tone="brown"
						/>
					)}
					{kh0690?.white && (
						<Passage
							fragment={khipus.KH0690}
							half={kh0690.white}
							unitLabel="KH0147"
							tone="white"
						/>
					)}
				</Wide>
				<Wide caption="KH0682 against KH0147 unit 14 (its last group, read backwards) and KH0450 unit 14 (its first group, read forwards). Blue cells agree; brown-tinted cells differ.">
					{kh0682?.white && (
						<Passage
							fragment={khipus.KH0682}
							half={kh0682.white}
							unitLabel="KH0147"
							tone="white"
						/>
					)}
					{kh0682?.brown && (
						<Passage
							fragment={khipus.KH0682}
							half={kh0682.brown}
							unitLabel="KH0450"
							tone="brown"
						/>
					)}
				</Wide>
			</Step>

			<Step n={5} title="The placement rule">
				<Prose>
					<p>
						Set aside KH0450's 3-cord and 1-cord groups and KH0147's single-cord
						separators, and each Berlin khipu has exactly {units} big groups.
						Number KH0450's from its <em>end</em> and KH0147's from its{" "}
						<em>start</em>. KH0689 pairs unit 1 with unit 1; KH0690 pairs 4 with
						4; KH0682 pairs {brownCount} with {units}. Three fragments, three
						agreements, at one chance in{" "}
						{ruleChance(units, twoSided.length).toLocaleString()} if the pairing
						were random.{" "}
						<Conf level="firm">
							{ruleHolds}/{twoSided.length}
						</Conf>
					</p>
					<p>
						Three more fragments fix one side each: KH0683's six white cords are
						KH0147's unit 13 backwards; KH0686's three brown cords (194, 16, 14)
						are KH0450's unit 7 backwards; KH0688's 256 and 55 open KH0450's
						unit 2. Four small fragments of three to nine cords remain unplaced.
					</p>
				</Prose>
				<Wide caption="Every fragment against the two Berlin khipus. Blue rows carry both halves and obey the rule; grey rows could not be placed. 'Reads as' is the order in which the fragment's recorder met the cords.">
					<PlacementTable placements={placements} />
				</Wide>
			</Step>

			<Step n={6} title="Reconstructing the Basel khipu">
				<Prose>
					<p>
						Read in one consistent direction, the fragments fit a single object:
						fourteen units, each a brown group, a blank cord and a white group,
						in KH0147's order. KH0689, KH0690 and KH0686 were catalogued
						brown-first and show the brown group reversed; KH0682 was catalogued
						white-first and shows the white group reversed instead. The reversal
						moves with the reading direction, as expected if they were one
						khipu.
					</p>
					<p>
						The brown groups always run opposite to KH0450. An earlier version
						of this story called the fragment "backwards"; on this reading it is
						KH0450 that is in mirror order: its units run from 14 down to 1 and
						the cords within each unit are reversed, relative to both KH0147 and
						the Basel khipu. Either its maker began from the other end, or the
						Berlin record did. Medrano, who recorded the fragments, judged it
						less likely that they began as one khipu than as separate cordage;
						the unit rule is the argument for one.{" "}
						<Conf level="likely">Reconstruction</Conf>
					</p>
				</Prose>
				<Wide caption="The Basel khipu in the middle, KH0450 above it and KH0147 below. Solid units are fixed by a fragment (the fragment numbers sit under them); faded units are the inference that the pattern continued. A line joins unit k on each row: KH0450’s lines cross into an X, KH0147’s drop straight down. Solid lines pass through a fixed unit, dashed ones through an inferred unit.">
					<ReconstructionStrip placements={placements} units={units} />
				</Wide>
			</Step>

			<Step n={7} title="Two accounts, not a copy and its summary">
				<Prose>
					<p>
						If KH0147 and KH0450 list the same fourteen units, they do not
						record the same quantities. Unit for unit, the totals bear no
						constant ratio or difference; unit 5 is blank on KH0147 and 270 on
						KH0450. The white account has nine fields and a large tenth, with
						the seventh field blank in ten of twelve full groups; the brown
						account has fourteen fields with large values in the second and
						last. They may record different things about the same units, such as
						two commodities, two years, or an assessment and a delivery.
					</p>
					<p>
						The Basel khipu appears to be a third record, not a piece of either.
						Its white cords carry their own subsidiaries: KH0683's six cords
						each hang two (values{" "}
						{fragSubs.map((s) => s.join("+") || "0").join(", ")}), where
						KH0147's matching cords hang one dark-brown subsidiary each (
						{tableSubs.map((s) => s.join("+") || "0").join(", ")}). The pendant
						values were shared; the subsidiary data were not.{" "}
						<Conf level="open">What the two accounts are</Conf>
					</p>
				</Prose>
				<Wide caption="Unit totals under the rule. KH0450 unit 11 is its one 10-cord group (51 … 74); the rest are 13–14 cords.">
					<div className="ledger match-ledger basel-totals">
						<table className="ledger-table">
							<thead>
								<tr>
									<th className="num">Unit</th>
									<th className="num">KH0147 white sum</th>
									<th className="num">KH0450 brown sum</th>
									<th className="num">Ratio</th>
									<th>Fixed by</th>
								</tr>
							</thead>
							<tbody>
								{totals.map((t) => {
									const fixers = placements.filter(
										(p) =>
											(p.brown?.run.firm && p.brown.unit.k === t.k) ||
											(p.white?.run.firm && p.white.unit.k === t.k),
									);
									return (
										<tr
											key={t.k}
											className={fixers.length ? "match-exact" : ""}
										>
											<td className="num">{t.k}</td>
											<td className="num">{t.white.toLocaleString()}</td>
											<td className="num">{t.brown.toLocaleString()}</td>
											<td className="num">
												{t.ratio == null ? "—" : t.ratio.toFixed(2)}
											</td>
											<td className="muted">
												{fixers.map((p) => p.id).join(", ") || ""}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</Wide>
				{kh0683?.white && (
					<Wide caption="KH0683 against KH0147's unit 13, read backwards. The fragment's first four cords are lost; its recorder met 16 first.">
						<Passage
							fragment={khipus.KH0683}
							half={kh0683.white}
							unitLabel="KH0147"
							tone="white"
						/>
						<div className="pf-scroll">
							<ValueRun
								label="KH0147 subsidiaries"
								values={tableSubs.map((s) => s[0] ?? null).reverse()}
								compact
							/>
							<ValueRun
								label="KH0683 subsidiaries"
								values={[
									null,
									null,
									null,
									null,
									...fragSubs.map((s) => s[0] ?? null),
								]}
								compact
							/>
						</div>
					</Wide>
				)}
			</Step>

			<Step n={8} title="From Pachacamac to a grave near Huacho">
				<Prose>
					<p>
						KH0147 and KH0450 are both catalogued from Pachacamac. In Berlin
						they are VA42510 and VA42513, close enough to suggest the same
						acquisition series. Six Basel fragments carry passages from one or
						both, and pairing each brown unit with its white unit suggests a
						maker with access to both accounts. The fragments, however, are
						reported from a burial near Huacho, north of Lima, while Pachacamac
						lies to its south. A similar link appears elsewhere: AS175,
						catalogued from Pachacamac, repeats the account on UR232 and UR233,
						catalogued from Huacho (
						<Link to="/stories/tied-twice">An account tied twice</Link>).
					</p>
					<p>
						The value matches are firm: these objects share data, and the Berlin
						pair share their fourteen units. Where the accounts were kept is
						open: either one account was copied between Pachacamac and the
						Huacho coast, or the Berlin "Pachacamac" attributions, which rest on
						dealers' lots, are looser than the catalogue suggests. The order in
						which the ten pieces are sewn to the Basel backing, if it preserves
						how they were found, could test the reconstruction; so could KH0684,
						a white 43 · 33 · 41 with brown subsidiaries that no unit yet
						explains.
					</p>
				</Prose>
				<Wide>
					<ArchiveBridge reverseExact={reverseExact} tableExact={tableExact} />
					<div
						className="link-equation"
						role="img"
						aria-label="Fragment relationship"
					>
						<span>KH0450 unit k, from its end</span>
						<b>beside</b>
						<span>KH0147 unit k, from its start</span>
						<b>on</b>
						<span>KH0682 · KH0689 · KH0690</span>
					</div>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Ten fragments under one Basel accession; two Berlin khipus catalogued from Pachacamac under VA42510 and VA42513, each with fourteen big groups.",
								level: "firm",
							},
							{
								title: "Derived",
								body: `Six fragments repeat a KH0450 group and/or a KH0147 group, 3 to 13 values at a time. The ${twoSided.length} two-sided fragments pair KH0450's units counted from its end with KH0147's counted from its start (${ruleHolds}/${twoSided.length}).`,
								level: "firm",
							},
							{
								title: "Context",
								body: "According to the museum's 1910 report, quoted by Medrano, the fragments were excavated near Huacho by Arnold Masarey and bought by the Basel museum that year (the Field Guide's \"Gaffron\" is the collector of other objects). Their subsidiaries differ from KH0147's; KH0450's group order is the mirror of KH0147's.",
								level: "likely",
							},
							{
								title: "Interpretation",
								body: "Possibly one khipu, reportedly buried near Huacho, that interleaved the two Pachacamac accounts unit by unit; how an account moved between the two places is not known.",
								level: "open",
							},
						]}
					/>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Khipu Field Guide",
						what: "KH0682–KH0691 records (MM008–MM017), Museum der Kulturen IVc.366.03",
						where: "catalogue pages fetched 2026-09-19",
						href: "https://www.khipufieldguide.com/catalog/KH0689.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0450 (UR212, VA42513) and KH0147 (AS131, VA42510) records",
						where: "Ethnologisches Museum, Berlin",
						href: "https://www.khipufieldguide.com/catalog/KH0450.html",
					},
					{
						who: "Medrano 2022",
						what: "PhD thesis, University of St Andrews, pp. 124–150 and fn. 44: the Basel fragments, the museum's 1910 report (Masarey, near Huacho)",
						where: "St Andrews Research Repository",
						href: "https://research-repository.st-andrews.ac.uk/bitstream/handle/10023/28761/Thesis-Manuel-Medrano-complete-version.pdf?sequence=2&isAllowed=y",
					},
					{
						who: "This site",
						what: "Fragment placement and unit rule, reproducible",
						where: "scripts/basel_fragments.py; src/lib/stories/basel.ts",
					},
					{
						who: "This site",
						what: "Corpus-wide shared-passage screen that first linked KH0689",
						where: "scripts/cross_khipu_analysis.py",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories/brown-eight">
					Next: eight brown cords shared across collections →
				</Link>
			</p>
		</StoryPage>
	);
}
