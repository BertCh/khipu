import { createFileRoute, Link } from "@tanstack/react-router";
import {
	EvidenceDeck,
	PairedPassage,
	TransformationMatrix,
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
	ROUNDED_COPY_ID,
	ROUNDED_SOURCE_ID,
	roundedAlignments,
	roundedExactPassage,
	roundedStats,
} from "#/lib/stories/crosslinks";
import { groupSpan } from "#/lib/stories/storyIsland";
import "#/styles/stories/pairs.css";

export const Route = createFileRoute("/stories/rounded-copy")({
	loader: async () => {
		const khipus = await getKhipus([ROUNDED_SOURCE_ID, ROUNDED_COPY_ID]);
		return { a: khipus[ROUNDED_SOURCE_ID], b: khipus[ROUNDED_COPY_ID] };
	},
	head: () => ({ meta: [{ title: "The account that was rounded — Khipu" }] }),
	component: RoundedCopy,
});

const WEAVE_NAMES = {
	[ROUNDED_SOURCE_ID]: "KH0049 · AS038",
	[ROUNDED_COPY_ID]: "KH0362 · UR122",
};

function RoundedCopy() {
	const { a, b } = Route.useLoaderData();
	const g4 = groupSpan(a, 3);
	const alignments = roundedAlignments(a, b);
	const stats = roundedStats(alignments);
	const passage = roundedExactPassage(a, b);

	return (
		<StoryPage
			kicker="KH0049 ↔ KH0362"
			title="The account that was rounded"
			standfirst={
				<>
					Two khipus in Lima and Gothenburg carry four 18-field tables in the
					same order. One has the figures in detail. The other leaves some
					fields blank and rounds others, but keeps enough exact values to align
					the two.
				</>
			}
			meta={
				<>
					<span>KH0049 · AS038 / HP036 · “Costa Sur”</span>
					<span>KH0362 · UR122 · Nazca</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: "72",
						label: "aligned fields",
						note: "four rows of eighteen",
					},
					{
						value: stats.exact,
						label: "exact values",
						note: `${stats.nonzeroWithinTwo}/${stats.nonzero} retained within 2%`,
					},
					{
						value: stats.blanked,
						label: "source values omitted",
						note: "left blank on KH0362",
					},
					{
						value: "12",
						label: "unbroken exact run",
						note: "crossing a group boundary",
					},
				]}
			/>
			<Step n={1} title="Two records, four corresponding tables">
				<Prose>
					<p>
						KH0049 has seven pendant groups; KH0362 has four. Comparing every
						equal-width group across the corpus gives one consistent mapping:
						KH0362's groups 1–4 line up with KH0049's groups 3, 5, 6 and 7.
						KH0049 group 4 has no counterpart.
					</p>
					<p>
						The objects are now on different continents; both are catalogued as
						from Peru's south coast.{" "}
						<Conf level="firm">Recorded structure</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The whole objects at one spacing per cord, KH0049 above. Each
							thread joins a KH0049 field to the KH0362 field the mapping sets
							under it: KH0362's four groups answer KH0049's groups 3, 5, 6 and
							7. Group 4's own cords have no thread; the threads passing beneath
							it belong to groups 3 and 5. Groups 1 and 2, at the left, fall
							outside the four tables. Solid threads are identical values,
							dashed ones within 2%; red dashes are changed values and grey dots
							end in a ring where KH0362 left the field blank. Only level-one
							pendants are compared; KH0049's many subsidiaries remain outside
							the count.
						</>
					}
				>
					<StrandWeave
						top={[ROUNDED_SOURCE_ID]}
						bottom={[ROUNDED_COPY_ID]}
						names={WEAVE_NAMES}
						marks={[
							{
								id: ROUNDED_SOURCE_ID,
								from: g4.from,
								to: g4.to,
								label: "group 4 · no counterpart",
								tone: "key",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step
				n={2}
				title={`${stats.exact} of ${stats.fields} fields are identical`}
			>
				<Prose>
					<p>
						Across the four aligned rows, {stats.exact} fields match exactly.
						KH0362 leaves {stats.blanked} populated KH0049 fields blank. Of the{" "}
						{stats.nonzero} fields it does retain, {stats.nonzeroExact} are
						exact and {stats.nonzeroWithinTwo} are within two percent. The
						closest row has 16 of 18 exact; its only changes are 1,605→1,615 and
						3,848→3,840.
					</p>
					<p>
						A shared preference for round numbers would not explain this: the
						match preserves field order, rare four-digit values and group
						boundaries. <Conf level="firm">Computed from the cords</Conf>
					</p>
				</Prose>
				<Wide caption="Read each row left to right. Exact fields form long blue runs; omissions open as grey gaps; small rounding changes are outlined.">
					<TransformationMatrix rows={alignments} />
				</Wide>
			</Step>

			<Step n={3} title="Twelve consecutive matching cords">
				<Prose>
					<p>
						The longest passage begins at KH0049 pendant 83 and KH0362 pendant
						47. Twelve consecutive values agree exactly, including 1,856, 2,578,
						89 and 6,485. The passage crosses the same group boundary after
						eight fields on both objects.
					</p>
					<p>
						The shared boundary suggests the two makers organised this part of
						the list the same way, not just reused its values.{" "}
						<Conf level="firm">Exact passage</Conf>
					</p>
				</Prose>
				<Wide caption="The vertical break falls at the same group boundary on both objects.">
					<PairedPassage
						left="KH0049 · p83–94"
						right="KH0362 · p47–58"
						leftValues={passage.map((field) => field.a)}
						rightValues={passage.map((field) => field.b)}
						boundaryAfter={8}
					/>
				</Wide>
			</Step>

			<Step n={4} title="Copy, abstraction, or update?">
				<Prose>
					<p>
						KH0362 looks like a reduced version of KH0049: it keeps the table
						shape, repeats many figures, blanks others, and rounds more of the
						later values. It could be a summary, a working copy at a different
						precision, or a later state of the same account. The numbers do not
						say which.
					</p>
					<p>
						The Field Guide already places the objects next to one another in
						its general similarity ordering. The 72-field alignment is this
						project's addition.
					</p>
				</Prose>
				<Wide>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Four 18-cord groups on KH0362; seven on KH0049; matching decimal knot values and group boundaries.",
								level: "firm",
							},
							{
								title: "Derived",
								body: `${stats.exact}/72 exact fields; ${stats.nonzeroWithinTwo}/${stats.nonzero} retained fields within 2%; 18 populated source fields blank on KH0362.`,
								level: "firm",
							},
							{
								title: "Context",
								body: "Both are attributed broadly to Peru's south coast, but are held in Lima and Gothenburg and lack a shared excavation context.",
								level: "likely",
							},
							{
								title: "Interpretation",
								body: "KH0362 appears to be a reduced version, with fields omitted and values rounded, of the account recorded on KH0049.",
								level: "likely",
							},
						]}
					/>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Khipu Field Guide",
						what: "KH0049 catalog and recorded cords",
						where: "AS038 / HP036",
						href: "https://www.khipufieldguide.com/catalog/KH0049.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0362 recorded cords",
						where: "UR122",
						href: "https://www.khipufieldguide.com/sketchbook/khipus/KH0362/html/KH0362_sketch.html",
					},
					{
						who: "This site",
						what: "Reproducible cross-khipu screen",
						where: "scripts/cross_khipu_analysis.py",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories/pachacamac-fragment">
					Next: a fragment that joins two Pachacamac accounts →
				</Link>
			</p>
		</StoryPage>
	);
}
