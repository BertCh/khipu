import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ComparisonTable,
	EvidenceDeck,
	PairedPassage,
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
import { getKhipus } from "#/lib/khipu/data";
import {
	BROWN_COPY_ID,
	BROWN_SOURCE_ID,
	brownEight,
} from "#/lib/stories/crosslinks";
import { groupSpan, l1Index } from "#/lib/stories/storyIsland";
import "#/styles/stories/pairs.css";

export const Route = createFileRoute("/stories/brown-eight")({
	loader: async () => {
		const khipus = await getKhipus([BROWN_SOURCE_ID, BROWN_COPY_ID]);
		return { a: khipus[BROWN_SOURCE_ID], b: khipus[BROWN_COPY_ID] };
	},
	head: () => ({ meta: [{ title: "Eight brown cords — Khipu" }] }),
	component: BrownEight,
});

const WEAVE_NAMES = {
	[BROWN_SOURCE_ID]: "KH0377 · UR137",
	[BROWN_COPY_ID]: "KH0590 · QU002",
};

function BrownEight() {
	const { a, b } = Route.useLoaderData();
	const rows = brownEight(a, b);
	const nA = l1Index(a).size;
	const nB = l1Index(b).size;
	// the brown run inside KH0377's first group: eight answered, then the ninth
	const ninth = groupSpan(a, 0).to - 1;
	const ninthValue =
		a.cords.find((c) => c.level === 1 && l1Index(a).get(c.name) === ninth)
			?.value ?? 0;
	const group2 = groupSpan(b, 1);
	return (
		<StoryPage
			kicker="KH0377 ↔ KH0590"
			title="Eight brown cords"
			standfirst={
				<>
					A group of eight brown cords on a Dallas khipu matches eight
					consecutive cords on a Miami khipu in colour, order and decimal
					values.
				</>
			}
			meta={
				<>
					<span>KH0377 · UR137 · Chancay, Lowe Art Museum</span>
					<span>
						KH0590 · QU002 · no recorded provenance, Dallas Museum of Art
					</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: "8/8",
						label: "values identical",
						note: "one uninterrupted run",
					},
					{ value: "brown", label: "colour retained", note: "on both objects" },
					{
						value: "V → R",
						label: "attachment changes",
						note: "suggests separate tying",
					},
					{
						value: "1",
						label: "extra source cord",
						note: "the trailing value 6",
					},
				]}
			/>
			<Step n={1} title="One group inside another">
				<Prose>
					<p>
						KH0377's first group begins with ten white cords and ends with nine
						brown ones. KH0590's second group consists of eight brown cords.
						Those eight equal the first eight brown cords in KH0377, position
						for position.
					</p>
					<p>
						The ninth brown cord on KH0377, valued 6, has no counterpart. On
						KH0590 the eight cords form a complete group.{" "}
						<Conf level="firm">Group boundary and colour</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Both objects whole, drawn at the same spacing per cord: KH0377's{" "}
							{nA} pendants above, KH0590's {nB} below. The eight threads join
							KH0377 pendants 11–18 to the whole of KH0590's group 2. KH0377's
							ninth brown cord (pendant {ninth + 1}, value {ninthValue}) has no
							thread.
						</>
					}
				>
					<StrandWeave
						top={[BROWN_SOURCE_ID]}
						bottom={[BROWN_COPY_ID]}
						names={WEAVE_NAMES}
						marks={[
							{
								id: BROWN_SOURCE_ID,
								from: ninth,
								to: ninth + 1,
								label: `ninth brown · ${ninthValue} · no counterpart`,
								tone: "key",
							},
							{
								id: BROWN_COPY_ID,
								from: group2.from,
								to: group2.to,
								label: "group 2, complete",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={2} title="Eight identical values">
				<Prose>
					<p>
						The sequence is 22, 24, 28, 12, 14, 14, 8, 1. Every decimal digit is
						represented by the same knot types. The attachments differ (verso on
						KH0377, recto on KH0590), as do some knot directions, so this is not
						a duplicated museum transcription.
					</p>
					<p>
						It appears to be the same figures tied on a separate object.{" "}
						<Conf level="firm">8/8 exact</Conf>
					</p>
				</Prose>
				<Wide>
					<PairedPassage
						left="KH0377 · inside group 1"
						right="KH0590 · complete group 2"
						leftValues={rows.map((field) => field.a)}
						rightValues={rows.map((field) => field.b)}
						leftTone="brown"
						rightTone="brown"
					/>
					<div className="pair-table">
						<ComparisonTable
							rows={rows}
							left="KH0377 p11–18"
							right="KH0590 group 2"
						/>
					</div>
				</Wide>
			</Step>

			<Step n={3} title="What eight fields can support">
				<Prose>
					<p>
						KH0377 is catalogued from Chancay; KH0590 has no recorded
						provenance. Shared colour, order and values make an archival
						relationship plausible, and offer a possible central-coast
						affiliation for KH0590. Eight fields cannot show whether one copied
						the other, both copied a third account, or the sequence was a
						standard category row.
					</p>
				</Prose>
				<Wide>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Eight adjacent brown cords on each object, with the same decimal values and knot types.",
								level: "firm",
							},
							{
								title: "Derived",
								body: "The complete KH0590 group equals positions 11–18 of KH0377's first group.",
								level: "firm",
							},
							{
								title: "Context",
								body: "KH0377 is attributed to Chancay; KH0590 lacks a provenance and is held in Dallas.",
								level: "firm",
							},
							{
								title: "Interpretation",
								body: "KH0590 may belong to the same central-coast administrative network as KH0377.",
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
						what: "KH0590 group structure and notes",
						where: "QU002",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/ascher_decreasing_group/html/KH0590.html",
					},
					{
						who: "This site",
						what: "Reproducible cross-khipu screen",
						where: "scripts/cross_khipu_analysis.py",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories/six-fields">
					Next: six numbers shared across two damaged records →
				</Link>
			</p>
		</StoryPage>
	);
}
