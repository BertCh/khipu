import { createFileRoute, Link } from "@tanstack/react-router";
import "#/styles/cards.css";
import { StatTile } from "#/components/charts/Figure";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import CollataCords from "#/components/story/CollataCords";
import ResearchInstrument from "#/components/story/ResearchInstrument";
import { Conf } from "#/components/story/Story";
import StrandWeave, {
	type StrandWeaveProps,
} from "#/components/story/StrandWeave";
import {
	getCodes,
	getColors,
	getCorpus,
	getKhipuIndex,
	getKhipus,
	getSilhouettes,
	readJson,
} from "#/lib/khipu/data";
import { KHIPU_A_END } from "#/lib/stories/collata";
import {
	BROWN_COPY_ID,
	BROWN_SOURCE_ID,
	ROUNDED_COPY_ID,
	ROUNDED_SOURCE_ID,
	SIX_COPY_ID,
	SIX_SOURCE_ID,
} from "#/lib/stories/crosslinks";
import type { ScanFile } from "#/lib/stories/links";
import {
	countWord,
	networkSummary,
	useStoryCount,
} from "#/lib/stories/networkSummary";
import { MATCH_KINDS, type StrandThread } from "#/lib/stories/strands";

const SANTA = ["KH0323", "KH0324", "KH0325", "KH0326", "KH0327", "KH0328"];
const TWIN_FALLS_HERO = "KH0699";
const COLOUR_WITHOUT_NUMBERS_HERO = "KH0135";
const NON_DECIMAL_HERO = "KH0100";
const PROPORTIONAL_TEMPLATE = ["KH0028", "KH0027"];
const COUNTING_TO_TWO = ["KH0034", "KH0670"];
const MIRROR_LEDGER_HERO = "KH0081";
const KNOT_DIRECTION = ["KH0285", "KH0450"];
const BIG_NUMBER = ["KH0698", "KH0454", "KH0457"];
const CHANCE = ["KH0698", "KH0081"];
const INSTRUMENT_IDS = [NON_DECIMAL_HERO, "KH0081", "KH0192", "KH0470"];

/**
 * The link stories' card art: the two khipus woven by the threads
 * strands.json lays between them. A card is a teaser, so it draws only the
 * threads that carry a value across (exact, near, sum, scaled); the story
 * itself shows the fields that differ, drop or sit blank on both sides.
 */
const matchesOnly: NonNullable<StrandWeaveProps["emphasis"]> = (
	t: StrandThread,
) => (MATCH_KINDS.has(t.kind) ? undefined : "hidden");
/** the same, drawn bold: for pairs of mostly undyed (white) cords, whose
 * threads would otherwise vanish into the card's ground */
const matchesBold: NonNullable<StrandWeaveProps["emphasis"]> = (
	t: StrandThread,
) => (MATCH_KINDS.has(t.kind) ? "strong" : "hidden");

type CardWeaveProps = Pick<
	StrandWeaveProps,
	"top" | "bottom" | "spliced" | "window" | "reversed"
> & { bold?: boolean };

function CardWeave({ bold, ...props }: CardWeaveProps) {
	return (
		<div className="story-card-art story-card-art-weave">
			<StrandWeave
				{...props}
				variant="inline"
				interactive={false}
				caption={false}
				reveal={false}
				emphasis={bold ? matchesBold : matchesOnly}
				inset={false}
				className="story-card-weave"
			/>
		</div>
	);
}

/** The Leymebamba passage (Urton, published): UR006 p277–p292 above, the
 * run of UR021 that repeats it below. UR009 holds it too, reversed; one
 * weave cannot lay both under the same cords, so it is named, not drawn. */
const ARCHIVE_TOP = ["KH0242"];
const ARCHIVE_BOTTOM = ["KH0257"];
const ARCHIVE_WINDOW = { id: "KH0242", from: 266, to: 302 };

export const Route = createFileRoute("/stories/")({
	loader: async () => {
		const [corpus, colors, codes, index, silhouettes, instruments, scan] =
			await Promise.all([
				getCorpus(),
				getColors(),
				getCodes(),
				getKhipuIndex(),
				getSilhouettes(),
				getKhipus(INSTRUMENT_IDS),
				readJson<ScanFile>("stories/links.json").catch(() => null),
			]);
		const pick = (id: string) => {
			const s = silhouettes[id];
			const row = index.find((k) => k.id === id);
			return {
				id,
				alias: row?.aliases[0] ?? id,
				cords: s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [],
			};
		};
		return {
			corpus,
			colors,
			codes,
			instruments,
			network: scan ? networkSummary(index, scan) : null,
			santa: SANTA.map(pick),
			twinFalls: pick(TWIN_FALLS_HERO),
			colourWithoutNumbers: pick(COLOUR_WITHOUT_NUMBERS_HERO),
			nonDecimal: pick(NON_DECIMAL_HERO),
			proportionalTemplate: PROPORTIONAL_TEMPLATE.map(pick),
			countingToTwo: COUNTING_TO_TWO.map(pick),
			mirrorLedger: pick(MIRROR_LEDGER_HERO),
			knotDirection: KNOT_DIRECTION.map(pick),
			bigNumber: BIG_NUMBER.map(pick),
			chance: CHANCE.map(pick),
		};
	},
	head: () => ({ meta: [{ title: "Stories — Khipu" }] }),
	component: Stories,
});

function Stories() {
	const {
		corpus,
		colors,
		codes,
		instruments,
		network,
		santa,
		twinFalls,
		colourWithoutNumbers,
		nonDecimal,
		proportionalTemplate,
		countingToTwo,
		mirrorLedger,
		knotDirection,
		bigNumber,
		chance,
	} = Route.useLoaderData();
	const nStories = useStoryCount();
	const attachRecorded = (corpus.attach.R ?? 0) + (corpus.attach.V ?? 0);
	// valueMagnitude counts every cord with a non-zero value, by digit count
	const valued = Object.values(corpus.valueMagnitude).reduce(
		(a, b) => a + b,
		0,
	);
	return (
		<main className="page-wrap">
			<h1 className="page-title">Stories</h1>
			<p className="lede">
				{countWord(nStories, true)} case studies of individual khipus and groups
				of khipus. Some summarize published research; others are this
				project&rsquo;s own readings. Each separates what the cords show from
				what remains open.
			</p>

			{instruments[NON_DECIMAL_HERO] &&
				instruments.KH0081 &&
				instruments.KH0192 &&
				instruments.KH0470 && (
					<ResearchInstrument
						material={instruments[NON_DECIMAL_HERO]}
						arithmetic={instruments.KH0081}
						account={instruments.KH0192}
						copy={instruments.KH0470}
						colors={colors}
						codes={codes}
					/>
				)}

			<section className="research-overview" aria-labelledby="research-heading">
				<div className="research-overview-head">
					<p className="eyebrow">Using the corpus</p>
					<h2 id="research-heading">Findings across the stories</h2>
					<p>
						With {corpus.nKhipus} khipus, {corpus.nCords.toLocaleString()} cords
						and {corpus.nKnots.toLocaleString()} knots in one format, the
						arithmetic within a khipu can be tested and repeated passages found
						across museums. This is not a decipherment.
					</p>
				</div>
				<div className="research-findings">
					<article>
						<span>01</span>
						<h3>Some accounts exist in two versions</h3>
						<p>
							Urton published several matched pairs; this project found more,
							some now in different museums, with the same values in different
							colours and layouts. In one Berlin pair, the summary cords on one
							khipu match the other&rsquo;s figures more often than its own.
						</p>
					</article>
					<article>
						<span>02</span>
						<h3>Arithmetic suggests working accounts</h3>
						<p>
							Repeated deductions at Inkawasi (Urton and Chu) and, in this
							project&rsquo;s readings, nested totals and fixed quotas suggest
							some khipus recorded accounts being summarized or updated, not
							only final quantities.
						</p>
					</article>
					<article>
						<span>03</span>
						<h3>Shared values link separated khipus</h3>
						<p>
							In this project&rsquo;s scans, exact runs of values in the same
							order link khipus now held apart, point to accounts that appear
							derived from others, and suggest where the Basel fragments belong.
						</p>
						{network && (
							<p className="research-baseline">
								Runs of six or more: <b>{network.baseline.observed}</b> pairs
								found, <b>{network.baseline.shuffled}</b> expected by chance
								(mean of {network.baseline.shuffles} shuffled corpora).
							</p>
						)}
					</article>
					<article>
						<span>04</span>
						<h3>Not only knots carry information</h3>
						<p>
							Colour and position can mark fields in an account. Published work
							links how cords were tied to social categories (Santa valley) and
							proposes syllabic signs on knotless cords (Collata); the latter is
							unconfirmed.
						</p>
					</article>
				</div>
				<p className="research-caveat">
					The first three stories summarize published archaeological and
					ethnohistorical research. The rest are this project&rsquo;s own
					reproducible readings and cross-khipu links, which have not been peer
					reviewed.
				</p>
				<p className="research-caveat">
					A corpus-wide survey (September 2026) also found negative results:
					outside two Inkawasi chains (see{" "}
					<Link to="/stories/totals-that-travel">Totals that travel</Link>), no
					khipu&rsquo;s cords restate another&rsquo;s group totals; group-size
					forms and colour templates are not shared between khipus (values
					recur, forms do not); a pendant equals the sum of its subsidiaries
					barely more often than chance; no colour is reserved for the largest
					values; and cord length falls with value only because knots use up
					cord. The scripts for every screen, positive or negative, are in the
					repository. All the links between khipus in these stories are shown on
					one map in <Link to="/network">the network view</Link>.
				</p>
			</section>

			<h2 className="story-list-heading">Historical anchors</h2>
			<p className="story-list-dek">
				Three published cases where khipus survive with context: an excavated
				storehouse, a Spanish census and a village archive.
			</p>
			<div className="story-cards">
				<Link to="/stories/inkawasi" className="story-card">
					<CardWeave top={["KH0503"]} bottom={["KH0491"]} />
					<div className="story-card-body">
						<span className="story-card-kicker">Inkawasi, Cañete valley</span>
						<h2>Inkawasi storehouse accounts</h2>
						<p>
							Khipus excavated under stored chili peppers and peanuts subtract
							the same number repeatedly. A second set records the same sums
							from the other side.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Arithmetic checks</Conf>
							<Conf level="open">Meaning of the deduction</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/santa-valley" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{santa.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={20}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Santa valley, 1670</span>
						<h2>Six khipus and a census</h2>
						<p>
							133 groups of six cords and a Spanish tax census of 132
							tributaries in six lineages. If both describe the same people, the
							way each group is tied may mark which half of the community a man
							belonged to.
						</p>
						<span className="story-card-foot">
							<Conf level="likely">Document match</Conf>
							<Conf level="open">Names from colours</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/collata" className="story-card">
					<div className="story-card-art">
						<CollataCords
							cords={KHIPU_A_END}
							title="The last three cords of Collata khipu A"
							slot={56}
							len={60}
						/>
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Collata, Huarochirí</span>
						<h2>Two khipus from Collata</h2>
						<p>
							Two knotless eighteenth-century khipus that their village
							identifies as letters. Fibre, dye and twist give 95 cord types,
							and Hyland proposes that the last three cords spell a name.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Community identification</Conf>
							<Conf level="open">Syllabic reading</Conf>
						</span>
					</div>
				</Link>
			</div>

			<h2 className="story-list-heading">New readings from the corpus</h2>
			<p className="story-list-dek">
				This project&rsquo;s readings, from arithmetic checks within khipus and
				value matches between them. Not peer reviewed.
			</p>
			<div className="story-cards">
				<Link to="/stories/twin-falls" className="story-card">
					<div className="story-card-art">
						<KhipuSilhouette
							cords={twinFalls.cords}
							colors={colors}
							width={300}
							height={64}
						/>
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Twin Falls, Idaho</span>
						<h2>A ledger that checks itself</h2>
						<p>
							An unpublished khipu in a college museum has a grand total, six
							unit sums and six groups of entries that add up to them. Six units
							are assessed at exactly 200.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Sums verified</Conf>
							<Conf level="open">Quota account near Lima</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/tied-twice" className="story-card">
					<CardWeave
						top={["KH0192"]}
						bottom={["KH0470", "KH0469"]}
						spliced="bottom"
					/>
					<div className="story-card-body">
						<span className="story-card-kicker">Berlin</span>
						<h2>An account tied twice</h2>
						<p>
							Two Berlin khipus catalogued from sites 150 km apart carry the
							same numbers, in groups of five on one and six on the other. The
							summary on the first fits the second&rsquo;s figures better than
							its own.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Field-for-field match</Conf>
							<Conf level="open">One archive, two find-spots</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/tied-in-two-cities" className="story-card">
					<CardWeave top={["KH0097"]} bottom={["KH0586"]} bold />
					<div className="story-card-body">
						<span className="story-card-kicker">Paris ↔ Lima</span>
						<h2>One account, tied in two cities</h2>
						<p>
							A khipu in Paris and one in Lima open with fifteen four-digit
							totals in the same order (thirteen exact, two off by a register),
							in different colours and layouts.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">13/15 totals</Conf>
							<Conf level="open">What the units are</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/rounded-copy" className="story-card">
					<CardWeave top={[ROUNDED_SOURCE_ID]} bottom={[ROUNDED_COPY_ID]} />
					<div className="story-card-body">
						<span className="story-card-kicker">Lima ↔ Gothenburg</span>
						<h2>The account that was rounded</h2>
						<p>
							Four 18-field tables survive in two forms: one detailed, one
							selectively blanked and rounded. Thirty-eight of 72 fields remain
							exact.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">72-field alignment</Conf>
							<Conf level="likely">Derivative account</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/pachacamac-fragment" className="story-card">
					<CardWeave top={["KH0450"]} bottom={["KH0689"]} />
					<div className="story-card-body">
						<span className="story-card-kicker">Pachacamac ↔ Basel</span>
						<h2>The fragments between two archives</h2>
						<p>
							Ten fragments in Basel each carry values matching a brown group on
							one Berlin khipu and a white group on another. The two Berlin
							khipus appear to list the same fourteen units in opposite order.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Unit rule 3/3</Conf>
							<Conf level="likely">Reconstruction</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/brown-eight" className="story-card">
					<CardWeave top={[BROWN_SOURCE_ID]} bottom={[BROWN_COPY_ID]} />
					<div className="story-card-body">
						<span className="story-card-kicker">Miami ↔ Dallas</span>
						<h2>Eight brown cords</h2>
						<p>
							A brown group on one khipu reappears inside a group on another,
							with the same eight values, order, colour and knot types.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">8/8 exact</Conf>
							<Conf level="open">Shared central-coast archive</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/six-fields" className="story-card">
					<CardWeave top={[SIX_SOURCE_ID]} bottom={[SIX_COPY_ID]} />
					<div className="story-card-body">
						<span className="story-card-kicker">Gothenburg ↔ Dallas</span>
						<h2>Six numbers, retied</h2>
						<p>
							A blue-white group and a yellow group carry the same six nonzero
							values while colour, attachment and knot height all change.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">6/6 exact</Conf>
							<Conf level="open">Shared source account</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/colour-without-numbers" className="story-card">
					<div className="story-card-art">
						<KhipuSilhouette
							cords={colourWithoutNumbers.cords}
							colors={colors}
							width={300}
							height={64}
						/>
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Berlin, from Pachacamac</span>
						<h2>Colour without numbers</h2>
						<p>
							A nearly knotless khipu has seventy white–brown–white slots and
							seventy matching cords. Only one block carries values.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Colour template</Conf>
							<Conf level="open">Purpose of the form</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/knots-that-are-not-decimal" className="story-card">
					<div className="story-card-art">
						<KhipuSilhouette
							cords={nonDecimal.cords}
							colors={colors}
							width={300}
							height={64}
						/>
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Munich</span>
						<h2>Knots that are not decimal</h2>
						<p>
							Half the knotted cords break the usual decimal knot rules. The
							database values come from a mechanical rule; what the knots record
							is unknown.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Decimal grammar tested</Conf>
							<Conf level="open">What the marks count</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/proportional-template" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{proportionalTemplate.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={s.id === PROPORTIONAL_TEMPLATE[0] ? 54 : 30}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Philadelphia</span>
						<h2>One shape at five scales</h2>
						<p>
							Seven groups repeat one proportional pattern at different
							magnitudes, with three fixed positions at half weight.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Template verified</Conf>
							<Conf level="open">What the ratio measures</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/counting-to-two" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{countingToTwo.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={s.id === COUNTING_TO_TWO[0] ? 48 : 38}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Nazca ↔ no provenance</span>
						<h2>Counting to two</h2>
						<p>
							Two large khipus record almost only 0, 1 and 2, arranged in fixed
							templates by column on one and by row on the other.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Templates tested</Conf>
							<Conf level="open">What was counted</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/mirror-ledger" className="story-card">
					<div className="story-card-art">
						<KhipuSilhouette
							cords={mirrorLedger.cords}
							colors={colors}
							width={300}
							height={64}
						/>
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">Cacatilla, Nazca valley</span>
						<h2>One form, kept twice</h2>
						<p>
							An opening group of large values holds the column sums of the
							groups that follow: three exactly, a fourth if one knot is read as
							Urton reads it.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Three column sums</Conf>
							<Conf level="open">What the summary tier totals</Conf>
						</span>
					</div>
				</Link>
				<Link to="/stories/totals-that-travel" className="story-card">
					<CardWeave top={["KH0517"]} bottom={["KH0502"]} />
					<div className="story-card-body">
						<span className="story-card-kicker">
							Deep analysis, all 684 khipus
						</span>
						<h2>Totals that travel</h2>
						<p>
							Eight corpus searches, each independently re-checked. At Inkawasi
							one khipu&rsquo;s group totals head another&rsquo;s groups eleven
							times in order.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">16 links</Conf>
							<Conf level="open">Which record came first</Conf>
						</span>
					</div>
				</Link>
			</div>

			{network && (
				<Link to="/network" className="archive-band">
					<div className="archive-band-body">
						<span className="story-card-kicker">
							{network.khipus} khipus · {network.links} links ·{" "}
							{network.islands} islands
						</span>
						<h2>The connected archive</h2>
						<p>
							Every link these stories read, and every pair the scan found
							sharing a run of six or more values, on one map.{" "}
							{network.crossMuseum} of the links join khipus now held in
							different museums.
						</p>
						<span className="archive-band-more">Open the network →</span>
					</div>
					<div className="archive-band-art">
						<StrandWeave
							top={ARCHIVE_TOP}
							bottom={ARCHIVE_BOTTOM}
							variant="divider"
							interactive={false}
							caption={false}
							window={ARCHIVE_WINDOW}
							inset={false}
						/>
						<p className="archive-band-caption">
							Drawn: a passage of Leymebamba UR006 (above) repeated on UR021
							(below). UR009 holds it a third time, reversed. Published by
							Urton.
						</p>
					</div>
				</Link>
			)}

			<h2 className="story-list-heading">The grammar of the corpus</h2>
			<p className="story-list-dek">
				Three corpus-wide counts: which way knots turn, where a group puts its
				largest value, and how many sums chance alone would give.
			</p>
			<div className="story-cards">
				<Link to="/stories/which-way-the-knot" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{knotDirection.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={s.id === KNOT_DIRECTION[0] ? 44 : 32}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">684 khipus</span>
						<h2>Which way the knot turns</h2>
						<p>
							Knot direction (S or Z) has been proposed as a binary sign. In 94
							of the 166 khipus that mix directions, it follows from knot type
							alone.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Corpus count</Conf>
							<Conf level="open">Coding in the residual</Conf>
						</span>
					</div>
				</Link>

				<Link to="/stories/where-the-big-number-sits" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{bigNumber.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={s.id === BIG_NUMBER[0] ? 40 : 24}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">684 khipus</span>
						<h2>Where the big number sits</h2>
						<p>
							In eighty fixed-size templates the largest value sits in a
							consistent slot, first or inside and last in only five. A third of
							all values end in zero.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Slot counts</Conf>
							<Conf level="likely">Big number first</Conf>
						</span>
					</div>
				</Link>
				<Link to="/stories/what-chance-can-do" className="story-card">
					<div className="story-card-art story-card-art-stack">
						{chance.map((s) => (
							<KhipuSilhouette
								key={s.id}
								cords={s.cords}
								colors={colors}
								width={300}
								height={s.id === CHANCE[0] ? 40 : 28}
							/>
						))}
					</div>
					<div className="story-card-body">
						<span className="story-card-kicker">
							A re-check of Medrano &amp; Khosla
						</span>
						<h2>What chance can do</h2>
						<p>
							Sum relations appear on three quarters of khipus, and on almost as
							many shuffled copies. Sums beside their parts, top-cord totals and
							about forty khipus beat chance.
						</p>
						<span className="story-card-foot">
							<Conf level="firm">Shuffle test</Conf>
							<Conf level="likely">Handedness from magnitude</Conf>
						</span>
					</div>
				</Link>
			</div>

			<section className="section">
				<h2>What remains unread</h2>
				<p className="prose">
					Many decimal values can be read, but not every knot is a number. What
					a colour, twist, attachment, group or blank cord meant is recorded on
					thousands of cords and understood in only a few contexts.
				</p>
				<div className="stats">
					<StatTile
						label="cords with a knotted value"
						value={`${Math.round((valued / corpus.nCords) * 100)}%`}
						hint={`${valued.toLocaleString()} of ${corpus.nCords.toLocaleString()}`}
					/>
					<StatTile
						label="attachment recorded recto or verso"
						value={attachRecorded.toLocaleString()}
						hint={`${corpus.attach.R?.toLocaleString()} recto, ${corpus.attach.V?.toLocaleString()} verso — an even split`}
					/>
					<StatTile
						label="cords with Z twist"
						value={corpus.twist.Z?.toLocaleString() ?? "0"}
						hint={`against ${corpus.twist.S?.toLocaleString()} S — cotton is almost always S`}
					/>
					<StatTile
						label="Ascher colour codes in use"
						value={Object.keys(corpus.colorCords).length}
						hint="a typical khipu uses five"
					/>
					<StatTile
						label="khipu sets matched to a document"
						value={1}
						hint="six Santa valley khipus, one census of 1670"
					/>
				</div>
				<p className="prose" style={{ marginTop: "1.25rem" }}>
					Many of the numbers can be read. What they counted, and what the rest
					of the cord encodes, mostly cannot.
				</p>
			</section>
		</main>
	);
}
