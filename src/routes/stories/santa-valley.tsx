import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import BarList from "#/components/charts/BarList";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import PeopleGrid, { MOIETY_COLOR } from "#/components/story/PeopleGrid";
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
import {
	getCodes,
	getColors,
	getCorpus,
	getKhipus,
	getSilhouettes,
} from "#/lib/khipu/data";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { sextets, sliceKhipu } from "#/lib/stories/derive";

const IDS = ["KH0323", "KH0324", "KH0325", "KH0326", "KH0327", "KH0328"];

export const Route = createFileRoute("/stories/santa-valley")({
	loader: async () => {
		const [khipus, colors, codes, corpus, silhouettes] = await Promise.all([
			getKhipus(IDS),
			getColors(),
			getCodes(),
			getCorpus(),
			getSilhouettes(),
		]);
		const sil = Object.fromEntries(
			IDS.map((id) => [
				id,
				silhouettes[id]
					? silhouettes[id].l.map((l, i) => ({
							length: l,
							color: silhouettes[id].c[i],
						}))
					: [],
			]),
		);
		return { khipus, colors, codes, corpus, sil };
	},
	head: () => ({ meta: [{ title: "Six khipus and a census — Khipu" }] }),
	component: SantaValley,
});

type Layer2 = "recorded" | "groups" | "first" | "attach";

const MID = { slot: 13, subOffset: 4, pxPerCm: 3.2, cordW: 2.8 };

function attachCount(k: Khipu) {
	let R = 0;
	let V = 0;
	for (const c of k.cords) {
		if (c.kind !== "pendant") continue;
		if (c.attach === "R") R++;
		else if (c.attach === "V") V++;
	}
	return { R, V };
}

function SantaValley() {
	const { khipus, colors, codes, corpus, sil } = Route.useLoaderData();
	const six = IDS.map((id) => khipus[id]);
	const ur089 = khipus.KH0325;
	const [layer, setLayer] = useState<Layer2>("recorded");
	const [person, setPerson] = useState<{
		id: string;
		i: number;
		cords: Cord[];
	} | null>(null);
	const [showMoiety, setShowMoiety] = useState(false);

	// first 36 pendants of UR089: six six-cord groups
	const excerpt = useMemo(
		() => sliceKhipu(ur089, (c) => c.kind === "pendant" && c.ordinal <= 36),
		[ur089],
	);
	const { sextetOf, firstOf } = useMemo(() => {
		const sextetOf = new Map<string, number>();
		const firstOf = new Set<string>();
		sextets(ur089).forEach((g, i) => {
			firstOf.add(g[0].name);
			for (const c of g) sextetOf.set(c.name, i);
		});
		return { sextetOf, firstOf };
	}, [ur089]);
	const totalGroups = six.reduce((a, k) => a + sextets(k).length, 0);
	const attachRows = six.map((k) => ({ k, ...attachCount(k) }));

	const paint = (c: Cord): string | null => {
		if (c.level > 1) return null;
		if (layer === "groups") {
			const i = sextetOf.get(c.name);
			return i == null ? null : i % 2 ? "var(--band-a)" : "var(--band-b)";
		}
		if (layer === "attach")
			return c.attach === "V"
				? MOIETY_COLOR.V
				: c.attach === "R"
					? MOIETY_COLOR.R
					: MOIETY_COLOR.U;
		return null;
	};

	return (
		<StoryPage
			kicker="Santa valley"
			title="Six khipus and a census"
			standfirst={
				<>
					Six colonial-era khipus, said to come from a single tomb in the Santa
					valley, are tied in groups of six cords: 133 groups by the authors’
					count, {totalGroups} as we cut the recorded cords. A Spanish tax
					reassessment of 1670 from the same valley lists 132 tributaries by
					name, in six lineages. Medrano and Urton proposed that the two
					describe the same people, and that the way each group is attached may
					mark which half of the community a man belonged to. The match is
					proposed, not proven.
				</>
			}
			meta={
				<>
					<span>
						Objects:{" "}
						{six.map((k, i) => (
							<span key={k.id}>
								{i > 0 && ", "}
								<Link to="/khipus/$id" params={{ id: k.id }}>
									{k.aliases[0]}
								</Link>
							</span>
						))}
					</span>
					<span>Museo Temple Radicati, Lima</span>
				</>
			}
		>
			<Step n={1} title="Six objects">
				<Prose>
					<p>
						The khipus were acquired and first described in the mid-twentieth
						century by Carlos Radicati di Primeglio, who was told they had been
						found together in one tomb somewhere in the Santa valley on Peru's
						north-central coast. There is no other provenance. They are cotton,
						in the Inka style, with 811 pendant cords and 253 subsidiaries
						between them; the document they are matched to is colonial, and on
						that basis so are they.
					</p>
					<p>
						Two things are visible before any knot is read. The pendants come in
						bands of colour that change every six cords. On five of the six
						khipus every pendant is attached to the primary cord the same way
						(all recto or all verso); on the sixth the two are mixed.{" "}
						<Conf level="firm">Recorded structure</Conf>
					</p>
				</Prose>
				<Wide caption="The six khipus to a shared scale, with the attachment direction of their pendants.">
					<div className="six-list">
						{attachRows.map(({ k, R, V }) => (
							<Link
								key={k.id}
								to="/khipus/$id"
								params={{ id: k.id }}
								className="six-row"
							>
								<span className="six-name">
									<strong>{k.aliases[0]}</strong>
									<span>
										{sextets(k).flat().length} pendants in {sextets(k).length}{" "}
										groups of six
									</span>
								</span>
								<KhipuSilhouette
									cords={sil[k.id]}
									colors={colors}
									width={420}
									height={36}
								/>
								<span className="six-attach">
									<span
										className="six-bar"
										style={{
											background: `linear-gradient(to right, ${MOIETY_COLOR.R} ${(R / Math.max(1, R + V)) * 100}%, ${MOIETY_COLOR.V} ${(R / Math.max(1, R + V)) * 100}%)`,
										}}
									/>
									<span>
										{R > 0 && V > 0
											? `${R} recto, ${V} verso`
											: R > 0
												? "all recto"
												: "all verso"}
									</span>
								</span>
							</Link>
						))}
					</div>
					<Legend
						items={[
							{ color: MOIETY_COLOR.R, label: "recto attachment" },
							{ color: MOIETY_COLOR.V, label: "verso attachment" },
						]}
					/>
				</Wide>
			</Step>

			<Step n={2} title="Groups of six">
				<Prose>
					<p>
						These are the first six groups of UR089. The colour band marks the
						group, and the recorder's spacing agrees. Within a group the fourth
						cord is usually the largest number, and the first is small and
						nearly constant across a khipu (4 on most of UR089, 5 on UR090, 1 on
						UR087). The same pattern recurs group after group, consistent with
						six fields recorded for each of a series of people.
					</p>
					<p>
						Switch layers to see the groups, then the first cords alone, then
						how each cord is attached.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							UR089, pendants 1–36. Recorded colours; six-cord groups as
							alternating bands; first cords with their values; attachment
							direction.
						</>
					}
				>
					<LayerTabs
						value={layer}
						onChange={setLayer}
						options={[
							{ value: "recorded", label: "As recorded" },
							{ value: "groups", label: "Six-cord groups" },
							{ value: "first", label: "First cords" },
							{ value: "attach", label: "Attachment" },
						]}
					/>
					<KhipuDiagram
						khipu={excerpt}
						colors={colors}
						codes={codes}
						layout={MID}
						style="physical"
						paint={paint}
						emphasis={
							layer === "first" ? (c) => firstOf.has(c.name) : undefined
						}
						label={
							layer === "first"
								? (c) => (firstOf.has(c.name) ? String(c.value ?? "") : "")
								: layer === "recorded"
									? (c) => (c.value ? String(c.value) : "")
									: undefined
						}
						showGroups={false}
						tooltip={layer === "recorded"}
						fit
					/>
					{layer === "attach" && (
						<Legend
							items={[
								{ color: MOIETY_COLOR.R, label: "recto" },
								{ color: MOIETY_COLOR.V, label: "verso" },
								{ color: MOIETY_COLOR.U, label: "not recorded" },
							]}
						/>
					)}
				</Wide>
			</Step>

			<Step n={3} title="The document">
				<Prose>
					<p>
						In 1670 a Spanish official carried out a <em>revisita</em>, a
						reassessment of tribute, in the settlements around San Pedro de
						Corongo in the lower Santa valley. It names 131 of the 132
						tributaries, sorts them into six <em>pachacas</em> (census units of
						roughly a hundred that coincided with lineages), divides the six
						into two halves, Hanan and Hurin, and sets the total tribute at 367
						pesos and a quarter real.
					</p>
					<p>
						Manuel Medrano and Gary Urton (2018) laid the two side by side: 133
						colour-coded six-cord groups against 132 named men; six khipus
						against six pachacas. They read the first cord of each group as that
						tributary's assessment, and found the first cords across the six
						khipus summing to 359 as they survive, close to the document's 367
						once broken cords are allowed for. (Our copy of the cord data does
						not reproduce the 359.) They proposed that the recto-or-verso
						attachment of the group divides the men into the document's two
						halves, and that the colour bands may sign the names. Mackinley
						FitzPatrick (2024) re-examined the match, kept the binary reading of
						the attachment, and used the census's own counts to derive a
						different alignment of the six khipus to the six pachacas, with
						verso as the unmarked sign for the upper half and recto as the
						marked sign for the lower.{" "}
						<Conf level="likely">One group, one tributary</Conf>{" "}
						<Conf level="open">Which khipu is which pachaca</Conf>
					</p>
					<p>
						FitzPatrick calls the match potential, not proven. If it holds, it
						would be a rare case of a khipu whose subject can be named.
					</p>
				</Prose>
			</Step>

			<Step n={4} title="Everyone at once">
				<Prose>
					<p>
						Every six-cord group on the six khipus, one glyph each: six lines in
						the recorded colours, and a foot that can be coloured by attachment.
						On Medrano and Urton's reading this is the census: {totalGroups}{" "}
						groups here, chunked six at a time from the recorded cords, for 132
						tributaries and a few broken ends. Click a group to see what is
						observed, derived and interpreted about it.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Groups are cut every six pendants, skipping the top cords that
							UR087 interleaves between its groups; where the recorder's groups
							run to 66 cords this may split a group differently from the
							authors' own count of 133.
						</>
					}
				>
					<div className="diagram-tools">
						<button
							type="button"
							className="btn"
							aria-pressed={showMoiety}
							onClick={() => setShowMoiety((v) => !v)}
						>
							Colour by attachment
						</button>
						{showMoiety && (
							<Legend
								items={[
									{ color: MOIETY_COLOR.V, label: "verso: Hanan (upper)?" },
									{ color: MOIETY_COLOR.R, label: "recto: Hurin (lower)?" },
								]}
							/>
						)}
					</div>
					<div className="story-split">
						<PeopleGrid
							khipus={six}
							colors={colors}
							selected={person}
							onSelect={setPerson}
							showMoiety={showMoiety}
						/>
						<Layers
							heading={
								person ? (
									<>
										Group <strong>{person.i + 1}</strong> of{" "}
										{khipus[person.id].aliases[0]}
									</>
								) : (
									"Select a group"
								)
							}
							layers={
								person
									? explainPerson(
											khipus[person.id],
											person.i,
											person.cords,
											colors,
										)
									: []
							}
						/>
					</div>
				</Wide>
			</Step>

			<Step n={5} title="Attachment as a sign">
				<Prose>
					<p>
						A pendant is looped onto the primary cord either recto or verso,
						with the loop's face toward the reader or away. Across the corpus
						the choice is recorded for{" "}
						{((corpus.attach.R ?? 0) + (corpus.attach.V ?? 0)).toLocaleString()}{" "}
						cords and splits almost exactly in half; on the Santa valley khipus
						it splits by object. Medrano and Urton were early in proposing that
						attachment direction carries information. The split can be checked
						in the database; what it stands for is a hypothesis.{" "}
						<Conf level="firm">Binary, per khipu</Conf>{" "}
						<Conf level="open">Hanan and Hurin</Conf>
					</p>
				</Prose>
				<Wide caption="Recto and verso attachments on the six khipus (pendant cords), and across the whole corpus.">
					<div className="figures">
						<div className="figure">
							<figcaption>
								<h3>Santa valley pendants</h3>
							</figcaption>
							<BarList
								rows={attachRows
									.flatMap(({ k, R, V }) => [
										{
											key: `${k.id}R`,
											label: `${k.aliases[0]} recto`,
											value: R,
											color: MOIETY_COLOR.R,
										},
										{
											key: `${k.id}V`,
											label: `${k.aliases[0]} verso`,
											value: V,
											color: MOIETY_COLOR.V,
										},
									])
									.filter((r) => r.value > 0)}
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>All recorded cords</h3>
							</figcaption>
							<BarList
								rows={[
									{
										key: "R",
										label: "recto",
										value: corpus.attach.R ?? 0,
										color: MOIETY_COLOR.R,
									},
									{
										key: "V",
										label: "verso",
										value: corpus.attach.V ?? 0,
										color: MOIETY_COLOR.V,
									},
									{
										key: "U",
										label: "not recorded",
										value: corpus.attach.U ?? 0,
										color: "var(--series-context)",
									},
								]}
								share
							/>
						</div>
					</div>
				</Wide>
			</Step>

			<Step n={6} title="What a group can and cannot tell you">
				<Prose>
					<p>
						The first group of UR090, the mixed khipu: six cords of the same
						yellowish brown, verso, reading 5 · 15 · 7 · 12 · 4 · 16. The knots
						give the numbers and the position gives the field. If the reading
						holds, the attachment gives the man's half of the community. The
						colour may encode lineage or name; no one has shown how. If the
						census is the same one, it names him, but no name can yet be
						assigned to a particular group.
					</p>
				</Prose>
				<Wide>
					<Layers
						heading="Group 1 of UR090, read in layers"
						layers={explainPerson(
							khipus.KH0326,
							0,
							sextets(khipus.KH0326)[0],
							colors,
						)}
					/>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Manuel Medrano & Gary Urton",
						what: "Toward the Decipherment of a Set of Mid-Colonial Khipus from the Santa Valley, Coastal Peru",
						where: "Ethnohistory 65(1), 2018",
						href: "https://read.dukeupress.edu/ethnohistory/article/65/1/1/133085/Toward-the-Decipherment-of-a-Set-of-Mid-Colonial",
					},
					{
						who: "Mackinley FitzPatrick",
						what: "New Insights on Cord Attachment and Social Hierarchy in Six Khipus from the Santa Valley, Peru",
						where: "Ethnohistory 71(4), 2024",
						href: "https://read.dukeupress.edu/ethnohistory/article-abstract/71/4/443/391504/New-Insights-on-Cord-Attachment-and-Social",
					},
					{
						who: "arXiv 2607.00185",
						what: "Structural Pattern Mining in Inka Khipus … and a Computational Validation of the Santa Valley Match",
						where:
							"2026 — reproduces the recto/verso split from the Open Khipu Repository alone",
						href: "https://arxiv.org/abs/2607.00185",
					},
					{
						who: "Harvard Gazette",
						what: "A student mines voices from the Incan past",
						where: "2017",
						href: "https://news.harvard.edu/gazette/story/2017/08/a-students-mines-voices-from-the-incan-past/",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("AB", colors), label: "AB light brown" },
					{ color: hexFor("YB", colors), label: "YB yellowish brown" },
					{ color: hexFor("RB", colors), label: "RB reddish brown" },
					{ color: hexFor("B", colors), label: "B moderate yellowish brown" },
				]}
			/>
		</StoryPage>
	);
}

function explainPerson(
	khipu: Khipu,
	i: number,
	cords: Cord[],
	colors: ReturnType<typeof Route.useLoaderData>["colors"],
): Layer[] {
	const first = cords[0];
	const attach = first.attach;
	const vals = cords.map((c) => c.value ?? 0);
	const bandCodes = [
		...new Set(cords.map((c) => c.colorParsed?.[0]?.codes[0])),
	];
	const mixed = khipu.id === "KH0326";
	return [
		{
			title: "Observed",
			body: (
				<>
					Six cords,{" "}
					{bandCodes.map((code) => (
						<i
							key={code}
							className="swatch-inline"
							style={{ background: hexFor(code, colors) }}
						/>
					))}{" "}
					<code>{cords.map((c) => c.color).join(" ")}</code>, attached{" "}
					{attach === "V" ? "verso" : attach === "R" ? "recto" : "unrecorded"},{" "}
					{cords.map((c) => c.length ?? "?").join(" / ")} cm. Knots read{" "}
					{vals.join(" · ")}.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					Group {i + 1} of {sextets(khipu).length} on {khipu.aliases[0]}. First
					cord {vals[0]}; largest value {Math.max(...vals)} in position{" "}
					{vals.indexOf(Math.max(...vals)) + 1}; group total{" "}
					{vals.reduce((a, b) => a + b, 0)}. {khipu.aliases[0]} is{" "}
					{mixed
						? "the one khipu that mixes recto and verso"
						: `attached ${attach === "V" ? "verso" : "recto"} throughout`}
					.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: "The 1670 revisita of San Pedro de Corongo: 132 tributaries in six pachacas, two halves, 367 pesos ¼ real. Medrano & Urton match the six khipus to the six pachacas and the 133 groups to the tributaries; FitzPatrick realigns which khipu is which pachaca.",
			level: "likely",
		},
		{
			title: "Interpretation",
			body: `Possibly one tributary. First cord ${vals[0]}: his assessed tribute in pesos, on Medrano & Urton's reading. ${attach === "V" ? "Verso: upper half, Hanan (FitzPatrick 2024)." : attach === "R" ? "Recto: lower half, Hurin (FitzPatrick 2024)." : "Attachment unrecorded, so no moiety."} The colour band may mark his name or lineage; the other five cords are unread.`,
			level: "open",
		},
	];
}
