import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChapterShell } from "#/components/matching/ChapterShell";
import PermutationArcs from "#/components/matching/PermutationArcs";
import BaselRibbonsFigure from "#/components/matching/reordering/BaselRibbonsFigure";
import ChunkMisalignFigure from "#/components/matching/reordering/ChunkMisalignFigure";
import FieldMapFigure from "#/components/matching/reordering/FieldMapFigure";
import GroupSortFigure from "#/components/matching/reordering/GroupSortFigure";
import type { AlignRow } from "#/components/matching/reordering/ShelfAlignFigure";
import ShelfAlignFigure from "#/components/matching/reordering/ShelfAlignFigure";
import UnitAgreementFigure from "#/components/matching/reordering/UnitAgreementFigure";
import { alignRows } from "#/components/story/IslandShelf";
import { Prose, Step, Wide } from "#/components/story/Story";
import {
	getColors,
	getKhipuIndex,
	getKhipus,
	getSilhouettes,
	readJson,
} from "#/lib/khipu/data";
import type { Khipu } from "#/lib/khipu/types";
import {
	countInversions,
	matchPermutation,
} from "#/lib/matching/reordering/sort";
import {
	BASEL_FRAGMENT_IDS,
	brownUnits,
	placeFragments,
	whiteUnits,
} from "#/lib/stories/basel";
import {
	PACHACAMAC_LONG_ID,
	PACHACAMAC_TABLE_ID,
} from "#/lib/stories/crosslinks";
import { buildGraph, type ScanFile } from "#/lib/stories/links";
import { partSpan } from "#/lib/stories/storyIsland";
import { getStrands } from "#/lib/stories/strands";
import {
	HUACHO,
	HUACHO_A_ID,
	HUACHO_B_ID,
	type HuachoSide,
	PACHACAMAC_ID,
	pairRows,
} from "#/lib/stories/tiedtwice";
import "#/styles/matching/base.css";
import "#/styles/matching/reordering.css";

const GROUP_A_ID = "KH0156"; // AS140
const GROUP_A_INDEX = 15;
const GROUP_B_ID = "KH0432"; // UR194
const GROUP_B_INDEX = 3;

const SHELF_IDS = [PACHACAMAC_ID, HUACHO_B_ID, HUACHO_A_ID] as const;

export const Route = createFileRoute("/matching/reordering")({
	loader: async () => {
		const ids = [
			PACHACAMAC_ID,
			HUACHO_B_ID,
			HUACHO_A_ID,
			GROUP_A_ID,
			GROUP_B_ID,
			PACHACAMAC_LONG_ID,
			PACHACAMAC_TABLE_ID,
			...BASEL_FRAGMENT_IDS,
		];
		const [khipus, colors, index, scan, strands, silhouettes] =
			await Promise.all([
				getKhipus(ids),
				getColors(),
				getKhipuIndex(),
				readJson<ScanFile>("stories/links.json"),
				getStrands(),
				getSilhouettes(),
			]);
		return { khipus, colors, index, scan, strands, silhouettes };
	},
	head: () => ({
		meta: [
			{ title: "When the order changes — How matching works" },
			{
				name: "description",
				content:
					"Matching when position itself has moved: field maps, order-free groups, mirror-numbered fragments, and sliding a whole island into line.",
			},
		],
	}),
	component: Reordering,
});

function pendantGroupByIndex(khipu: Khipu, g: number) {
	return khipu.cords
		.filter((c) => c.level === 1 && c.group === g)
		.sort((a, b) => a.ordinal - b.ordinal);
}

function Reordering() {
	const { khipus, colors, index, scan, strands, silhouettes } =
		Route.useLoaderData();

	const a = khipus[PACHACAMAC_ID];
	const b = khipus[HUACHO_B_ID];
	const c = khipus[HUACHO_A_ID];
	const [sideB, sideA] = HUACHO;

	const rowsB = useMemo(() => (a && b ? pairRows(a, b, sideB) : []), [a, b]);
	const rowsRecordedA = useMemo(
		() => (a && c ? pairRows(a, c, sideA) : []),
		[a, c],
	);
	const sixesSide: HuachoSide = useMemo(
		() => ({ ...sideA, units: "sixes" }),
		[],
	);
	const rowsSixesA = useMemo(
		() => (a && c ? pairRows(a, c, sixesSide) : []),
		[a, c, sixesSide],
	);
	// the recorder's own group 18 (0-based), with only five cords
	const shortUnit = 18;

	const groupA = useMemo(
		() =>
			khipus[GROUP_A_ID]
				? pendantGroupByIndex(khipus[GROUP_A_ID], GROUP_A_INDEX)
				: [],
		[khipus],
	);
	const groupB = useMemo(
		() =>
			khipus[GROUP_B_ID]
				? pendantGroupByIndex(khipus[GROUP_B_ID], GROUP_B_INDEX)
				: [],
		[khipus],
	);
	const valuesA = useMemo(() => groupA.map((c) => c.value ?? 0), [groupA]);
	const valuesB = useMemo(() => groupB.map((c) => c.value ?? 0), [groupB]);
	const groupPerm = useMemo(
		() => matchPermutation(valuesA, valuesB),
		[valuesA, valuesB],
	);
	const groupInversions = useMemo(
		() => countInversions(groupPerm),
		[groupPerm],
	);
	const groupPairs = (groupA.length * (groupA.length - 1)) / 2;
	// every cord's position in the sequence changed, even if only about half
	// of all pairs inverted relative order — the two are different measures
	const groupAllMoved = useMemo(
		() => groupPerm.length > 0 && groupPerm.every((p, i) => p !== i),
		[groupPerm],
	);

	const long = khipus[PACHACAMAC_LONG_ID];
	const table = khipus[PACHACAMAC_TABLE_ID];
	const fragments = useMemo(
		() =>
			BASEL_FRAGMENT_IDS.map((id) => khipus[id]).filter((k): k is Khipu => !!k),
		[khipus],
	);
	const brown = useMemo(() => (long ? brownUnits(long) : []), [long]);
	const white = useMemo(() => (table ? whiteUnits(table) : []), [table]);
	const placements = useMemo(
		() => (long && table ? placeFragments(long, table, fragments) : []),
		[long, table, fragments],
	);
	const bothPlaced = placements.filter((p) => p.ruleHolds);
	const oneSided = placements.filter(
		(p) => (p.brown || p.white) && !p.ruleHolds,
	);
	const unplaced = placements.filter((p) => !p.brown && !p.white);

	const shelfRows: AlignRow[] = useMemo(() => {
		const graph = buildGraph(index, scan, {
			minRun: 6,
			accessions: false,
			places: false,
		});
		const island = graph.islands.find((g) =>
			g.nodes.some((n) => (SHELF_IDS as readonly string[]).includes(n.id)),
		);
		if (!island) return [];
		const rows = island.nodes.filter((n) =>
			(SHELF_IDS as readonly string[]).includes(n.id),
		);
		const links = island.links.filter(
			(l) =>
				(SHELF_IDS as readonly string[]).includes(l.a) &&
				(SHELF_IDS as readonly string[]).includes(l.b),
		);
		const counts = new Map(
			rows.map((r) => [r.id, silhouettes[r.id]?.l.length ?? 0]),
		);
		const shift = alignRows(rows, links, counts, strands);
		const p1 = a ? partSpan(a, "1") : null;
		const p3 = a ? partSpan(a, "3") : null;
		return rows.map((r) => {
			const n = counts.get(r.id) ?? 0;
			const highlights: [number, number][] =
				r.id === PACHACAMAC_ID
					? [p1, p3]
							.filter((x): x is NonNullable<typeof p1> => x != null)
							.map((x): [number, number] => [x.from, x.to])
					: [[0, n]];
			return {
				id: r.id,
				alias: r.alias,
				n,
				offset: shift.get(r.id) ?? 0,
				highlights,
			};
		});
	}, [index, scan, strands, silhouettes, a]);

	return (
		<ChapterShell
			slug="reordering"
			title="When the order changes"
			standfirst="Fields get relabelled, groups get sorted, a khipu gets read from the other end: matching when position itself has moved."
		>
			<Prose>
				<p>
					Every chapter so far has kept the two sides in step: cord one beside
					cord one, cord two beside cord two. That is not always how a second
					record was tied. A recorder could put the same account into a
					different template, sort a group before tying it, or read a khipu from
					the other end. None of that changes what was recorded — only where it
					sits. The four cases below are all real, all found in the corpus, and
					all read by code that first undoes the reordering, then checks the
					numbers.
				</p>
			</Prose>

			<Step n={1} title="Same fields, different slots">
				<Prose>
					<p>
						AS175 (KH0192) ties its account in groups of five cords. UR233
						(KH0470) and UR232 (KH0469) — two pieces of one spliced khipu,
						Berlin VA 63038 — tie the same two parts of that account in units of
						six, with one extra cord added to every unit that never carries a
						value. The five real fields do not sit at positions 0–4 of the unit;
						they sit wherever <code>HUACHO</code> in <code>tiedtwice.ts</code>{" "}
						says they sit, and the sixth position is always the blank.
					</p>
				</Prose>
				{rowsB[1] && (
					<Wide
						caption={
							<>
								UR233's unit 2 beside the AS175 group it restates. The arcs are
								the field map <code>[0, 1, 3, 4, 5]</code>: the first two fields
								carry straight across, the last three shift right by one slot,
								and the cord the map skips (position 2, highlighted) is always
								knotless. Below, how this unit's five fields agree: here one is
								off by one, one by a round ten, three exact.
							</>
						}
					>
						<FieldMapFigure
							row={rowsB[1]}
							side={sideB}
							colors={colors}
							aliasA="AS175"
							aliasB="UR233"
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/stories/tiedtwice.ts (HUACHO, pairRows, verdictOf) ·
					src/components/matching/PermutationArcs.tsx
				</p>

				<Prose>
					<p>
						Once the map is known, it holds for all 21 units. Step through them:
						UR233 restates AS175's part 1 field for field, with 89 of 104
						comparable fields exact outright and most of the rest a knot or a
						round ten away.
					</p>
				</Prose>
				{rowsB.length > 0 && (
					<Wide caption="Every unit of UR233 against the AS175 group it restates, field by field. The running total at the end is the same 89 of 104 the island page reports for this pair.">
						<UnitAgreementFigure
							rows={rowsB}
							side={sideB}
							colors={colors}
							aliasA="AS175"
							aliasB="UR233"
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/stories/tiedtwice.ts (pairRows, pairStats) ·
					src/components/matching/NumberTape.tsx
				</p>

				<Prose>
					<p>
						The map only works if the six-cord units are cut in the right place.
						UR233's own recorded groups don't run in sixes at all — the recorder
						broke it into groups of six, four, two, one, five and six-again, so
						the units have to be chunked straight through, ignoring the recorded
						breaks. UR232 is the opposite case: its recorder's groups{" "}
						<em>are</em> the units, six cords each — except one group, which has
						only five. Chunk UR232 by that one short group correctly and the
						agreement holds to the end; chunk it straight through in sixes
						instead, ignoring the short group, and every unit after it reads the
						wrong six cords.
					</p>
				</Prose>
				{rowsRecordedA.length > 0 && rowsSixesA.length > 0 && (
					<Wide caption="UR232 against AS175's part 3, chunked two ways. The recorder's own groups (top) keep the agreement to the end; chunking straight through in sixes instead (bottom) comes apart after the one short group.">
						<ChunkMisalignFigure
							rowsRecorded={rowsRecordedA}
							rowsSixes={rowsSixesA}
							shortUnit={shortUnit}
							aliasB="UR232"
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/stories/tiedtwice.ts (unitsOf, pairRows — units:
					&quot;recorded&quot; vs &quot;sixes&quot;)
				</p>
			</Step>

			<Step n={2} title="Order-free matching">
				<Prose>
					<p>
						A group doesn't have to be read in the order it was tied to be
						matched. AS140's group 15 (KH0156) and UR194's group 3 (KH0432) hold
						the exact same nine values — {valuesA.join(", ")} against{" "}
						{valuesB.join(", ")} — in a different order. Sorting both to the
						same signature (smallest to largest) is enough to see it: once
						sorted, the two sequences are identical, cord for cord.
					</p>
				</Prose>
				{groupA.length > 0 && groupB.length > 0 && (
					<Wide caption="A textbook insertion sort, one step per comparison, run on both groups at once. They converge on the same nine-value sequence because they are the same multiset — the sort doesn't know that yet when it starts.">
						<GroupSortFigure
							groupA={groupA}
							groupB={groupB}
							aliasA="AS140 g15"
							aliasB="UR194 g3"
							colors={colors}
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/matching/reordering/sort.ts (insertionSortTrace)
				</p>

				<Prose>
					<p>
						Sorting throws away the original order to prove the groups match;
						the permutation below puts it back, so the reordering itself is
						visible. Each arc is one cord: where it starts is its position in
						AS140's order, where it ends is its position in UR194's.{" "}
						{groupAllMoved ? "Every" : "Almost every"} cord ends up at a
						different position from where it started — this is not a small
						shuffle.
					</p>
				</Prose>
				{groupA.length > 0 && (
					<Wide
						caption={
							<>
								The permutation from AS140's order to UR194's order, by value
								(repeats matched in the order they appear). Of the {groupPairs}{" "}
								possible pairs, {groupInversions} are out of order between the
								two — about what nine values in a random order would give by
								chance; the position of every cord moved, but the inversion
								count alone can't tell this from noise. What can: the two sorted
								sequences are identical, cord for cord.
							</>
						}
					>
						<PermutationArcs
							n={groupA.length}
							perm={groupPerm}
							labels={(i) => String(valuesA[i])}
							mode="rows"
							cellSize={30}
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/matching/reordering/sort.ts (matchPermutation,
					countInversions) · src/components/matching/PermutationArcs.tsx
				</p>
			</Step>

			<Step n={3} title="Mirror order">
				<Prose>
					<p>
						Two Berlin khipus, KH0450 (UR212) and KH0147 (AS131), each carry
						fourteen large groups of cords. Ten loose fragments in Basel each
						repeat a short run from one or both of these groups. Where a
						fragment's brown cords place it on a KH0450 group and its white
						cords place it on a KH0147 group, the two group numbers agree under
						one rule — but only once KH0450 is counted from its <em>end</em>{" "}
						while KH0147 is counted from its <em>start</em>.
					</p>
				</Prose>
				{white.length > 0 && brown.length > 0 && (
					<Wide
						caption={
							<>
								Both khipus' big groups, in the order they were actually tied.
								{bothPlaced.length} of the ten fragments carry both colours and
								land on the same unit number on both sides —{" "}
								{bothPlaced
									.map((p) => `${p.alias} at unit ${p.white?.unit.k}`)
									.join(", ")}
								. Because KH0450 is numbered backwards, each ribbon crosses.
								{oneSided.length} more fragments reach only one side, and{" "}
								{unplaced.length} are too short to place at all.
							</>
						}
					>
						<BaselRibbonsFigure
							white={white}
							brown={brown}
							placements={placements}
						/>
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/lib/stories/basel.ts (brownUnits, whiteUnits,
					placeFragments)
				</p>
			</Step>

			<Step n={4} title="Laying copies side by side">
				<Prose>
					<p>
						The{" "}
						<Link to="/network/$id" params={{ id: PACHACAMAC_ID }}>
							/network
						</Link>{" "}
						page draws a whole island of linked khipus as rows of cords, slid
						sideways so the matched ones line up — the same three khipus as
						above, now as rows rather than a table. Each row moves by the
						weighted median of where its own matched cords land against its
						neighbour; a stray sum can't drag the rest of a long run out of
						line, and a row with no link of its own is centred under the rest.
					</p>
				</Prose>
				{shelfRows.length > 0 && (
					<Wide caption="The same alignment the island page uses, run on these three rows alone. UR233 (no link of its own to move it) stays put; AS175 and UR232 slide until their matched cords sit over it.">
						<ShelfAlignFigure rows={shelfRows} />
					</Wide>
				)}
				<p className="mtx-source">
					Source: src/components/story/IslandShelf.tsx (alignRows)
				</p>
				<Prose>
					<p>
						See the full island, with every ribbon drawn, at{" "}
						<Link to="/network/$id" params={{ id: PACHACAMAC_ID }}>
							/network/{PACHACAMAC_ID}
						</Link>
						.
					</p>
				</Prose>
			</Step>

			<Prose>
				<p>
					<strong>What this step can and cannot tell you.</strong> A field map,
					a sort, a mirror rule and a slide all say the same thing: a match can
					survive the order being changed, as long as something — a template, a
					start-or-end convention, a shared value — says how to undo the change.
					None of these methods discover that correspondence from nothing; each
					one is built from a reading someone already has (the Aschers'
					template, the two groups' shared multiset, the Basel placements) or
					from the matches an earlier chapter already found. Reordering widens
					what a match can look like; it does not, by itself, say two things
					match.
				</p>
			</Prose>
		</ChapterShell>
	);
}
