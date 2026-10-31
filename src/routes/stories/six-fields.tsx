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
	SIX_COPY_ID,
	SIX_SOURCE_ID,
	sixFields,
} from "#/lib/stories/crosslinks";
import { groupSpan } from "#/lib/stories/storyIsland";
import "#/styles/stories/pairs.css";

export const Route = createFileRoute("/stories/six-fields")({
	loader: async () => {
		const khipus = await getKhipus([SIX_SOURCE_ID, SIX_COPY_ID]);
		return { a: khipus[SIX_SOURCE_ID], b: khipus[SIX_COPY_ID] };
	},
	head: () => ({ meta: [{ title: "Six numbers, retied — Khipu" }] }),
	component: SixFields,
});

const WEAVE_NAMES = {
	[SIX_SOURCE_ID]: "KH0358 · UR118",
	[SIX_COPY_ID]: "KH0602 · QU014",
};

function SixFields() {
	const { a, b } = Route.useLoaderData();
	const rows = sixFields(a, b);
	// KH0358's JSON group 30: the six cords the lens opens on
	const six = groupSpan(a, 29);
	return (
		<StoryPage
			kicker="KH0358 ↔ KH0602"
			title="Six numbers, retied"
			standfirst={
				<>
					A blue-white group on a Paracas khipu and a yellow group on an
					unprovenanced Dallas fragment carry the same six values. Colour,
					attachment and spacing differ.
				</>
			}
			meta={
				<>
					<span>KH0358 · UR118 · Paracas, Gothenburg</span>
					<span>KH0602 · QU014 · fragmentary, Dallas</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: "6/6",
						label: "values identical",
						note: "16 · 105 · 55 · 239 · 31 · 52",
					},
					{
						value: "WB → Y",
						label: "colour recoded",
						note: "white-blue to yellow",
					},
					{
						value: "V → R",
						label: "attachment changes",
						note: "tied separately",
					},
					{
						value: "2",
						label: "primary sections",
						note: "sewn together on KH0602",
					},
				]}
			/>
			<Step n={1} title="A repeated six-field row">
				<Prose>
					<p>
						KH0358 is built from repeated six-cord groups, many accompanied by
						top cords. Its fifteenth pendant group (JSON group 30, because
						top-cord groups are interleaved) is white and blue. KH0602 group 4
						is yellow. Both read 16, 105, 55, 239, 31, 52.
					</p>
					<p>
						All six values are nonzero and four have two or three decimal
						places, so the ordered match is more informative than a run of ones
						or round tens. <Conf level="firm">6/6 exact</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Above, both objects whole at the same spacing per cord, with the
							six matched cords bracketed: KH0358's regular table over KH0602's
							irregular, damaged run. Below, the bracket opened out: KH0358
							pendants {six.from + 1}–{six.to} and their six threads to KH0602,
							each cord in its recorded colour.
						</>
					}
				>
					<StrandWeave
						top={[SIX_SOURCE_ID]}
						bottom={[SIX_COPY_ID]}
						names={WEAVE_NAMES}
						window={six}
						inset
						className="pair-lens"
					/>
				</Wide>
			</Step>

			<Step n={2} title="The knots agree; the textile choices do not">
				<Prose>
					<p>
						The corresponding cords use the same decimal knot counts, but KH0358
						attaches them verso and KH0602 recto. Their colours differ
						throughout. Knot heights also shift as a block, which indicates two
						separately tied groups rather than a duplicated database record of
						one specimen.
					</p>
					<p>
						Here the same numbers appear under different colour schemes, so a
						link between records need not show matching colours.{" "}
						<Conf level="firm">Independent textile realizations</Conf>
					</p>
				</Prose>
				<Wide>
					<PairedPassage
						left="KH0358 · group 30"
						right="KH0602 · group 4"
						leftValues={rows.map((field) => field.a)}
						rightValues={rows.map((field) => field.b)}
						leftTone="blue"
						rightTone="yellow"
					/>
					<div className="pair-table">
						<ComparisonTable
							rows={rows}
							left="KH0358 group 30"
							right="KH0602 group 4"
						/>
					</div>
				</Wide>
			</Step>

			<Step n={3} title="A match on a damaged fragment">
				<Prose>
					<p>
						KH0602's recorder describes severed ends, loose cords, two
						primary-cord sections sewn together and uncertainty over whether the
						object is one khipu at all. That limits interpretation. The shared
						row may point to the provenance of one fragment, or it may be a
						standard row copied widely.
					</p>
					<p>
						Until adjoining groups also reconcile, this remains a candidate
						relationship rather than a reconstructed account.
					</p>
				</Prose>
				<Wide>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Two six-cord groups with different colours and attachments but identical decimal values.",
								level: "firm",
							},
							{
								title: "Derived",
								body: "The ordered vector 16, 105, 55, 239, 31, 52 occurs as a complete group on both objects.",
								level: "firm",
							},
							{
								title: "Context",
								body: "KH0358 is attributed to Paracas; KH0602 has no provenance and may combine more than one damaged khipu.",
								level: "firm",
							},
							{
								title: "Interpretation",
								body: "One part of KH0602 may descend from the same account or archive as KH0358.",
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
						what: "KH0358 arithmetic record",
						where: "UR118",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/colored_pendant_sum/html/KH0358.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0602 conservation and cord notes",
						where: "QU014",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/subsidiary_pendant_sum/html/KH0602.html",
					},
					{
						who: "This site",
						what: "Reproducible cross-khipu screen",
						where: "scripts/cross_khipu_analysis.py",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories">Back to all stories →</Link>
			</p>
		</StoryPage>
	);
}
