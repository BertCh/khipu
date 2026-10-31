import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import CordAnatomy from "#/components/khipu/CordAnatomy";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import SumXray from "#/components/khipu/SumXray";
import { PairStage } from "#/components/story/TiedTwiceStages";
import { pendantSums } from "#/lib/khipu/fieldmarks";
import type { CodeTables, ColorTable, Khipu } from "#/lib/khipu/types";
import { HUACHO } from "#/lib/stories/tiedtwice";

type Lens = "material" | "structure" | "arithmetic" | "comparison";

const LENSES: {
	value: Lens;
	n: string;
	label: string;
	title: string;
	description: string;
	claim: string;
}[] = [
	{
		value: "material",
		n: "01",
		label: "Material",
		title: "The transcription drawn as an object",
		description:
			"Ply, colour construction, attachment face, knot direction, axis and cord end are drawn from the recorded codes, so the drawing can be checked against the record.",
		claim:
			"One set of drawing rules renders both the whole khipu and a close-up of any cord.",
	},
	{
		value: "structure",
		n: "02",
		label: "Structure",
		title: "The same record as a diagram",
		description:
			"The schematic keeps the hierarchy, spacing, colour, knot type and value but reduces the textile to simple marks. Repeated templates and non-decimal exceptions are easier to see; the record is unchanged.",
		claim:
			"The physical and schematic views share one layout, so each mark can be traced to the same cord.",
	},
	{
		value: "arithmetic",
		n: "03",
		label: "Arithmetic",
		title: "Sums computed and traced to cords",
		description:
			"The x-ray searches the recorded values for colour-respecting sums and links each total to its summands. Each sum can be checked cord by cord; it shows arithmetic, not what the maker intended.",
		claim: "Derived sums stay attached to the cords they come from.",
	},
	{
		value: "comparison",
		n: "04",
		label: "Comparison",
		title: "Two khipus aligned field by field",
		description:
			"Sections from AS175 and UR233 are hung tip to tip. Lines connect corresponding fields across their different colours and five- and six-cord groups, so the match can be checked field by field.",
		claim:
			"The same view is used to compare other pairs of khipus in these stories.",
	},
];

export default function ResearchInstrument({
	material,
	arithmetic,
	account,
	copy,
	colors,
	codes,
}: {
	material: Khipu;
	arithmetic: Khipu;
	account: Khipu;
	copy: Khipu;
	colors: ColorTable;
	codes: CodeTables;
}) {
	const [lens, setLens] = useState<Lens>("material");
	const [focus, setFocus] = useState<string | null>(null);
	const [hover, setHover] = useState<string | null>(null);
	const current = LENSES.find((item) => item.value === lens) ?? LENSES[0];
	const sums = useMemo(
		() => pendantSums(arithmetic).slice(0, 12),
		[arithmetic],
	);
	const detail = useMemo(
		() =>
			material.cords.find((cord) => cord.knots.length > 1) ??
			material.cords.find((cord) => cord.knots.length > 0) ??
			material.cords[0],
		[material],
	);
	const parent = detail?.parent
		? material.cords.find((cord) => cord.name === detail.parent)
		: null;

	return (
		<section className="research-instrument" aria-labelledby="instrument-title">
			<div className="research-instrument-head">
				<div>
					<p className="eyebrow">How the stories use the data</p>
					<h2 id="instrument-title">Four views of the records</h2>
				</div>
				<p>
					From a single knot to a comparison between two khipus. Every view is
					drawn from the same cord-level records the stories use.
				</p>
			</div>

			<div className="research-lenses" role="tablist" aria-label="View">
				{LENSES.map((item) => (
					<button
						key={item.value}
						type="button"
						role="tab"
						aria-selected={lens === item.value}
						aria-controls="research-lens-panel"
						className={lens === item.value ? "is-active" : undefined}
						onClick={() => setLens(item.value)}
					>
						<span>{item.n}</span>
						{item.label}
					</button>
				))}
			</div>

			<div
				id="research-lens-panel"
				className="research-lens-panel"
				role="tabpanel"
			>
				<div className="research-lens-copy">
					<p className="research-lens-number">View {current.n}</p>
					<h3>{current.title}</h3>
					<p>{current.description}</p>
					<p className="research-claim">{current.claim}</p>
					{lens === "material" || lens === "structure" ? (
						<Link to="/stories/knots-that-are-not-decimal">
							See the test on KH0100 →
						</Link>
					) : lens === "arithmetic" ? (
						<Link to="/khipus/$id" params={{ id: arithmetic.id }}>
							Inspect {arithmetic.id} →
						</Link>
					) : (
						<Link to="/stories/tied-twice">Read the full comparison →</Link>
					)}
				</div>

				<div className={`research-lens-visual is-${lens}`}>
					{lens === "material" && detail && (
						<div className="research-anatomy">
							<div className="research-object-context" aria-hidden="true">
								<KhipuDiagram
									khipu={material}
									colors={colors}
									layout={{
										slot: 7,
										gap: 9,
										subOffset: 3,
										pxPerCm: 1.8,
										cordW: 2,
									}}
									style="physical"
									showGroups={false}
									tooltip={false}
									fit
								/>
							</div>
							<div className="research-cord-detail">
								<CordAnatomy
									cord={detail}
									parent={parent}
									primary={material.primary}
									colors={colors}
									codes={codes}
									khipuId={material.id}
								/>
							</div>
						</div>
					)}

					{lens === "structure" && (
						<KhipuDiagram
							khipu={material}
							colors={colors}
							layout={{
								slot: 11,
								gap: 12,
								subOffset: 4,
								pxPerCm: 3,
								cordW: 2.4,
							}}
							style="schematic"
							showGroups
							showValues
							fit
						/>
					)}

					{lens === "arithmetic" && (
						<div className="research-xray">
							<p>
								<strong>{arithmetic.id}</strong> · {sums.length} representative
								colour-respecting sums shown
							</p>
							<SumXray
								khipu={arithmetic}
								colors={colors}
								sums={sums}
								showAll
								focus={focus}
								onFocus={setFocus}
								hover={hover}
								onHover={setHover}
							/>
							<p className="research-xray-note">
								Hover or select an outlined square to isolate its sum and
								summands.
							</p>
						</div>
					)}

					{lens === "comparison" && (
						<PairStage
							a={account}
							b={copy}
							side={HUACHO[0]}
							colors={colors}
							aliasA={account.aliases[0] ?? account.id}
							highlights={[]}
						/>
					)}
				</div>
			</div>
		</section>
	);
}
