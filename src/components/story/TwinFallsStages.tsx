import { type ReactNode, useMemo } from "react";
import KhipuStage, {
	Bracket,
	Callout,
	type StageCtx,
	type StageItem,
	Tag,
} from "#/components/khipu/KhipuStage";
import {
	type Scene,
	ScenePlayer,
	useScenePlayer,
} from "#/components/story/Scenes";
import {
	type Box,
	type CordNode,
	type GroupBox,
	groupBoxOf,
	type LayoutOptions,
	layoutKhipu,
	nodesBox,
	padBox,
	unionBox,
} from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";
import {
	childrenOf,
	cordTotal,
	numericSubs,
	SECTIONS,
	type SumRow,
	sumRows,
} from "#/lib/stories/twinfalls";

/**
 * The animated figure of the Twin Falls story: section C of KH0699 read from
 * its grand total down to the entries, one unit at a time, with each sum
 * checked as the camera passes.
 */

const STAGE_LAYOUT: Partial<LayoutOptions> = {
	slot: 12,
	gap: 14,
	subOffset: 5,
	pxPerCm: 4,
	padX: 24,
	padTop: 30,
	padBottom: 30,
};

const ACCENT = "var(--accent)";
const WARN = "var(--moiety-r)";
const C = SECTIONS[2];
const K = "a";

interface StageScene extends Scene {
	/** drawing-space box to frame; null frames everything */
	view: Box | null;
	emphasis?: (c: Cord) => boolean;
	ring?: (c: Cord) => string | null;
	overlay?: (ctx: StageCtx) => ReactNode;
}

const fmt = (v: number | null | undefined) =>
	v == null ? "—" : v.toLocaleString();
const valueLabel = (c: Cord) => (c.value ? fmt(c.value) : "");
const markOf = (v: SumRow["verdict"]) =>
	v === "exact" ? "✓" : v === "near" ? "±1" : "✗";

/** Where along a cord to anchor a mark, as a fraction of its length. */
function along(n: CordNode, f: number, ctx: StageCtx) {
	return {
		x: ctx.px(K, n.x),
		y: ctx.py(K, n.y0 + (n.y1 - n.y0) * f),
	};
}

/** A detail group's entries as they add up: "27+20 + 47 + 46 + …". */
function entriesText(cords: Cord[], kids: Map<string, Cord[]>): string {
	return cords
		.filter((c) => c.value || numericSubs(c, kids).some((k) => k.value))
		.map((c) => {
			const subs = numericSubs(c, kids);
			return subs.length
				? `${c.value ?? 0}+${subs.map((k) => cordTotal(k, kids)).join("+")}`
				: String(c.value ?? 0);
		})
		.join(" + ");
}

export function TiersStage({
	khipu,
	colors,
}: {
	khipu: Khipu;
	colors: ColorTable;
}) {
	const layout = useMemo(() => layoutKhipu(khipu, STAGE_LAYOUT), [khipu]);
	const scenes = useMemo<StageScene[]>(() => {
		const groups = pendantGroups(khipu);
		const kids = childrenOf(khipu);
		const rows = sumRows(khipu, C);
		const totalGi = C.total as number;
		const names = (gi: number) => new Set(groups[gi].map((c) => c.name));
		const gbox = (gi: number) =>
			layout.groups.find((b) => b.index === gi) as GroupBox;
		const box = (gi: number) => padBox(groupBoxOf(layout, gi), 80, 16);
		const bracketY = (ctx: StageCtx) => ctx.py(K, layout.primaryY - 14);
		const sectionNames = new Set(
			[totalGi, C.sums, C.total2, C.sums2, ...C.details].flatMap((gi) =>
				groups[gi].map((c) => c.name),
			),
		);
		const total = groups[totalGi][0];
		const totalNode = layout.byName.get(total.name) as CordNode;
		const total2 = groups[C.total2][0];
		const sumNames = names(C.sums);
		const sumsBox = gbox(C.sums);
		const sums2Box = gbox(C.sums2);
		const sumsTotal = rows.reduce((a, r) => a + r.read, 0);
		const second = groups[C.sums2];
		const secondTotal = second.reduce((a, c) => a + cordTotal(c, kids), 0);
		const sectionBox = unionBox([
			groupBoxOf(layout, totalGi),
			groupBoxOf(layout, C.sums2),
			...C.details.map((gi) => groupBoxOf(layout, gi)),
		]);

		const walk: StageScene[] = rows.map((r, i) => {
			const g = gbox(r.detail);
			const eq = `${entriesText(groups[r.detail], kids)} = ${r.detailTotal}`;
			const mark = markOf(r.verdict);
			const lit = names(r.detail);
			return {
				label: `Unit ${i + 1}`,
				caption: (
					<>
						Sum cord {i + 1} reads <strong>{r.read}</strong>. Group{" "}
						{r.detail + 1}, {groups[r.detail].length} cords: {eq} {mark}
					</>
				),
				view: box(r.detail),
				ring: (c) =>
					lit.has(c.name) ? (r.verdict === "no" ? WARN : ACCENT) : null,
				overlay: (ctx) => (
					<Bracket
						x0={ctx.px(K, g.x0)}
						x1={ctx.px(K, g.x1)}
						y={bracketY(ctx)}
						text={`${r.read} · ${eq} ${mark}`}
						short={`${r.detailTotal} ${mark}`}
						tone={r.verdict === "no" ? "no" : "ink"}
					/>
				),
				dwell: 3400,
			};
		});

		return [
			{
				label: "KH0699",
				caption:
					"206 pendants in 29 groups on 85 cm of cotton. The last third of the khipu, from 51 cm on, reads as one account.",
				view: null,
				ring: (c) => (sectionNames.has(c.name) ? ACCENT : null),
				dwell: 3000,
			},
			{
				label: fmt(total.value),
				caption:
					"A lone cord, white mottled with dark brown and, below 34 cm, brownish black: one single knot at 0.5 cm and a six-turn long knot at 17 cm. One thousand and six.",
				view: padBox(nodesBox([totalNode], 0), 70, 16),
				emphasis: (c) => c.name === total.name,
				overlay: (ctx) => {
					const p = along(totalNode, 0.3, ctx);
					return (
						<Callout
							x={p.x}
							y={p.y}
							dx={56}
							dy={-6}
							text={fmt(total.value)}
							sub="grand total"
							tone="accent"
						/>
					);
				},
			},
			{
				label: "Six sums",
				caption: `Six white cords beside it: ${rows.map((r) => r.read).join(" · ")}. Together ${sumsTotal}${sumsTotal === total.value ? ", the lone cord's value exactly." : "."}`,
				view: padBox(
					unionBox([groupBoxOf(layout, C.sums), nodesBox([totalNode], 0)]),
					60,
					16,
				),
				ring: (c) => (sumNames.has(c.name) ? ACCENT : null),
				overlay: (ctx) => (
					<Bracket
						x0={ctx.px(K, sumsBox.x0)}
						x1={ctx.px(K, sumsBox.x1)}
						y={bracketY(ctx)}
						text={`${rows.map((r) => r.read).join(" + ")} = ${sumsTotal} ${sumsTotal === total.value ? "✓" : "✗"}`}
						short={`${sumsTotal} ${sumsTotal === total.value ? "✓" : "✗"}`}
					/>
				),
				dwell: 4200,
			},
			...walk,
			{
				label: fmt(total2.value),
				caption: `A second lone cord reads ${fmt(total2.value)}; the seven grayish-brown cords after it read ${second.map((c) => c.value ?? 0).join(" · ")} and sum to ${secondTotal}.`,
				view: padBox(
					unionBox([groupBoxOf(layout, C.total2), groupBoxOf(layout, C.sums2)]),
					60,
					16,
				),
				ring: (c) =>
					names(C.sums2).has(c.name) || c.name === total2.name ? ACCENT : null,
				overlay: (ctx) => (
					<Bracket
						x0={ctx.px(K, sums2Box.x0)}
						x1={ctx.px(K, sums2Box.x1)}
						y={bracketY(ctx)}
						text={`${second.map((c) => c.value ?? 0).join(" + ")} = ${secondTotal} ${secondTotal === total2.value ? "✓" : "✗"}`}
						short={`${secondTotal} ${secondTotal === total2.value ? "✓" : "✗"}`}
					/>
				),
				dwell: 4200,
			},
			{
				label: "Section C",
				caption:
					"One lone total, six unit sums, a second total with its own column, six detail groups. Every checkable equality holds exactly except one, which is a single knot short.",
				view: padBox(sectionBox, 30, 16),
				overlay: (ctx) => (
					<>
						{rows.map((r) => {
							const g = gbox(r.detail);
							return (
								<Tag
									key={r.detail}
									x={ctx.px(K, (g.x0 + g.x1) / 2)}
									y={bracketY(ctx) - 10}
									text={markOf(r.verdict)}
									tone={r.verdict === "no" ? "no" : "ink"}
								/>
							);
						})}
						<Tag
							x={ctx.px(K, (sumsBox.x0 + sumsBox.x1) / 2)}
							y={bracketY(ctx) - 10}
							text={sumsTotal === total.value ? "✓" : "✗"}
						/>
						<Tag
							x={ctx.px(K, (sums2Box.x0 + sums2Box.x1) / 2)}
							y={bracketY(ctx) - 10}
							text={secondTotal === total2.value ? "✓" : "✗"}
						/>
					</>
				),
				dwell: 6000,
			},
		];
	}, [khipu, layout]);

	const player = useScenePlayer(scenes, { dwell: 3600 });
	const scene = scenes[player.index];
	const items = useMemo<StageItem[]>(
		() => [
			{
				key: K,
				layout,
				style: "physical",
				emphasis: scene.emphasis,
				ring: scene.ring,
				label: valueLabel,
			},
		],
		[layout, scene],
	);
	return (
		<ScenePlayer scenes={scenes} player={player}>
			<KhipuStage
				items={items}
				colors={colors}
				view={scene.view}
				overlay={scene.overlay}
				ariaLabel="Section C of KH0699 read from its grand total down to the entries of each unit"
			/>
		</ScenePlayer>
	);
}
