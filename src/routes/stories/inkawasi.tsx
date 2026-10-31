import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import CordReader from "#/components/story/CordReader";
import {
	GrammarStage,
	LedgerWalkStage,
	MirrorStage,
	ReadCordStage,
	ReadGroupStage,
} from "#/components/story/InkawasiStages";
import IslandFlow from "#/components/story/IslandFlow";
import { LedgerTable, PairedLedger } from "#/components/story/Ledger";
import {
	Conf,
	type Layer,
	Layers,
	Legend,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave from "#/components/story/StrandWeave";
import { hexFor } from "#/lib/khipu/colors";
import {
	getColors,
	getKhipuIndex,
	getKhipus,
	getSilhouettes,
} from "#/lib/khipu/data";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { curatedIsland } from "#/lib/stories/curatedIsland";
import {
	isTruncated,
	ledgerGroups,
	ledgerStats,
	pendantGroups,
	sharedValues,
} from "#/lib/stories/derive";
import { pairKey } from "#/lib/stories/links";
import "#/styles/network.css";
import "#/styles/stories/inkawasi.css";

/** display names for the weaves */
const WEAVE_NAMES: Record<string, string> = {
	KH0503: "UR267A",
	KH0491: "UR255",
	KH0504: "UR267B",
	KH0492: "UR256",
	KH0514: "UR275",
	KH0502: "UR266",
	KH0517: "UR278",
};

/** the hero: the three published mirrors and the firm totals chain only */
const HERO_LINKS = [
	pairKey("KH0503", "KH0491"),
	pairKey("KH0504", "KH0492"),
	pairKey("KH0514", "KH0502"),
	pairKey("KH0517", "KH0502"),
];

/**
 * The published ledgers: which khipu carries which fixed value, what it was
 * found with, and which khipu re-states it (Urton & Chu 2019; Clindaniel 2019).
 */
const LEDGERS = [
	{
		id: "KH0503",
		alias: "UR267A",
		fixed: 15,
		produce: "chili peppers",
		mirror: "KH0491",
	},
	{
		id: "KH0504",
		alias: "UR267B",
		fixed: 10,
		produce: "chili peppers",
		mirror: "KH0492",
	},
	{
		id: "KH0514",
		alias: "UR275",
		fixed: 47,
		produce: "peanuts",
		mirror: "KH0502",
	},
	{
		id: "KH0505",
		alias: "UR268",
		fixed: 208,
		produce: "peanuts",
		mirror: null,
	},
] as const;

const IDS = [
	"KH0503",
	"KH0491",
	"KH0504",
	"KH0492",
	"KH0514",
	"KH0502",
	"KH0505",
];

export const Route = createFileRoute("/stories/inkawasi")({
	loader: async () => {
		const [khipus, colors, index, silhouettes] = await Promise.all([
			getKhipus(IDS),
			getColors(),
			getKhipuIndex(),
			getSilhouettes(),
		]);
		const archive = index
			.filter((k) => k.provenance === "Incahuasi")
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((k) => ({
				id: k.id,
				alias: k.aliases[0] ?? k.id,
				nPendants: k.nPendants,
				nGroups: k.nGroups,
				maxValue: k.maxValue,
				cords: silhouettes[k.id]
					? silhouettes[k.id].l.map((l, i) => ({
							length: l,
							color: silhouettes[k.id].c[i],
						}))
					: [],
			}));
		const storehouse = curatedIsland(
			index,
			index.filter((k) => k.provenance === "Incahuasi").map((k) => k.id),
		);
		return { khipus, colors, archive, silhouettes, storehouse };
	},
	head: () => ({
		meta: [{ title: "Inkawasi storehouse accounts — Khipu" }],
	}),
	component: Inkawasi,
});

function Inkawasi() {
	const { khipus, colors, archive, silhouettes, storehouse } =
		Route.useLoaderData();
	const [flowSel, setFlowSel] = useState<string | null>(null);
	const a = khipus.KH0503; // UR267A
	const mirror = khipus.KH0491; // UR255
	const peanuts = khipus.KH0505; // UR268
	const [selected, setSelected] = useState<string | null>("p13");

	const statsA = useMemo(() => ledgerStats(ledgerGroups(a, 15)), [a]);
	const p11 = a.cords.find((c) => c.name === "p11") as Cord;
	const p13 = a.cords.find((c) => c.name === "p13") as Cord;
	const pairs = useMemo(
		() =>
			LEDGERS.filter((l) => l.mirror).map((l) => {
				const x = khipus[l.id];
				const y = khipus[l.mirror as string];
				return {
					...l,
					mirrorAlias: y.aliases[0],
					shared: sharedValues(x, y, l.fixed).size,
					groupsX: pendantGroups(x).length,
					groupsY: pendantGroups(y).length,
				};
			}),
		[khipus],
	);

	const storyIds = new Set(IDS);

	return (
		<StoryPage
			kicker="Inkawasi"
			title="Inkawasi storehouse accounts"
			standfirst={
				<>
					From 2013 archaeologists excavating a storeroom at Inkawasi, in the
					Cañete valley south of Lima, found khipus beneath deposits of chili
					peppers, peanuts and black beans, the first khipus found with goods
					they may have counted. Their knot values can be read and their
					arithmetic checked below. What the numbers were for is debated.
				</>
			}
			meta={
				<>
					<span>
						Objects:{" "}
						{LEDGERS.map((l, i) => (
							<span key={l.id}>
								{i > 0 && ", "}
								<Link to="/khipus/$id" params={{ id: l.id }}>
									{l.alias}
								</Link>
							</span>
						))}{" "}
						and their pairs
					</span>
					<span>Proyecto Arqueológico Incahuasi</span>
				</>
			}
		>
			<StrandWeave
				top={["KH0503", "KH0504", "KH0514", "KH0517"]}
				bottom={["KH0491", "KH0492", "KH0502"]}
				links={HERO_LINKS}
				names={WEAVE_NAMES}
			/>
			<Step n={1} title="Where they were found">
				<Prose>
					<p>
						Inkawasi was an Inka administrative centre that the chroniclers
						describe as a staging ground for campaigns along the south coast.
						Its storehouse — Sector A, with sorting yards, long{" "}
						<em>kallankas</em> and rows of bins — was excavated by Alejandro Chu
						from 2013. Over two seasons his team recovered 34 khipus from three
						rooms and a corridor, several of them directly beneath deposits of
						produce. In 2016 Jon Clindaniel and Chu found 23 more in Sector B.
					</p>
					<p>
						Fifty-two of those are recorded in the Khipu Field Guide and drawn
						here: the UR series from the storeroom and the JC series from Sector
						B. Their context comes from excavation, not a museum label.{" "}
						<Conf level="firm">Excavated in place</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The Inkawasi khipus recorded so far, to a shared scale. The four
							ledgers read here and the khipus that mirror them are outlined.
						</>
					}
				>
					<div className="archive-grid">
						{archive.map((k) => (
							<Link
								key={k.id}
								to="/khipus/$id"
								params={{ id: k.id }}
								className={`archive-cell ${storyIds.has(k.id) ? "is-story" : ""}`}
							>
								<KhipuSilhouette
									cords={k.cords}
									colors={colors}
									width={150}
									height={34}
								/>
								<span className="archive-name">
									{k.alias}
									<span>
										{k.nPendants} cords · max {k.maxValue.toLocaleString()}
									</span>
								</span>
							</Link>
						))}
					</div>
				</Wide>
			</Step>

			<Step n={2} title="Read one cord">
				<Prose>
					<p>
						Take pendant 11 of UR267A. The recorder measured two single knots 5
						cm below the primary cord and a long knot of six turns at 18.5 cm.
						Inka knots are decimal and positional: the highest place is tied
						nearest the primary cord, single knots count tens and hundreds, a
						long knot's turns give the units from 2 to 9, a figure-eight is 1,
						and an empty position is zero. So the cord reads 206. Two cords
						along, pendant 13 reads 191: one single knot for a hundred, nine for
						ninety, and a figure-eight for one.
					</p>
					<p>
						This numeric layer has been readable since Leland Locke's work a
						century ago. A cord also records colour, twist, attachment and
						position among its neighbours, which are not numbers.{" "}
						<Conf level="firm">Decimal knots</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							From the whole khipu down to the knots. Drag to pan; pinch or
							⌘-scroll to zoom; the values under the cords are the Field Guide's
							readings.
						</>
					}
				>
					<ReadCordStage khipu={a} colors={colors} />
				</Wide>
				<Wide
					caption={
						<>
							The same two cords drawn to scale from the record, with each
							cluster read out. A knot's position gives its decimal place; its
							type gives the digit. FitzPatrick (2026) shows that some visually
							different knot forms are topologically the same knot, and that a
							few can be converted into one another without untying.
						</>
					}
				>
					<div className="reader-pair">
						<CordReader cord={p11} colors={colors} title="UR267A p11" />
						<CordReader cord={p13} colors={colors} title="UR267A p13" />
					</div>
				</Wide>
			</Step>

			<Step n={3} title="Read the group">
				<Prose>
					<p>
						Pendants 11, 12 and 13 hang together as a group. The first cord is
						white and reads 206. The second is white and reads 15. The third is
						mottled brown and reads 191. 206 − 15 = 191. The next group does the
						same, 238 − 15 = 223; in the one after, the third cord is broken off
						at 4.5 cm; and the fourth group of this excerpt does not balance as
						recorded — 160, 15, 239.
					</p>
					<p>
						Colour follows role only in part. The total is white in all 26
						groups. The 15 is white in 19 and light brown in 6. The remainder is
						mottled only in groups 1–13, 10 of the 26; after that it is light
						brown or white. White marks the head of a group whether or not the
						group balances.
					</p>
					<p>
						Click a cord to see how much of its reading is observation, how much
						is arithmetic, and how much is interpretation.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Groups 5–8 of UR267A, one at a time, with the arithmetic written
							over each. Click a cord; the panel separates the layers of its
							reading.
						</>
					}
				>
					<div className="story-split">
						<ReadGroupStage
							khipu={a}
							fixed={15}
							colors={colors}
							selected={selected}
							onSelect={setSelected}
						/>
						<Layers
							heading={
								selected ? (
									<>
										Cord <strong>{selected}</strong> of UR267A
									</>
								) : (
									"Select a cord"
								)
							}
							layers={
								selected
									? explainInkawasi(a, selected, 15, "chili peppers", colors)
									: []
							}
						/>
					</div>
				</Wide>
			</Step>

			<Step n={4} title="Every group does it">
				<Prose>
					<p>
						UR267A has {statsA.groups} groups. {statsA.withFixed} of them carry
						the value 15. In {statsA.balances} the first cord equals 15 plus the
						rest exactly; in {statsA.damaged} a cord is broken off above its
						units position, so the sum cannot be checked; {statsA.fails} do not
						balance as recorded.
					</p>
					<p>
						Urton and Chu found the same pattern across the storeroom: the two
						khipus tied together as UR267A and UR267B, from a chili-pepper
						deposit, deduct 15 and 10; the peanut khipus UR275 and UR268 deduct
						47 and 208. The fixed value is about two per cent of a typical
						deposit on three of them and eleven per cent on the fourth.{" "}
						<Conf level="firm">Fixed value in every group</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The whole of UR267A read group by group, each marked as it passes:
							✓ balances, … a cord is broken, ✗ does not balance as recorded.
							The buttons on the right light one role at a time.
						</>
					}
				>
					<LedgerWalkStage
						khipu={a}
						fixed={15}
						colors={colors}
						alias="UR267A"
					/>
				</Wide>
				<Wide
					caption={
						<>
							The same reading as a table. Chips carry the cord's colour; a
							dotted chip is a cord too short to hold its lowest knots.
						</>
					}
				>
					<LedgerTable khipu={a} fixed={15} colors={colors} />
				</Wide>
				<Prose>
					<p>
						UR268, the peanut ledger, does the same with larger numbers and more
						cords per group. The first group's white cord reads 13,328; then a
						dark-brown cord holds the fixed value; then four more cords account
						for what is left. Colour tracks role here more closely: the fixed
						cord is dark brown <code>NB</code> in 14 of the 19 groups that hold
						208 and white-and-dark-brown in three more, the total is white or
						light brown, and through the first half of the khipu the last
						remainder is mottled white-and-brown.
					</p>
					<p>
						One correction applies to this table. Urton and Chu publish the
						first group as 13,328 = 208 + 1,450 + 2,174 + 1,935 + 7,561, which
						balances exactly; the Field Guide record has the fixed cord as 200,
						missing a damaged units knot, so the group shows here as eight
						short.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							UR268 with one role lit at a time. The counts are taken from the
							record, not the publication.
						</>
					}
				>
					<GrammarStage
						khipu={peanuts}
						fixed={208}
						colors={colors}
						alias="UR268"
					/>
				</Wide>
				<Wide caption="The first fourteen groups of UR268 (peanuts), fixed value 208.">
					<LedgerTable khipu={peanuts} fixed={208} colors={colors} limit={14} />
				</Wide>
			</Step>

			<Step n={5} title="The same numbers, twice">
				<Prose>
					<p>
						UR255 is a khipu of plain brown cords found nearby. It records the
						same totals as UR267A, group for group. Where UR267A has{" "}
						<em>total, 15, remainder</em>, UR255 has{" "}
						<em>total, remainder, 15</em>. In 13 of UR255's first 16 groups, and
						two later ones, the middle cord is full-length but unknotted: the
						total and the 15 are recorded, the remainder is not.
					</p>
					<p>
						Clindaniel reads the pairs as the two sides of an account, one khipu
						showing what was deducted and the other what remained, and the
						tied-together pairs as a way of filing related records. The
						chili-pepper and peanut ledgers each have such a mirror.{" "}
						<Conf level="firm">Shared values</Conf>{" "}
						<Conf level="open">Debit and credit</Conf>
					</p>
					<p>
						Three readings of the same groups have been proposed, and for a
						three-cord group the arithmetic cannot tell them apart: a = b + c
						and a − b = c are the same statement. Urton and Chu read a total
						less a fixed deduction. Clindaniel reads light minus dark equals
						mottled. Medrano and Khosla (2024) read UR267A's first group, 106,
						15, 91, as 106 = 15 + 91, with white marking the sum. Against that
						last reading, the plain-brown mirrors UR255 and UR256 balance with
						no white cord at all, and on the khipus that carry a fixed value a
						white cord heads unbalanced groups about as often as balanced ones
						(76 of 104 balanced, 73 of 111 unbalanced).{" "}
						<Conf level="open">White as a sum marker: not supported</Conf>
					</p>
					<p>
						Three things do separate the readings. The fixed value sits in the
						same slot group after group, which only the deduction reading
						predicts. Where a cord is mottled it is the last remainder, not the
						total. And UR255 leaves the remainder untied, never the total or the
						15, which is the order a deduction would be worked in: total first,
						levy next, remainder last. <Conf level="firm">Fixed slot</Conf>{" "}
						<Conf level="likely">Deduction order</Conf> Whether the pairs are
						debit and credit stays open.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							UR267A above, UR255 hung upside-down beneath it so the cords meet
							tip to tip. A line joins two cords that hold the same value.
						</>
					}
				>
					<MirrorStage
						a={a}
						b={mirror}
						fixed={15}
						colors={colors}
						aliasA="UR267A"
						aliasB="UR255"
					/>
				</Wide>
				<Wide
					caption={
						<>
							UR267A and UR255 group by group. Chips outlined in blue hold a
							value the other khipu also records; the fixed 15 is set in small
							capitals.
						</>
					}
				>
					<PairedLedger
						a={a}
						b={mirror}
						fixed={15}
						colors={colors}
						labelA="UR267A — total · 15 · remainder"
						labelB="UR255 — total · remainder · 15"
						to={28}
					/>
				</Wide>
				<Wide
					caption={
						<>
							All three mirrored pairs at full length, the ledger above and its
							mirror below. A thread joins two cords that hold the same value
							where the published pairing lays them side by side:{" "}
							{pairs
								.map(
									(p) =>
										`${p.alias} and ${p.mirrorAlias}, ${p.shared} shared values`,
								)
								.join("; ")}
							.
						</>
					}
				>
					<div className="mirror-shelf">
						{pairs.map((p) => (
							<div key={p.id} className="mirror-shelf-pair">
								<p className="mirror-shelf-label">
									<b>{p.alias}</b> ({p.produce}, fixed {p.fixed}) above,{" "}
									<b>{p.mirrorAlias}</b> below
								</p>
								<StrandWeave
									top={[p.id]}
									bottom={[p.mirror as string]}
									names={WEAVE_NAMES}
									variant="divider"
									caption={false}
								/>
							</div>
						))}
					</div>
				</Wide>
				<details className="ledger-details">
					<summary>The three pairs as a table</summary>
					<table className="ledger-table ledger-summary-table">
						<thead>
							<tr>
								<th>Ledger</th>
								<th>Found with</th>
								<th className="num">Fixed value</th>
								<th>Mirror</th>
								<th className="num">Shared values</th>
							</tr>
						</thead>
						<tbody>
							{pairs.map((p) => (
								<tr key={p.id}>
									<td>
										<Link to="/khipus/$id" params={{ id: p.id }}>
											{p.alias}
										</Link>{" "}
										<span className="muted">({p.groupsX} groups)</span>
									</td>
									<td>{p.produce}</td>
									<td className="num">{p.fixed}</td>
									<td>
										<Link to="/khipus/$id" params={{ id: p.mirror as string }}>
											{p.mirrorAlias}
										</Link>{" "}
										<span className="muted">({p.groupsY} groups)</span>
									</td>
									<td className="num">{p.shared}</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			</Step>

			<Step n={6} title="What the numbers were for">
				<Prose>
					<p>
						Beyond the arithmetic, the reading is interpretation. The sequence
						the archaeology supports is: produce arrives at the storehouse and
						is measured into standard units, a khipukamayuq ties a total, a
						fixed amount is set apart, the rest is accounted for, and a second
						khipu restates the account. Urton and Chu call the fixed amount a
						tax, a levy on each deposit to support the storehouse's staff, and
						propose it as the first evidence of taxation on goods in the empire.
						Sabine Hyland points to colonial haciendas that set aside a fixed
						quantity of each harvest as seed, and reads the same cords as seed
						grain. The khipus do not settle it.
					</p>
					<p>
						Nor do they say what unit 206 counts. The storeroom floors are
						marked into grids of small squares — some 3,500 per room — that Chu
						takes to be counting units, but no cord has been matched to a pile.
					</p>
				</Prose>
				<Wide>
					<Layers
						heading="The whole reading, layer by layer"
						layers={[
							{
								title: "Observed",
								body: "Knot types, turns and positions on each cord; cord colours; the grouping of cords along the primary cord; the khipus' positions in the storeroom under chili peppers, peanuts and black beans.",
								level: "firm",
							},
							{
								title: "Derived",
								body: "Each cord's decimal value; in each group, first cord = fixed value + the rest; the fixed values 15, 10, 47 and 208; the same totals recurring on a second khipu in a different order.",
								level: "firm",
							},
							{
								title: "Context",
								body: "An imperial storehouse at a military staging post; produce measured into gridded storage floors; two khipus tied together as one record.",
								level: "likely",
							},
							{
								title: "Interpretation",
								body: "The fixed value may be a deduction from each deposit: a tax to feed the facility (Urton & Chu) or seed kept back for planting (Hyland). Paired khipus may be debit and credit (Clindaniel). What unit a cord counts, and which deposit it belongs to, are unknown.",
								level: "open",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={7} title="The rest of the archive">
				<Prose>
					<p>
						The four ledgers and their mirrors are a fifth of the archive. The
						rest ranges from ten-cord tallies of ones and twos to UR269, with
						289 pendants, and UR257, ten cords whose values run to 98,718. The
						Sector B khipus, found in 2016, carry the largest numbers and have
						been proposed as a longer-term archive of the site's operation
						rather than its running accounts. Medrano and Khosla (2024) find sum
						relations on 10 of the 23 and read them instead as working khipus.
						But shuffling each khipu's own values gives the same 10 (95% of
						1,000 shuffles fall between 8 and 13), and Sector B shares no run of
						values with the storeroom, only a scatter of isolated three-digit
						numbers on two of its khipus.{" "}
						<Conf level="open">Archive or working khipus</Conf>
					</p>
					<p>
						The ledgers are also tied to the rest of the storeroom by value.
						UR278’s group totals are, in order, the first cords of UR266’s
						groups, and UR270’s totals head groups of UR274B: totals carried
						from one khipu to another. That reading is ours, not yet reviewed,
						and is set out in{" "}
						<Link to="/stories/totals-that-travel">Totals that travel</Link>.
						One link is still unread: UR262 and UR270 share 61 values, and what
						relates them is not known. It is drawn dashed below.{" "}
						<Conf level="open">UR262 and UR270</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							How the storeroom khipus connect, from the links curated on the{" "}
							<Link to="/network">network map</Link> (scan-only pairs left out).
							Arrows run from the record whose figures reappear to the record
							that restates them; dashed links are open. Khipus with no link are
							not drawn.
						</>
					}
				>
					<div className="network-page story-island">
						<IslandFlow
							island={storehouse}
							silhouettes={silhouettes}
							colors={colors}
							selected={flowSel}
							onSelect={setFlowSel}
							embedded
						/>
					</div>
				</Wide>
				<Prose>
					<p>
						Each khipu can be opened from the grid in step 1 and its arithmetic
						checked against the record.
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "Gary Urton & Alejandro Chu",
						what: "Accounting in the King's Storehouse: The Inkawasi Khipu Archive",
						where: "Latin American Antiquity 26(4), 2015",
						href: "https://www.researchgate.net/publication/288020164_Accounting_in_the_King's_Storehouse_The_Inkawasi_Khipu_Archive",
					},
					{
						who: "Gary Urton & Alejandro Chu",
						what: "The Invention of Taxation in the Inka Empire",
						where: "Latin American Antiquity 30(1), 2019",
						href: "https://www.cambridge.org/core/journals/latin-american-antiquity/article/abs/invention-of-taxation-in-the-inka-empire/FE7429EFCD62AA2F37B22BB22D5BF250",
					},
					{
						who: "Jon Clindaniel",
						what: "Toward a Grammar of the Inka Khipu: Investigating the Production of Non-numerical Signs",
						where:
							"PhD dissertation, Harvard University, 2019 — chapter 4 on the Inkawasi pairs",
						href: "https://dash.harvard.edu/handle/1/42029631",
					},
					{
						who: "Manuel Medrano",
						what: "Knot Just Numbers: Mathematics and More in Andean Khipu Strings",
						where: "Gresham College / BSHM lecture, 2021",
						href: "https://www.gresham.ac.uk/sites/default/files/transcript/2021-10-20-1600_MEDRANO_BSHM-T.pdf",
					},
					{
						who: "Bruce Bower",
						what: "Knotted cords may be the first evidence that Incas taxed goods",
						where: "Science News, 2019 — including Hyland's seed reading",
						href: "https://www.sciencenews.org/article/khipus-knotted-cords-incas-taxes",
					},
					{
						who: "Manuel Medrano & Ashok Khosla",
						what: "How Can Data Science Contribute to Understanding the Khipu Code?",
						where:
							"Latin American Antiquity, 2024 — white as the sum cord at Inkawasi, and Sector B; data and code on Zenodo (10.5281/zenodo.10472429)",
						href: "https://doi.org/10.1017/laq.2024.5",
					},
					{
						who: "Mackinley FitzPatrick",
						what: "Knot Tricks: What Mathematical Knot Theory Can Reveal about the Structure of Khipu Knot Encoding",
						where: "Latin American Antiquity 37(2), 2026",
						href: "https://www.cambridge.org/core/journals/latin-american-antiquity/article/abs/knot-tricks-what-mathematical-knot-theory-can-reveal-about-the-structure-of-khipu-knot-encoding/41EA129948DF7555A99F4B11E57C30F5",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("AB", colors), label: "AB light brown" },
					{ color: hexFor("MB", colors), label: "MB moderate brown" },
					{ color: hexFor("NB", colors), label: "NB dark brown" },
				]}
			/>
		</StoryPage>
	);
}

/** The four layers for one cord of an Inkawasi ledger. */
function explainInkawasi(
	khipu: Khipu,
	name: string,
	fixed: number,
	produce: string,
	colors: ReturnType<typeof Route.useLoaderData>["colors"],
): Layer[] {
	const cord = khipu.cords.find((c) => c.name === name);
	if (!cord) return [];
	const groups = pendantGroups(khipu);
	const gi = groups.findIndex((g) => g.some((c) => c.name === name));
	const group = groups[gi] ?? [];
	const pos = group.findIndex((c) => c.name === name);
	const vals = group.map((c) => c.value ?? 0);
	const role =
		pos === 0
			? "the first cord, read as the group's total"
			: cord.value === fixed
				? `the cord carrying the fixed value ${fixed}`
				: "a remainder cord";
	const balances =
		vals.length >= 3 && vals[0] === vals.slice(1).reduce((x, y) => x + y, 0);
	const code = cord.colorParsed?.[0]?.codes.join("/") ?? "—";
	const hex = hexFor(cord.colorParsed?.[0]?.codes[0], colors);
	return [
		{
			title: "Observed",
			body: (
				<>
					Colour <code>{cord.color ?? "—"}</code>{" "}
					<i className="swatch-inline" style={{ background: hex }} /> ({code}
					), {cord.length ?? "?"} cm long, attached{" "}
					{cord.attach === "V" ? "verso" : cord.attach === "R" ? "recto" : "—"},{" "}
					{cord.twist ?? "?"}-twist.{" "}
					{cord.knots.length
						? cord.knots
								.map(
									(k) =>
										`${k.n} ${k.type === "L" ? "turns, long knot" : k.type === "E" ? "figure-eight" : k.type === "SP" ? "turns, spiral" : "single"} at ${k.pos} cm`,
								)
								.join("; ")
						: "No knots."}
					{isTruncated(cord) ? " Cord truncated." : ""}
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					Value <strong>{cord.value?.toLocaleString() ?? "—"}</strong>. Cord{" "}
					{pos + 1} of {group.length} in group {gi + 1}: {role}. Group reads{" "}
					{vals.join(" · ")}
					{balances
						? ` — the first equals the rest (${vals[0]} = ${vals.slice(1).join(" + ")}).`
						: group.some(isTruncated)
							? " — cannot be checked, a cord is truncated."
							: " — does not balance as recorded."}
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: `Excavated in Sector A of the Inkawasi storehouse; UR267A was tied to UR267B and associated with ${produce}. The fixed value ${fixed} recurs across the khipu and appears again on UR255.`,
			level: "likely",
		},
		{
			title: "Interpretation",
			body:
				pos === 0
					? "A deposit's total, in an unknown unit of chili peppers."
					: cord.value === fixed
						? "Possibly a standard deduction from the deposit: a levy for the storehouse (Urton & Chu) or seed set aside (Hyland)."
						: "What remained of the deposit after the deduction.",
			level: "open",
		},
	];
}
