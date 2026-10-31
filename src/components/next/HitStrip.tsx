import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { NOT_DECIMAL_IDS, WARI_IDS } from "#/lib/engine/corpus";
import { getKhipuIndex } from "#/lib/khipu/data";
import type { KhipuSummary } from "#/lib/khipu/types";
import type { Hypothesis, RunResult } from "#/lib/next/types";
import { shortPlace } from "#/lib/stories/links";
import "#/styles/next/pair.css";

const TOP = 10;
const MAX_DOTS = 48;

interface Row {
	key: string;
	label: string;
	khipus: number;
	hits: number;
	dots: { id: string; alias: string; hits: number }[];
}

const pct = (x: number) =>
	x >= 0.095 || x === 0
		? `${Math.round(x * 100)}%`
		: `${(x * 100).toFixed(1)}%`;

/**
 * Where a corpus-wide result's hits come from: khipus grouped by find-spot,
 * each place's share of the hits against its share of the khipus, and a lane
 * for the control khipus (Wari and declared-unreadable) that should stay empty.
 */
export default function HitStrip(p: {
	result: RunResult;
	hypothesis: Hypothesis;
}) {
	const [index, setIndex] = useState<KhipuSummary[] | null>(null);
	useEffect(() => {
		let live = true;
		getKhipuIndex()
			.then((ix) => {
				if (live) setIndex(ix);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);

	const hitsById = useMemo(() => {
		const m = new Map<string, number>();
		for (const h of p.result.obs.hits)
			for (const id of h.ids) m.set(id, (m.get(id) ?? 0) + (h.value ?? 1));
		return m;
	}, [p.result]);

	const controls = useMemo(() => new Set(NOT_DECIMAL_IDS), []);
	const wari = useMemo(() => new Set(WARI_IDS), []);
	const wariTest = p.result.provenance.spec.subset === "wari";

	const model = useMemo(() => {
		if (!index) return null;
		const alias = (k: KhipuSummary) =>
			k.aliases.find((a) => a.startsWith("AS")) ?? k.aliases[0] ?? k.id;
		const byPlace = new Map<string, KhipuSummary[]>();
		const unknown: KhipuSummary[] = [];
		for (const k of index) {
			if (controls.has(k.id)) continue;
			if (!k.provenance) unknown.push(k);
			else {
				let l = byPlace.get(k.provenance);
				if (!l) {
					l = [];
					byPlace.set(k.provenance, l);
				}
				l.push(k);
			}
		}
		const places = [...byPlace.entries()].sort(
			(x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]),
		);
		const mk = (key: string, label: string, ks: KhipuSummary[]): Row => {
			const dots = ks
				.map((k) => ({
					id: k.id,
					alias: alias(k),
					hits: hitsById.get(k.id) ?? 0,
				}))
				.filter((d) => d.hits > 0)
				.sort((x, y) => y.hits - x.hits || x.id.localeCompare(y.id));
			return {
				key,
				label,
				khipus: ks.length,
				hits: dots.reduce((s, d) => s + d.hits, 0),
				dots,
			};
		};
		const rows: Row[] = places
			.slice(0, TOP)
			.map(([place, ks]) => mk(place, shortPlace(place), ks));
		const rest = places.slice(TOP).flatMap(([, ks]) => ks);
		if (rest.length) rows.push(mk("other", "Other places", rest));
		if (unknown.length) rows.push(mk("unknown", "Place not recorded", unknown));
		const nKhipus = rows.reduce((s, r) => s + r.khipus, 0);
		const nHits = rows.reduce((s, r) => s + r.hits, 0);
		const ctl = index
			.filter((k) => controls.has(k.id))
			.map((k) => ({
				id: k.id,
				alias: alias(k),
				hits: hitsById.get(k.id) ?? 0,
				wari: wari.has(k.id),
			}));
		return { rows, nKhipus, nHits, ctl };
	}, [index, hitsById, controls, wari]);

	if (p.result.obs.hits.length === 0)
		return (
			<p className="cell-muted">
				This test reports no per-khipu hits, so there is nothing to place.
			</p>
		);
	if (!model) return <p className="cell-muted">Loading the find-spots…</p>;

	const ctlHits = model.ctl.filter((c) => c.hits > 0);
	return (
		<div className="hs">
			<p className="hs-head">
				Where the {model.nHits.toLocaleString("en")} hits of “
				{p.hypothesis.statistic}” come from, by recorded find-spot. Dots are
				khipus with hits, sized by how many; the bar sets each place's share of
				the hits against its share of the khipus.
			</p>
			<ul className="hs-rows">
				{model.rows.map((r) => {
					const hs = model.nHits ? r.hits / model.nHits : 0;
					const ks = model.nKhipus ? r.khipus / model.nKhipus : 0;
					return (
						<li key={r.key} className="hs-row">
							<span className="hs-label">{r.label}</span>
							<span className="hs-dots">
								{r.dots.slice(0, MAX_DOTS).map((d) => {
									const s = Math.min(22, 5 + 3 * Math.sqrt(d.hits));
									return (
										<Link
											key={d.id}
											to="/khipus/$id"
											params={{ id: d.id }}
											className="hs-dot"
											style={{ width: s, height: s }}
											title={`${d.alias} (${d.id}): ${d.hits.toLocaleString("en")} hit${d.hits === 1 ? "" : "s"}`}
											aria-label={`${d.alias}, ${d.hits} hits`}
										/>
									);
								})}
								{r.dots.length > MAX_DOTS && (
									<span className="cell-muted hs-more">
										+{r.dots.length - MAX_DOTS}
									</span>
								)}
							</span>
							<span className="hs-bars" aria-hidden="true">
								<i className="hs-bar-hits" style={{ width: `${hs * 100}%` }} />
								<i
									className="hs-bar-khipus"
									style={{ width: `${ks * 100}%` }}
								/>
							</span>
							<span className="hs-text">
								{r.hits.toLocaleString("en")} of{" "}
								{model.nHits.toLocaleString("en")} hits ({pct(hs)}) from{" "}
								{pct(ks)} of khipus
							</span>
						</li>
					);
				})}
				<li className="hs-row hs-controls">
					<span className="hs-label">Controls</span>
					<span className="hs-dots">
						{model.ctl.map((c) => (
							<Link
								key={c.id}
								to="/khipus/$id"
								params={{ id: c.id }}
								className={`hs-square${c.hits > 0 ? " hs-square-hit" : ""}`}
								title={`${c.alias} (${c.id}), ${c.wari ? "Wari" : "declared unreadable"}: ${c.hits} hits`}
								aria-label={`${c.alias}, control, ${c.hits} hits`}
							/>
						))}
					</span>
					<span className="hs-text hs-text-wide">
						Wari and declared-unreadable khipus, left out of the arithmetic
						tests.
					</span>
				</li>
			</ul>
			<p className="hs-key cell-muted">
				<i className="hs-bar-hits" /> share of hits{" "}
				<i className="hs-bar-khipus" /> share of khipus ·{" "}
				<i className="hs-square" /> control khipu
			</p>
			{ctlHits.length > 0 && !wariTest && (
				<p className="hs-warn" role="note">
					{ctlHits.length} control khipu{ctlHits.length === 1 ? "" : "s"} (
					{ctlHits.map((c) => c.alias).join(", ")}) carr
					{ctlHits.length === 1 ? "ies" : "y"} hits: a test meant for decimal
					records is finding its pattern where it should not.
				</p>
			)}
		</div>
	);
}
