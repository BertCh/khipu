import { type ReactNode, useMemo, useState } from "react";
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
import { LayerTabs } from "#/components/story/Story";
import {
	type Box,
	type CordNode,
	cordSpanBox,
	type GroupBox,
	groupBoxOf,
	knotY,
	type Layout,
	type LayoutOptions,
	layoutKhipu,
	nodesBox,
	padBox,
	unionBox,
} from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import {
	type LedgerGroup,
	ledgerGroups,
	pendantGroups,
} from "#/lib/stories/derive";

/**
 * The animated figures of the Inkawasi story. Each one is a stage over a
 * khipu (or two) and a list of scenes: where the camera goes, which cords
 * are lit, and what is written over them.
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

interface PairScene extends StageScene {
	emphasisB?: (c: Cord) => boolean;
}

interface StageScene extends Scene {
	/** drawing-space box to frame; null frames everything */
	view: Box | null;
	emphasis?: (c: Cord) => boolean;
	ring?: (c: Cord) => string | null;
	/** replaces the value labels for this scene */
	values?: (c: Cord) => string;
	overlay?: (ctx: StageCtx) => ReactNode;
}

const fmt = (v: number | null | undefined) =>
	v == null ? "—" : v.toLocaleString();
const valueLabel = (c: Cord) => (c.value ? fmt(c.value) : "");

/** Where along a cord to anchor a mark, as a fraction of its length. */
function along(n: CordNode, f: number, ctx: StageCtx, key: string) {
	return {
		x: ctx.px(key, n.x),
		y: ctx.py(key, n.y0 + (n.y1 - n.y0) * f),
	};
}

/** The same, at a distance in cm, kept on the cord. */
function atCm(n: CordNode, cm: number, ctx: StageCtx, key: string) {
	const len = n.cord.length ?? 2;
	return along(n, Math.min(1, cm / len), ctx, key);
}

/**
 * Role callouts for one ledger group — total to the left, the fixed cord to
 * the left further down, remainders to the right — spaced down the group's
 * longest cord so they never sit level with one another.
 */
function roleCallouts(
	g: LedgerGroup,
	layout: Layout,
	ctx: StageCtx,
	key: string,
	colorNote?: (c: Cord) => string,
) {
	const nodes = g.cords.map((c) => layout.byName.get(c.name) as CordNode);
	const longest = Math.max(...nodes.map((n) => n.cord.length ?? 0), 10);
	let rest = 0;
	return nodes.map((n, i) => {
		const role = i === 0 ? "total" : i === g.fixedAt ? "fixed" : "remainder";
		const cm =
			role === "total"
				? longest * 0.08
				: role === "fixed"
					? Math.min(longest * 0.45, (n.cord.length ?? 0) * 0.8)
					: longest * (0.3 + 0.16 * rest++);
		const p = atCm(n, cm, ctx, key);
		const left = role !== "remainder";
		const value = n.cord.value ? fmt(n.cord.value) : "no knots";
		const note = colorNote?.(n.cord);
		return (
			<Callout
				key={n.cord.name}
				x={p.x}
				y={p.y}
				dx={left ? -48 : 48}
				dy={role === "total" ? -10 : role === "fixed" ? 8 : 0}
				text={role === "remainder" && rest > 1 ? `remainder ${rest}` : role}
				sub={note ? `${note} · ${value}` : value}
				tone={role === "fixed" ? "accent" : "ink"}
			/>
		);
	});
}

/** The ledger reading of one group as an equation, and how it came out. */
function equation(g: LedgerGroup, fixed: number) {
	const v = g.values;
	if (g.fixedAt < 0)
		return {
			text:
				v.length === 1
					? `one cord, ${fmt(v[0])}`
					: `${v.map(fmt).join(" · ")} — no ${fixed}`,
			tone: "muted" as const,
			mark: "·",
		};
	const rest = v.filter((_, i) => i > 0 && i !== g.fixedAt).map(fmt);
	const lhs = `${fmt(v[0])} − ${fixed}`;
	const rhs = rest.join(" + ") || "0";
	if (g.balances)
		return { text: `${lhs} = ${rhs}`, tone: "ink" as const, mark: "✓" };
	if (g.damaged)
		return {
			text: `${lhs} = ${rhs}? cord broken`,
			tone: "muted" as const,
			mark: "…",
		};
	return { text: `${lhs} ≠ ${rhs}`, tone: "no" as const, mark: "✗" };
}

/* ---------------------------------------------------------------------------
   Step 2: from the whole khipu down to the knots on one cord
   --------------------------------------------------------------------------- */

export function ReadCordStage({
	khipu,
	colors,
}: {
	khipu: Khipu;
	colors: ColorTable;
}) {
	const layout = useMemo(() => layoutKhipu(khipu, STAGE_LAYOUT), [khipu]);
	const o = layout.options;
	const K = "a";
	const scenes = useMemo<StageScene[]>(() => {
		const p11 = layout.byName.get("p11") as CordNode;
		const p13 = layout.byName.get("p13") as CordNode;
		const g5 = new Set(
			layout.groups
				.find((g) => g.index === 4)
				?.pendants.map((n) => n.cord.name),
		);
		const only = (name: string) => (c: Cord) => c.name === name;
		const knot = (n: CordNode, cm: number, ctx: StageCtx) => ({
			x: ctx.px(K, n.x),
			y: ctx.py(K, knotY(n, cm, o)),
		});
		return [
			{
				label: "UR267A",
				caption:
					"82 pendant cords in 29 groups on a 95.5 cm primary cord, drawn as recorded. The group this step reads hangs a third of the way along.",
				view: null,
				ring: (c) => (g5.has(c.name) ? ACCENT : null),
				dwell: 3000,
			},
			{
				label: "Group 5",
				caption:
					"Three cords hang together, spaced apart from their neighbours: white, white, and a mottled light-and-moderate brown.",
				view: padBox(groupBoxOf(layout, 4), 70, 20),
				ring: (c) => (g5.has(c.name) ? ACCENT : null),
			},
			{
				label: "Pendant 11",
				caption:
					"50 cm of white cotton, S-twisted, attached verso, with two clusters of knots. Their distance from the primary cord is what the recorder measured.",
				view: padBox(nodesBox([p11], 0), 60, 16),
				emphasis: only("p11"),
			},
			{
				label: "The hundreds",
				caption:
					"Two single knots at 5 cm. The place nearest the primary cord is the highest: each of these counts a hundred.",
				view: cordSpanBox(p11, 0, 11, o, 24),
				emphasis: only("p11"),
				overlay: (ctx) => {
					const k = knot(p11, 5, ctx);
					return (
						<Callout
							x={k.x}
							y={k.y}
							dx={-64}
							dy={-4}
							text="2 single knots"
							sub="hundreds · 200"
						/>
					);
				},
			},
			{
				label: "The units",
				caption:
					"A long knot of six turns at 18.5 cm. Long knots sit only in the units place, and the turns are counted: 6. The empty stretch between the clusters is the tens, and reads zero.",
				view: cordSpanBox(p11, 9, 24, o, 24),
				emphasis: only("p11"),
				overlay: (ctx) => {
					const k = knot(p11, 18.5, ctx);
					const z = knot(p11, 11.5, ctx);
					return (
						<>
							<Callout
								x={z.x}
								y={z.y}
								dx={-64}
								dy={-4}
								text="no knot"
								sub="tens · 0"
								tone="muted"
							/>
							<Callout
								x={k.x}
								y={k.y}
								dx={-64}
								dy={0}
								text="long knot, 6 turns"
								sub="units · 6"
							/>
						</>
					);
				},
			},
			{
				label: "= 206",
				caption: "200 + 0 + 6. The cord reads 206.",
				view: padBox(nodesBox([p11], 0), 60, 16),
				emphasis: only("p11"),
				values: (c) => (c.name === "p11" ? "" : valueLabel(c)),
				overlay: (ctx) => {
					const h = knot(p11, 5, ctx);
					const u = knot(p11, 18.5, ctx);
					const end = along(p11, 1, ctx, K);
					return (
						<>
							<Callout x={h.x} y={h.y} dx={-56} dy={-6} text="200" />
							<Callout x={u.x} y={u.y} dx={-56} dy={0} text="6" />
							<Tag x={end.x} y={end.y + 16} text="= 206" tone="accent" />
						</>
					);
				},
			},
			{
				label: "Pendant 13",
				caption:
					"Two cords along: one single knot for a hundred, nine single knots for ninety, and a figure-eight (1) at 19 cm. 191.",
				view: padBox(nodesBox([p13], 0), 60, 16),
				emphasis: only("p13"),
				values: (c) => (c.name === "p13" ? "" : valueLabel(c)),
				overlay: (ctx) => {
					const h = knot(p13, 5, ctx);
					const t = knot(p13, 11, ctx);
					const u = knot(p13, 19, ctx);
					const end = along(p13, 1, ctx, K);
					return (
						<>
							<Callout
								x={h.x}
								y={h.y}
								dx={56}
								dy={-6}
								text="1 single knot"
								sub="hundreds · 100"
							/>
							<Callout
								x={t.x}
								y={t.y}
								dx={56}
								dy={8}
								text="9 single knots"
								sub="tens · 90"
							/>
							<Callout
								x={u.x}
								y={u.y}
								dx={56}
								dy={0}
								text="figure-eight"
								sub="units · 1"
							/>
							<Tag x={end.x} y={end.y + 16} text="= 191" tone="accent" />
						</>
					);
				},
				dwell: 5000,
			},
		];
	}, [layout, o]);

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
				label: scene.values ?? valueLabel,
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
				ariaLabel="UR267A, zooming from the whole khipu to the knots on pendants 11 and 13"
			/>
		</ScenePlayer>
	);
}

/* ---------------------------------------------------------------------------
   Step 3: four groups, one at a time, with their arithmetic
   --------------------------------------------------------------------------- */

export function ReadGroupStage({
	khipu,
	fixed,
	colors,
	selected,
	onSelect,
}: {
	khipu: Khipu;
	fixed: number;
	colors: ColorTable;
	selected: string | null;
	onSelect: (name: string | null) => void;
}) {
	const layout = useMemo(() => layoutKhipu(khipu, STAGE_LAYOUT), [khipu]);
	const K = "a";
	const ledger = useMemo(() => ledgerGroups(khipu, fixed), [khipu, fixed]);
	const scenes = useMemo<StageScene[]>(() => {
		const GROUPS = [4, 5, 6, 7];
		const names = (gi: number) =>
			new Set(ledger[gi]?.cords.map((c) => c.name) ?? []);
		const box = (gi: number) => padBox(groupBoxOf(layout, gi), 80, 16);
		const bracket = (gi: number, ctx: StageCtx, withMark = false) => {
			const g = layout.groups.find((b) => b.index === gi) as GroupBox;
			const e = equation(ledger[gi], fixed);
			return (
				<Bracket
					key={gi}
					x0={ctx.px(K, g.x0)}
					x1={ctx.px(K, g.x1)}
					y={ctx.py(K, layout.primaryY - 14)}
					text={withMark ? `${e.text} ${e.mark}` : e.text}
					short={withMark ? e.mark : undefined}
					tone={e.tone}
				/>
			);
		};
		const roles = (gi: number, ctx: StageCtx) =>
			roleCallouts(ledger[gi], layout, ctx, K);
		const p19 = layout.byName.get("p19") as CordNode;
		return [
			{
				label: "Group 5",
				caption:
					"The first cord reads 206, the second 15, the third 191. 206 − 15 = 191: the total, the fixed amount, and what is left.",
				view: box(4),
				ring: (c) => (names(4).has(c.name) ? ACCENT : null),
				overlay: (ctx) => (
					<>
						{bracket(4, ctx)}
						{roles(4, ctx)}
					</>
				),
			},
			{
				label: "Group 6",
				caption:
					"The next group does the same: 238 − 15 = 223. Here all three cords are white; the recorder's spacing, not colour, marks the group.",
				view: box(5),
				ring: (c) => (names(5).has(c.name) ? ACCENT : null),
				overlay: (ctx) => (
					<>
						{bracket(5, ctx)}
						{roles(5, ctx)}
					</>
				),
			},
			{
				label: "Group 7",
				caption:
					"85, 15, and a third cord that is broken off. Its remainder should read 70, but the knots went with the missing length.",
				view: box(6),
				ring: (c) =>
					c.name === "p19" ? WARN : names(6).has(c.name) ? ACCENT : null,
				overlay: (ctx) => (
					<>
						{bracket(6, ctx)}
						{roles(6, ctx)}
					</>
				),
			},
			{
				label: "The stub",
				caption:
					"Pendant 19 survives to 4.5 cm, above where its first knot would sit, with a knotless light-brown subsidiary still attached. The sum cannot be checked.",
				view: padBox(nodesBox([p19], 0), 40, 22),
				emphasis: (c) => c.name === "p19",
				ring: (c) => (c.name === "p19" ? WARN : null),
				overlay: (ctx) => {
					const end = along(p19, 1, ctx, K);
					return (
						<Callout
							x={end.x}
							y={end.y}
							dx={-56}
							dy={-6}
							text="broken off at 4.5 cm"
							sub="no knots survive"
							tone="muted"
						/>
					);
				},
				dwell: 4000,
			},
			{
				label: "Group 8",
				caption:
					"160, 15, 239: the third cord is larger than the first. As recorded, this group does not balance.",
				view: box(7),
				ring: (c) => (names(7).has(c.name) ? WARN : null),
				overlay: (ctx) => (
					<>
						{bracket(7, ctx)}
						{roles(7, ctx)}
					</>
				),
				dwell: 4500,
			},
			{
				label: "Groups 5–8",
				caption:
					"Two balance, one is broken, one fails. Click any cord to separate what was observed on it from what was derived and what is interpreted.",
				view: padBox(
					unionBox(GROUPS.map((gi) => groupBoxOf(layout, gi))),
					30,
					16,
				),
				overlay: (ctx) => <>{GROUPS.map((gi) => bracket(gi, ctx, true))}</>,
				dwell: 5000,
			},
		];
	}, [layout, ledger, fixed]);

	const player = useScenePlayer(scenes, { dwell: 4200 });
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
				selected,
				onSelect,
			},
		],
		[layout, scene, selected, onSelect],
	);
	return (
		<ScenePlayer scenes={scenes} player={player}>
			<KhipuStage
				items={items}
				colors={colors}
				view={scene.view}
				overlay={scene.overlay}
				aspect={1.5}
				ariaLabel="Groups 5 to 8 of UR267A with their arithmetic"
			/>
		</ScenePlayer>
	);
}

/* ---------------------------------------------------------------------------
   Step 4: walk the whole ledger, group by group, keeping score
   --------------------------------------------------------------------------- */

type RoleFilter = "all" | "total" | "fixed" | "rest";

export function LedgerWalkStage({
	khipu,
	fixed,
	colors,
	alias,
}: {
	khipu: Khipu;
	fixed: number;
	colors: ColorTable;
	alias: string;
}) {
	const layout = useMemo(() => layoutKhipu(khipu, STAGE_LAYOUT), [khipu]);
	const K = "a";
	const ledger = useMemo(() => ledgerGroups(khipu, fixed), [khipu, fixed]);
	const [filter, setFilter] = useState<RoleFilter>("all");

	// each group's verdict, and the running tally after it
	const tally = useMemo(() => {
		let ok = 0;
		let cut = 0;
		let bad = 0;
		let none = 0;
		return ledger.map((g) => {
			if (g.fixedAt < 0) none++;
			else if (g.balances) ok++;
			else if (g.damaged) cut++;
			else bad++;
			return { ok, cut, bad, none };
		});
	}, [ledger]);

	const scenes = useMemo<StageScene[]>(() => {
		const marks = (upTo: number, ctx: StageCtx) =>
			layout.groups
				.filter((g) => g.index <= upTo)
				.map((g) => {
					const e = equation(ledger[g.index], fixed);
					const x = ctx.px(K, (g.x0 + g.x1) / 2);
					const y = ctx.py(K, layout.primaryY - 14) - 10;
					if (x < -20 || x > ctx.width + 20) return null;
					return (
						<Tag
							key={g.index}
							x={x}
							y={y}
							text={e.mark}
							tone={
								e.tone === "no" ? "no" : e.tone === "muted" ? "muted" : "ink"
							}
						/>
					);
				});
		const walk: StageScene[] = layout.groups.map((g) => {
			const lg = ledger[g.index];
			const e = equation(lg, fixed);
			const t = tally[g.index];
			const names = new Set(lg.cords.map((c) => c.name));
			return {
				label: `Group ${g.index + 1} of ${layout.groups.length}`,
				caption: (
					<>
						{e.text} {e.mark}
						<span className="muted">
							{" "}
							· so far {t.ok} balance, {t.cut} broken, {t.bad} fail
							{t.none ? `, ${t.none} without ${fixed}` : ""}
						</span>
					</>
				),
				view: {
					x: Math.max(
						0,
						Math.min(g.x0 - 170, layout.width - (g.x1 - g.x0 + 340)),
					),
					y: 0,
					w: g.x1 - g.x0 + 340,
					h: layout.height,
				},
				ring: (c) =>
					names.has(c.name) ? (e.tone === "no" ? WARN : ACCENT) : null,
				overlay: (ctx) => (
					<>
						{marks(g.index - 1, ctx)}
						<Bracket
							x0={ctx.px(K, g.x0)}
							x1={ctx.px(K, g.x1)}
							y={ctx.py(K, layout.primaryY - 14)}
							text={e.text}
							tone={e.tone}
						/>
					</>
				),
				dwell: e.tone === "ink" ? 1500 : 2600,
			};
		});
		const last = tally[tally.length - 1];
		return [
			{
				label: alias,
				caption: `${layout.groups.length} groups. Play to read them in order; each is marked as it passes.`,
				view: null,
				dwell: 2200,
			},
			...walk,
			{
				label: "All groups",
				caption: `${last.ok} balance exactly, ${last.cut} have a cord broken above its units, ${last.bad} do not balance as recorded, ${last.none} carry no ${fixed}.`,
				view: null,
				overlay: (ctx) => <>{marks(Number.POSITIVE_INFINITY, ctx)}</>,
				dwell: 6000,
			},
		];
	}, [layout, ledger, tally, fixed, alias]);

	const player = useScenePlayer(scenes, { dwell: 1500 });
	const scene = scenes[player.index];
	const roleOf = useMemo(() => {
		const m = new Map<string, RoleFilter>();
		for (const g of ledger)
			g.cords.forEach((c, i) => {
				m.set(c.name, i === 0 ? "total" : i === g.fixedAt ? "fixed" : "rest");
			});
		return m;
	}, [ledger]);
	const items = useMemo<StageItem[]>(
		() => [
			{
				key: K,
				layout,
				style: "physical",
				emphasis:
					filter === "all"
						? scene.emphasis
						: (c) => c.kind === "pendant" && roleOf.get(c.name) === filter,
				ring: scene.ring,
				label: valueLabel,
			},
		],
		[layout, scene, filter, roleOf],
	);
	return (
		<ScenePlayer
			scenes={scenes}
			player={player}
			tools={
				<LayerTabs
					value={filter}
					onChange={setFilter}
					options={[
						{ value: "all", label: "All" },
						{ value: "total", label: "Totals" },
						{ value: "fixed", label: `The ${fixed}s` },
						{ value: "rest", label: "Remainders" },
					]}
				/>
			}
		>
			<KhipuStage
				items={items}
				colors={colors}
				view={scene.view}
				overlay={scene.overlay}
				duration={700}
				ariaLabel={`${alias}, every group read as total, ${fixed} and remainder`}
			/>
		</ScenePlayer>
	);
}

/* ---------------------------------------------------------------------------
   Step 4: colour as grammar on the peanut ledger
   --------------------------------------------------------------------------- */

export function GrammarStage({
	khipu,
	fixed,
	colors,
	alias,
}: {
	khipu: Khipu;
	fixed: number;
	colors: ColorTable;
	alias: string;
}) {
	const layout = useMemo(() => layoutKhipu(khipu, STAGE_LAYOUT), [khipu]);
	const K = "a";
	const groups = useMemo(() => pendantGroups(khipu), [khipu]);
	const ledger = useMemo(() => ledgerGroups(khipu, fixed), [khipu, fixed]);

	const scenes = useMemo<StageScene[]>(() => {
		const multi = groups.filter((g) => g.length > 1);
		const firstCode = (c: Cord) => c.colorParsed?.[0]?.codes[0];
		const hasCode = (c: Cord, code: string) =>
			c.colorParsed?.[0]?.codes.includes(code) ?? false;
		const firsts = new Set(multi.map((g) => g[0].name));
		const seconds = new Set(multi.map((g) => g[1].name));
		const lasts = new Set(multi.map((g) => g[g.length - 1].name));
		const nSecondNB = multi.filter((g) => hasCode(g[1], "NB")).length;
		const nSecondFixed = multi.filter((g) => g[1].value === fixed).length;
		const nFirstW = multi.filter((g) => firstCode(g[0]) === "W").length;
		const nFirstAB = multi.filter((g) => firstCode(g[0]) === "AB").length;
		const nLastMottled = multi.filter(
			(g) => hasCode(g[g.length - 1], "MB") && hasCode(g[g.length - 1], "W"),
		).length;
		const g1 = ledger[0];
		const gb = layout.groups[0];
		const restOf1 = g1.values.slice(2).map(fmt).join(" + ");
		const colorNote = (c: Cord) => c.color ?? "";
		// the first seventeen groups, so cords stay legible while a role is lit
		const half = padBox(
			unionBox(
				layout.groups
					.filter((g) => g.index < 17)
					.map((g) => groupBoxOf(layout, g.index)),
			),
			20,
			10,
		);
		return [
			{
				label: alias,
				caption: `${khipu.stats.nPendants} pendants in ${groups.length} groups, with ${khipu.stats.nSubsidiaries} subsidiary cords hanging off them. The numbers run to ${fmt(khipu.stats.maxValue)}.`,
				view: null,
				dwell: 3000,
			},
			{
				label: "Group 1",
				caption: (
					<>
						13,328 on a light-brown cord, then a dark-brown cord for the fixed
						amount, then four cords for the rest. The Field Guide reads the
						fixed cord as 200 (a damaged units knot) where the publication has{" "}
						{fixed}; so the group shows eight short.
					</>
				),
				view: padBox(groupBoxOf(layout, 0), 60, 16),
				ring: (c) => (g1.cords.some((x) => x.name === c.name) ? ACCENT : null),
				overlay: (ctx) => (
					<>
						<Bracket
							x0={ctx.px(K, gb.x0)}
							x1={ctx.px(K, gb.x1)}
							y={ctx.py(K, layout.primaryY - 14)}
							text={`${fmt(g1.values[0])} − ${fmt(g1.values[1])} = ${restOf1} + 8`}
							tone="muted"
						/>
						{roleCallouts({ ...g1, fixedAt: 1 }, layout, ctx, K, colorNote)}
					</>
				),
				dwell: 6000,
			},
			{
				label: "The fixed cord",
				caption: `The second cord of every group. Dark brown (NB) in ${nSecondNB} of ${multi.length}; where its knots survive it reads ${fixed}, on ${nSecondFixed} of them. The first seventeen groups are shown; drag to see the rest.`,
				view: half,
				emphasis: (c) => seconds.has(c.name),
				ring: (c) => (seconds.has(c.name) ? ACCENT : null),
				dwell: 4500,
			},
			{
				label: "The totals",
				caption: `The first cord of every group: white in ${nFirstW} of ${multi.length}, light brown in ${nFirstAB}. Never dark brown, never mottled.`,
				view: half,
				emphasis: (c) => firsts.has(c.name),
				ring: (c) => (firsts.has(c.name) ? ACCENT : null),
				dwell: 4500,
			},
			{
				label: "The last remainder",
				caption: `The last cord of every group: mottled white-and-brown (W:MB) in ${nLastMottled} of ${multi.length}, a colour the totals and fixed cords never use.`,
				view: half,
				emphasis: (c) => lasts.has(c.name),
				ring: (c) => (lasts.has(c.name) ? ACCENT : null),
				dwell: 4500,
			},
		];
	}, [layout, groups, ledger, fixed, alias, khipu]);

	const player = useScenePlayer(scenes, { dwell: 4000 });
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
				aspect={2.4}
				ariaLabel={`${alias}: the role each cord colour plays`}
			/>
		</ScenePlayer>
	);
}

/* ---------------------------------------------------------------------------
   Step 5: two khipus tip to tip, joined where they hold the same number
   --------------------------------------------------------------------------- */

const MIRROR_LAYOUT: Partial<LayoutOptions> = { ...STAGE_LAYOUT, pxPerCm: 3 };
const MIRROR_GAP = 36;

interface Match {
	a: CordNode;
	b: CordNode;
	value: number;
}

/**
 * Pair cords of A and B that hold the same value, closest pairs first, so a
 * number that recurs on both khipus is joined to its neighbour and not to a
 * stray twin at the far end. Pairs further apart than a third of the khipu
 * are left unjoined.
 */
function matchValues(la: Layout, lb: Layout, min: number): Match[] {
	const reach = Math.max(la.width, lb.width) / 3;
	const pairs: Match[] = [];
	for (const a of la.pendants) {
		const v = a.cord.value;
		if (v == null || v < min) continue;
		for (const b of lb.pendants) {
			if (b.cord.value !== v || Math.abs(b.x - a.x) > reach) continue;
			pairs.push({ a, b, value: v });
		}
	}
	pairs.sort((p, q) => Math.abs(p.a.x - p.b.x) - Math.abs(q.a.x - q.b.x));
	const usedA = new Set<string>();
	const usedB = new Set<string>();
	const out: Match[] = [];
	for (const m of pairs) {
		if (usedA.has(m.a.cord.name) || usedB.has(m.b.cord.name)) continue;
		usedA.add(m.a.cord.name);
		usedB.add(m.b.cord.name);
		out.push(m);
	}
	return out.sort((p, q) => p.a.x - q.a.x);
}

export function MirrorStage({
	a,
	b,
	fixed,
	colors,
	aliasA,
	aliasB,
}: {
	a: Khipu;
	b: Khipu;
	fixed: number;
	colors: ColorTable;
	aliasA: string;
	aliasB: string;
}) {
	const la = useMemo(() => layoutKhipu(a, MIRROR_LAYOUT), [a]);
	const lb = useMemo(
		() => layoutKhipu(b, { ...MIRROR_LAYOUT, invert: true }),
		[b],
	);
	const A = "a";
	const B = "b";
	const offB = la.height + MIRROR_GAP;
	const itemA = useMemo<StageItem>(
		() => ({ key: A, layout: la, style: "physical" }),
		[la],
	);
	const itemB = useMemo<StageItem>(
		() => ({ key: B, layout: lb, y: offB, style: "physical" }),
		[lb, offB],
	);
	const shared = useMemo(() => matchValues(la, lb, fixed + 1), [la, lb, fixed]);

	const scenes = useMemo<PairScene[]>(() => {
		const LIFT = 36; // clear the value labels at the cord tips
		const link = (m: Match, ctx: StageCtx, strong: boolean) => (
			<Connector
				key={`${m.a.cord.name}-${m.b.cord.name}`}
				x1={ctx.px(A, m.a.x)}
				y1={ctx.py(A, m.a.y1) + LIFT}
				x2={ctx.px(B, m.b.x)}
				y2={ctx.py(B, m.b.y1) - LIFT}
				strong={strong}
				tone={strong ? "accent" : "muted"}
			/>
		);
		const pairView = (gi: number, gj: number) =>
			padBox(
				unionBox([
					toStage(itemA, groupBoxOf(la, gi)),
					toStage(itemB, groupBoxOf(lb, gj)),
				]),
				90,
				10,
			);
		const inGroups = (gi: number, gj: number) => {
			const na = new Set(
				la.groups.find((g) => g.index === gi)?.pendants.map((n) => n.cord.name),
			);
			const nb = new Set(
				lb.groups.find((g) => g.index === gj)?.pendants.map((n) => n.cord.name),
			);
			return { na, nb };
		};
		// within one pair of groups, join every value both hold
		const groupLinks = (gi: number, gj: number, ctx: StageCtx) => {
			const { na, nb } = inGroups(gi, gj);
			const bs = lb.pendants.filter((n) => nb.has(n.cord.name));
			const used = new Set<string>();
			const out: Match[] = [];
			for (const a of la.pendants) {
				if (!na.has(a.cord.name) || !a.cord.value) continue;
				const b = bs.find(
					(n) => n.cord.value === a.cord.value && !used.has(n.cord.name),
				);
				if (!b) continue;
				used.add(b.cord.name);
				out.push({ a, b, value: a.cord.value });
			}
			return out.map((m) => link(m, ctx, true));
		};
		const g5 = inGroups(4, 4);
		const g17 = inGroups(16, 16);
		const p14 = lb.byName.get("p14") as CordNode;
		return [
			{
				label: "Two khipus",
				caption: `${aliasA} above, ${aliasB} below, hung tip to tip. ${aliasB} is plain light brown throughout; the lines join cords that hold the same number.`,
				view: null,
				overlay: (ctx) => <>{shared.map((m) => link(m, ctx, false))}</>,
				dwell: 3600,
			},
			{
				label: "Group 5, twice",
				caption: `${aliasA} writes 206 · 15 · 191. ${aliasB} writes 206 · — · 15: the fixed amount has moved to the end, and the middle cord is full length with no knots.`,
				view: pairView(4, 4),
				emphasis: (c) => g5.na.has(c.name),
				emphasisB: (c) => g5.nb.has(c.name),
				overlay: (ctx) => (
					<>
						{groupLinks(4, 4, ctx)}
						<Callout
							{...along(p14, 0.5, ctx, B)}
							dx={52}
							dy={0}
							text="no knots"
							sub="the remainder not yet tied"
							tone="muted"
						/>
					</>
				),
				dwell: 5500,
			},
			{
				label: "Group 17, twice",
				caption: `Further along, ${aliasB} carries the remainder too: 141 · 126 · 15 against ${aliasA}'s 141 · 15 · 126. The lines cross where the order differs.`,
				view: pairView(16, 16),
				emphasis: (c) => g17.na.has(c.name),
				emphasisB: (c) => g17.nb.has(c.name),
				overlay: (ctx) => <>{groupLinks(16, 16, ctx)}</>,
				dwell: 5500,
			},
			{
				label: "Every shared value",
				caption: `${shared.length} values above ${fixed} appear on both khipus, nearly all in the same order along the cord.`,
				view: null,
				overlay: (ctx) => <>{shared.map((m) => link(m, ctx, true))}</>,
				dwell: 5000,
			},
		];
	}, [la, lb, itemA, itemB, shared, fixed, aliasA, aliasB]);

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
				minHeight={380}
				ariaLabel={`${aliasA} and ${aliasB} drawn tip to tip, with lines joining the values they share`}
			/>
		</ScenePlayer>
	);
}
