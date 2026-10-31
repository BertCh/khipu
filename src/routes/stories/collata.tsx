import { createFileRoute, Link } from "@tanstack/react-router";
import Columns, { type Column } from "#/components/charts/Columns";
import CollataCords, {
	CollataPairThreads,
} from "#/components/story/CollataCords";
import {
	Conf,
	Layers,
	Legend,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import { getCorpus, getKhipuIndex } from "#/lib/khipu/data";
import {
	COLLATA_HUES,
	COLLATA_FACTS as F,
	KHIPU_A_END,
	KHIPU_A_INTRO,
	KHIPU_B_END,
	KHIPU_B_INTRO,
} from "#/lib/stories/collata";

export const Route = createFileRoute("/stories/collata")({
	loader: async () => {
		const [corpus, index] = await Promise.all([getCorpus(), getKhipuIndex()]);
		// how many distinct colour codes a khipu uses, across the corpus
		const bins: Record<string, number> = {};
		for (const k of index) {
			const b = Math.min(30, Math.floor(k.nColors / 2) * 2);
			bins[b] = (bins[b] ?? 0) + 1;
		}
		return { corpus, colourBins: bins, nKhipus: index.length };
	},
	head: () => ({ meta: [{ title: "Two khipus from Collata — Khipu" }] }),
	component: Collata,
});

function Collata() {
	const { corpus, colourBins, nKhipus } = Route.useLoaderData();
	const colourCols: Column[] = Object.entries(colourBins)
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(([k, v]) => ({
			key: k,
			label: k === "30" ? "30+" : `${k}–${Number(k) + 1}`,
			value: v,
		}));
	const twistS = corpus.twist.S ?? 0;
	const twistZ = corpus.twist.Z ?? 0;
	const zShare = Math.round((twistZ / (twistS + twistZ)) * 100);

	return (
		<StoryPage
			kicker="Collata"
			title="Two khipus from Collata"
			standfirst={
				<>
					In Collata, in Huarochirí province east of Lima, a wooden box holds
					the community's papers back to 1645 and two khipus that the village
					says are letters. They have no knots. Their cords combine fibre from
					six animals, fourteen dyes and two directions of twist into 95
					distinct kinds. Sabine Hyland has proposed that the last three cords
					of each name the lineage that sent it.
				</>
			}
			meta={
				<>
					<span>Objects: Collata khipus A and B</span>
					<span>Held by the community of Collata; not in any database</span>
				</>
			}
		>
			<Step n={1} title="A box in the mountains">
				<Prose>
					<p>
						The box holds more than a hundred manuscripts (colonial
						correspondence, church inventories, land disputes) in 37 goat-hide
						folders, with the two khipus in a bag on top. The village
						inventories it every June. Senior men tell initiates that native
						leaders made the khipus as <em>cartas</em>, letters, about their
						wars on behalf of the Inka in the eighteenth century. This is
						consistent with the history: in 1783 Felipe Velasco Túpac Inka
						Yupanqui, claiming to be Túpac Amaru's brother, made Collata and
						neighbouring San Pedro de Casta the centre of a rising to restore
						the Inka. It was betrayed, and its leaders executed.
					</p>
					<p>
						Hyland reports these as the first khipus identified as narrative
						letters by descendants of their makers. That identification is the
						firmest part of this story, and it comes from the community, not
						from the cords.{" "}
						<Conf level="firm">What the village says they are</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={2} title="No knots">
				<Prose>
					<p>
						Khipu A has {F.khipuA.pendants} pendants on a top cord{" "}
						{F.khipuA.topCordCm} cm long, divided into {F.khipuA.groups}{" "}
						irregular groups by {F.khipuA.ribbons} cloth ribbons. Khipu B has{" "}
						{F.khipuB.pendants} pendants in {F.khipuB.groups} groups on{" "}
						{F.khipuB.topCordCm} cm. Each begins with a <em>cayte</em>, a bundle
						of coloured fibre that the village reads as the opening and subject;
						A carries an empty bag cut from the lineage chief's kerchief, tied
						to pendant 39 like a seal. No pendant has a knot other than the
						end-knots that stop a cord fraying.
					</p>
					<p>
						In the corpus below, two in three cords carry decimal knots.{" "}
						<Conf level="firm">Physical description</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The opening sequences, as Hyland transcribes them: the twelve
							pendants after Khipu A's cayte, and the eight between Khipu B's
							two caytes. Hatching slants with the ply; two hues on one cord are
							two fibres plied together. Lengths are not published, so none are
							to scale.
						</>
					}
				>
					<div className="collata-pair collata-stack">
						<div>
							<h3 className="fig-title">Khipu A, introductory sequence</h3>
							<CollataCords
								cords={KHIPU_A_INTRO}
								title="Collata khipu A, opening twelve pendants"
							/>
						</div>
						<div>
							<h3 className="fig-title">Khipu B, introductory sequence</h3>
							<CollataCords
								cords={KHIPU_B_INTRO}
								title="Collata khipu B, opening eight pendants"
							/>
						</div>
					</div>
				</Wide>
			</Step>

			<Step n={3} title="A language of animals">
				<Prose>
					<p>
						Two senior herders identified the fibres for Hyland, in order of
						frequency: {F.fibers.slice(0, -1).join(", ")} and {F.fibers.at(-1)}.
						They said the animal mattered: the khipus were "a language of
						animals". Many cords ply two animals together: blue alpaca with dark
						brown guanaco, yellow alpaca with dark brown vicuña. The dyes run to{" "}
						{F.hues} hues, up to four on a cord. And the final twist is S on{" "}
						{F.ply.S}% of cords and Z on {F.ply.Z}%.
					</p>
					<p>
						Colour, fibre and ply together give {F.combinations} distinct kinds
						of cord across {F.pendants} pendants. For comparison, an accounting
						khipu from nearby Anchucaya, described to Hyland by the man who kept
						it, used twelve. A typical khipu in the corpus below uses five
						Ascher colour codes, and its cords are almost all S-twist cotton —
						only {zShare}% of recorded cords are Z. Hyland notes that 95 signs
						is within the range of a logosyllabic script.{" "}
						<Conf level="firm">95 combinations</Conf>{" "}
						<Conf level="likely">Fibre and ply carry meaning</Conf>
					</p>
				</Prose>
				<Wide caption="What the corpus looks like against Collata's 95 signs: distinct colour codes per khipu, and the twist direction of every recorded cord.">
					<div className="figures">
						<div className="figure">
							<figcaption>
								<h3>Distinct colour codes per khipu</h3>
								<p>
									{nKhipus} khipus in this corpus. Collata's cords combine
									fourteen hues with six fibres and two plies.
								</p>
							</figcaption>
							<Columns
								data={colourCols}
								series="khipus"
								unit="khipus"
								labelEvery={2}
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>Final twist of recorded cords</h3>
								<p>
									Share of cords with a final S or Z twist. Cotton takes an S
									twist almost by default; camelid fibre is where the choice is
									free.
								</p>
							</figcaption>
							<ShareBars
								rows={[
									{
										label: "This corpus (mostly cotton)",
										s: twistS,
										z: twistZ,
									},
									{
										label: "Inka camelid-fibre cords",
										s: F.plyInkaCamelid.S,
										z: F.plyInkaCamelid.Z,
									},
									{ label: "Collata", s: F.ply.S, z: F.ply.Z },
								]}
							/>
						</div>
					</div>
				</Wide>
			</Step>

			<Step n={4} title="Reading a signature">
				<Prose>
					<p>
						Letters name their sender, and the eighteenth-century letters in the
						same box do so at the end, in a signature. Hyland's hypothesis is
						that a khipu letter does the same: its last cords name the lineage
						that sent it. Collata's elders say Khipu A was made by Alluka, one
						of the village's two lineages. Its last three cords are dark brown
						guanaco, a white-and-dark-brown cord of llama and guanaco wrapped
						together, and blue llama. Read as syllables — A, LLU, KA — they give
						ALLUKA.
					</p>
					<p>
						Khipu B ends with the same dark brown guanaco and the same blue
						llama, then a cord of golden-brown vicuña. If the first two keep
						their values, A and KA, the third must supply the rest of a name.
						The Quechua word for that golden brown, the colour of ripening maize
						tassels, is <em>paru</em>: A-KA-PAR(U), or Yakapar — one of the two
						lineages of San Pedro de Casta, the other centre of the 1783 revolt.
						On this reading, Khipu B is a letter received from Casta and Khipu A
						is Collata's own copy of one it sent.
					</p>
					<p>
						This is a rebus principle: the cord evokes a word, and the word
						lends a sound. Hyland notes that <em>ankas</em> was the Huarochirí
						Quechua for blue, a possible source of KA. The reading rests on two
						names and six cords. <Conf level="open">Syllabic reading</Conf>
					</p>
				</Prose>
				<Wide caption="The closing cords of each khipu with Hyland's proposed syllables, Khipu A above Khipu B. A thread joins two cords of the same type: the same colour, fibre and ply. Two of the three recur, and the blue llama cord moves from third place to second; A's wrapped cord and B's golden-brown cord have no partner. The dotted box marks the wrapped cord.">
					<div className="collata-pair collata-stack">
						<div>
							<CollataPairThreads
								a={KHIPU_A_END}
								b={KHIPU_B_END}
								labelA="Khipu A, last three cords"
								labelB="Khipu B, last three cords"
								titleA="Collata khipu A ending: A-LLU-KA"
								titleB="Collata khipu B ending: A-KA-PAR(U)"
							/>
							<p className="thr-pair-legend">
								<svg width={26} height={10} aria-hidden="true">
									<path
										d="M1,5 L25,5"
										stroke="var(--accent)"
										strokeWidth={1.6}
									/>
								</svg>
								same cord type, not a value: these cords carry no knots
							</p>
						</div>
					</div>
				</Wide>
			</Step>

			<Step n={5} title="What this does and does not unlock">
				<Prose>
					<p>
						The Collata khipus are late, two and a half centuries after the fall
						of the Inka state, and made of dyed animal fibre; the imperial
						khipus in museums are mostly undyed cotton. The proposed
						decipherment covers six cords. It is not a cipher for the{" "}
						<Link to="/khipus">{nKhipus} khipus</Link> catalogued here, and
						Hyland does not offer it as one.
					</p>
					<p>
						If cords could carry phonetic signs in 1783, the variables recorded
						for every cord in the corpus (fibre, colour, ply, attachment) may
						carry information beyond the numbers. Whether they do on Inka-era
						khipus has not been shown.
					</p>
				</Prose>
				<Wide>
					<Layers
						heading="The reading, layer by layer"
						layers={[
							{
								title: "Observed",
								body: `${F.pendants} knotless pendants; fibres of ${F.fibers.length} animals; ${F.hues} hues; S and Z ply; caytes, ribbons and a cloth bag; kept with the village's manuscripts since at least the eighteenth century.`,
								level: "firm",
							},
							{
								title: "Derived",
								body: `${F.combinations} distinct combinations of colour, fibre and ply — a sign inventory in the logosyllabic range; ply split ${F.ply.S}/${F.ply.Z}, like camelid-fibre Inka khipus and unlike cotton ones.`,
								level: "firm",
							},
							{
								title: "Context",
								body: "The community identifies them as letters about the 1783 rising; the archive's letters sign at the end; the elders name Alluka as Khipu A's author.",
								level: "likely",
							},
							{
								title: "Interpretation",
								body: "Final cords spell lineage names by rebus: A-LLU-KA, A-KA-PAR(U). Cords elsewhere on the khipus are unread; whether the same syllabic values hold across the rest is untested.",
								level: "open",
							},
						]}
					/>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Sabine Hyland",
						what: "Writing with Twisted Cords: The Inscriptive Capacity of Andean Khipus",
						where:
							"Current Anthropology 58(3), 2017 — all cord sequences and counts above are hers",
						href: "https://research-repository.st-andrews.ac.uk/handle/10023/12326",
					},
					{
						who: "Sabine Hyland",
						what: "How Khipus Indicated Labour Contributions in an Andean Village: An Explanation of Colour Banding, Seriation and Ethnocategories",
						where:
							"Journal of Material Culture 21(4), 2016 — the Anchucaya accounting khipu",
					},
					{
						who: "Gary Urton & Carrie Brezine",
						what: "Khipu Database Project",
						where:
							"the corpus ply figures Hyland compares against (S 97 / Z 3 for cotton; 59 / 41 for camelid)",
					},
				]}
			/>
			<Legend
				items={Object.entries(COLLATA_HUES).map(([label, color]) => ({
					label,
					color,
					outline: label === "white",
				}))}
			/>
		</StoryPage>
	);
}

/** Two-part share bars: S against Z, one row per source. */
function ShareBars({
	rows,
}: {
	rows: { label: string; s: number; z: number }[];
}) {
	return (
		<div className="sharebars">
			{rows.map((r) => {
				const pct = Math.round((r.s / (r.s + r.z)) * 100);
				return (
					<div key={r.label} className="sharebar-row">
						<span className="sharebar-label">{r.label}</span>
						<span className="sharebar-track">
							<span className="sharebar-s" style={{ width: `${pct}%` }}>
								S {pct}%
							</span>
							<span className="sharebar-z">Z {100 - pct}%</span>
						</span>
					</div>
				);
			})}
		</div>
	);
}
