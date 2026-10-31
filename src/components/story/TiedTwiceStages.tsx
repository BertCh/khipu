import { type ReactNode, useMemo } from "react";
import KhipuStage, {
	Bracket,
	Callout,
	Connector,
	type StageCtx,
	type StageItem,
	Tag,
	toStage,
} from "#/components/khipu/KhipuStage";
import {
	type Scene,
	ScenePlayer,
	useScenePlayer,
} from "#/components/story/Scenes";
import {
	type Box,
	type CordNode,
	groupBoxOf,
	type Layout,
	type LayoutOptions,
	layoutKhipu,
	padBox,
	unionBox,
} from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { sliceKhipu } from "#/lib/stories/derive";
import {
	type HuachoSide,
	pairRows,
	pairStats,
	type UnitRow,
	unitsKhipu,
	type Verdict,
} from "#/lib/stories/tiedtwice";

/**
 * The animated figure of the "tied twice" story: one part of AS175 above,
 * the Huacho piece that restates it hung upside-down beneath, so the cords
 * meet tip to tip. A line joins each of the five fields of a group to the
 * cord in the same position of the six-cord unit; the scenes walk a few
 * units and then show every field at once.
 */

const LAYOUT: Partial<LayoutOptions> = {
	slot: 11,
	gap: 14,
	subOffset: 4,
	pxPerCm: 2.8,
	padX: 24,
	padTop: 30,
	padBottom: 30,
};
const GAP = 40;
const LIFT = 34;
const A = "a";
const B = "b";

const fmt = (v: number | null | undefined) =>
	v == null ? "—" : v.toLocaleString();
const valueLabel = (c: Cord) => (c.value ? fmt(c.value) : "");

interface PairScene extends Scene {
	view: Box | null;
	emphasis?: (c: Cord) => boolean;
	emphasisB?: (c: Cord) => boolean;
	overlay?: (ctx: StageCtx) => ReactNode;
}

export interface Highlight {
	/** 0-based unit on the Huacho piece */
	unit: number;
	label: string;
	caption: ReactNode;
	callout?: {
		side: "a" | "b";
		name: string;
		text: string;
		sub?: string;
		dx?: number;
		dy?: number;
		/** where along the cord, 0 at the attachment, 1 at the tip */
		at?: number;
	};
}

/** The names of some pendants plus every cord hanging from them. */
function withDescendants(layout: Layout, roots: Set<string>): Set<string> {
	const out = new Set<string>();
	for (const n of layout.nodes) {
		let p: CordNode | null = n;
		while (p?.parent) p = p.parent;
		if (p && roots.has(p.cord.name)) out.add(n.cord.name);
	}
	return out;
}

function toneOf(v: Verdict): "accent" | "muted" {
	return v === "exact" || v === "one" ? "accent" : "muted";
}

function tagTone(v: Verdict): "no" | "muted" {
	return v === "no" || v === "register" ? "no" : "muted";
}

export function PairStage({
	a,
	b,
	side,
	colors,
	aliasA,
	highlights,
}: {
	a: Khipu;
	b: Khipu;
	side: HuachoSide;
	colors: ColorTable;
	aliasA: string;
	highlights: Highlight[];
}) {
	const part = side.part;
	const aPart = useMemo(
		() =>
			sliceKhipu(
				a,
				(c) => (c.group ?? -1) >= part.from && (c.group ?? -1) <= part.to,
			),
		[a, part],
	);
	const bUnits = useMemo(() => unitsKhipu(b, side.units), [b, side]);
	const la = useMemo(() => layoutKhipu(aPart, LAYOUT), [aPart]);
	const lb = useMemo(
		() => layoutKhipu(bUnits, { ...LAYOUT, invert: true }),
		[bUnits],
	);
	const rows = useMemo(() => pairRows(a, b, side), [a, b, side]);
	const offB = la.height + GAP;
	const itemA = useMemo<StageItem>(
		() => ({ key: A, layout: la, style: "physical" }),
		[la],
	);
	const itemB = useMemo<StageItem>(
		() => ({ key: B, layout: lb, y: offB, style: "physical" }),
		[lb, offB],
	);

	const scenes = useMemo<PairScene[]>(() => {
		const stats = pairStats(rows);
		const link = (
			r: UnitRow,
			f: number,
			ctx: StageCtx,
			strong: boolean,
			byVerdict: boolean,
		) => {
			const pair = r.fields[f];
			if (!pair.a || !pair.b) return null;
			const na = la.byName.get(pair.a.name);
			const nb = lb.byName.get(pair.b.name);
			if (!na || !nb) return null;
			return (
				<Connector
					key={`${pair.a.name}-${pair.b.name}`}
					x1={ctx.px(A, na.x)}
					y1={ctx.py(A, na.y1) + LIFT}
					x2={ctx.px(B, nb.x)}
					y2={ctx.py(B, nb.y1) - LIFT}
					strong={strong}
					tone={byVerdict ? toneOf(pair.verdict) : strong ? "accent" : "muted"}
				/>
			);
		};
		const allLinks = (ctx: StageCtx, strong: boolean) =>
			rows.flatMap((r) =>
				r.fields.map((_, f) => link(r, f, ctx, strong, true)),
			);
		const unitView = (r: UnitRow) =>
			padBox(
				unionBox([
					toStage(itemA, groupBoxOf(la, r.group)),
					toStage(itemB, groupBoxOf(lb, r.unit)),
				]),
				90,
				10,
			);
		const unitMarks = (r: UnitRow, ctx: StageCtx) => {
			const ga = groupBoxOf(la, r.group, 0);
			const gb = groupBoxOf(lb, r.unit, 0);
			return (
				<>
					{r.fields.map((_, f) => link(r, f, ctx, true, true))}
					{r.fields.map((pair) => {
						if (!pair.a || !pair.b || pair.verdict === "exact") return null;
						const na = la.byName.get(pair.a.name);
						const nb = lb.byName.get(pair.b.name);
						if (!na || !nb) return null;
						const x = (ctx.px(A, na.x) + ctx.px(B, nb.x)) / 2;
						const y = (ctx.py(A, na.y1) + LIFT + ctx.py(B, nb.y1) - LIFT) / 2;
						return (
							<Tag
								key={pair.a.name}
								x={x}
								y={y}
								text={`${fmt(pair.va)} · ${fmt(pair.vb)}`}
								tone={tagTone(pair.verdict)}
							/>
						);
					})}
					<Bracket
						x0={ctx.px(A, ga.x)}
						x1={ctx.px(A, ga.x + ga.w)}
						y={ctx.py(A, la.primaryY - 14)}
						text={`${aliasA} · group ${r.group + 1}`}
						short={`g${r.group + 1}`}
					/>
					<Tag
						x={ctx.px(B, gb.x + gb.w / 2)}
						y={ctx.py(B, lb.primaryY) + 18}
						text={`${side.alias} · unit ${r.unit + 1}`}
					/>
				</>
			);
		};
		const callout = (h: Highlight, ctx: StageCtx) => {
			const c = h.callout;
			if (!c) return null;
			const key = c.side === "a" ? A : B;
			const n = (c.side === "a" ? la : lb).byName.get(c.name);
			if (!n) return null;
			const at = c.at ?? 0.5;
			return (
				<Callout
					x={ctx.px(key, n.x)}
					y={ctx.py(key, n.y0 + (n.y1 - n.y0) * at)}
					dx={c.dx ?? 56}
					dy={c.dy ?? 0}
					text={c.text}
					sub={c.sub}
					tone="muted"
				/>
			);
		};

		const walk: PairScene[] = highlights.map((h) => {
			const r = rows[h.unit];
			const namesA = withDescendants(la, new Set(r.a.map((c) => c.name)));
			const namesB = withDescendants(lb, new Set(r.b.map((c) => c.name)));
			return {
				label: h.label,
				caption: h.caption,
				view: unitView(r),
				emphasis: (c) => namesA.has(c.name),
				emphasisB: (c) => namesB.has(c.name),
				overlay: (ctx) => (
					<>
						{unitMarks(r, ctx)}
						{callout(h, ctx)}
					</>
				),
				dwell: 6000,
			};
		});

		return [
			{
				label: "Two khipus",
				caption: `${aliasA}, ${part.label.toLowerCase()}, above: ${rows.length} groups of five. ${side.alias} hung beneath it, tip to tip: ${rows.length} units of six. A line joins each field to the cord in the same position of the unit.`,
				view: null,
				overlay: (ctx) => <>{allLinks(ctx, false)}</>,
				dwell: 4200,
			},
			...walk,
			{
				label: "Every field",
				caption: `${stats.exact} of ${stats.compared} fields hold the same number; ${stats.one} more are a knot apart, ${stats.ten} a ten apart. Blue lines agree, grey do not.`,
				view: null,
				overlay: (ctx) => <>{allLinks(ctx, true)}</>,
				dwell: 6000,
			},
		];
	}, [rows, la, lb, itemA, itemB, aliasA, side, part, highlights]);

	const player = useScenePlayer(scenes, { dwell: 4500 });
	const scene = scenes[player.index];
	const items = useMemo<StageItem[]>(
		() => [
			{ ...itemA, emphasis: scene.emphasis, label: valueLabel },
			{ ...itemB, emphasis: scene.emphasisB, label: valueLabel },
		],
		[itemA, itemB, scene],
	);
	return (
		<ScenePlayer scenes={scenes} player={player}>
			<KhipuStage
				items={items}
				colors={colors}
				view={scene.view}
				overlay={scene.overlay}
				aspect={2}
				ariaLabel={`${aliasA} ${part.label} above ${side.alias}, with lines joining the fields that restate each other`}
			/>
		</ScenePlayer>
	);
}
