import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Building blocks for the data stories: a page shell, numbered steps that each
 * add one layer of reading, confidence pills so a claim's footing is never
 * ambiguous, and the four-layer panel that separates what was observed from
 * what was derived, matched and interpreted.
 */

export type Confidence = "firm" | "likely" | "open";

const CONF_LABEL: Record<Confidence, string> = {
	firm: "Read directly",
	likely: "Supported reading",
	open: "Hypothesis",
};

export function Conf({
	level,
	children,
}: {
	level: Confidence;
	children?: ReactNode;
}) {
	return (
		<span className={`conf conf-${level}`}>
			<i aria-hidden="true" />
			{children ?? CONF_LABEL[level]}
		</span>
	);
}

export function StoryPage({
	kicker,
	title,
	standfirst,
	meta,
	children,
}: {
	kicker: string;
	title: ReactNode;
	standfirst: ReactNode;
	meta?: ReactNode;
	children: ReactNode;
}) {
	return (
		<main className="page-wrap story">
			<nav className="story-crumb" aria-label="Stories">
				<Link to="/stories">Stories</Link>
				<span aria-hidden="true">/</span>
				<span>{kicker}</span>
			</nav>
			<header className="story-head">
				<h1 className="page-title">{title}</h1>
				<p className="lede">{standfirst}</p>
				{meta && <div className="story-meta">{meta}</div>}
			</header>
			{children}
		</main>
	);
}

export function Step({
	n,
	title,
	children,
}: {
	n: number;
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="step" aria-labelledby={`step-${n}`}>
			<div className="step-rule">
				<span className="step-no">{String(n).padStart(2, "0")}</span>
			</div>
			<h2 id={`step-${n}`}>{title}</h2>
			{children}
		</section>
	);
}

/** Narrow reading column inside a step. */
export function Prose({ children }: { children: ReactNode }) {
	return <div className="story-prose prose">{children}</div>;
}

/** A figure that takes the full page width, with a caption underneath. */
export function Wide({
	children,
	caption,
}: {
	children: ReactNode;
	caption?: ReactNode;
}) {
	return (
		<figure className="story-figure">
			{children}
			{caption && <figcaption>{caption}</figcaption>}
		</figure>
	);
}

export interface Layer {
	title: "Observed" | "Derived" | "Context" | "Interpretation";
	body: ReactNode;
	level: Confidence;
}

/**
 * The four layers of a reading. Observed is what the recorder wrote down;
 * derived is arithmetic and structure computed from it; context is what the
 * find-spot or a document adds; interpretation is what people think it means.
 */
export function Layers({
	heading,
	layers,
}: {
	heading?: ReactNode;
	layers: Layer[];
}) {
	return (
		<div className="layers">
			{heading && <div className="layers-head">{heading}</div>}
			{layers.map((l) => (
				<div key={l.title} className={`layer layer-${l.title.toLowerCase()}`}>
					<div className="layer-title">{l.title}</div>
					<div className="layer-body">{l.body}</div>
					<div className="layer-conf">
						<Conf level={l.level} />
					</div>
				</div>
			))}
		</div>
	);
}

export interface Source {
	who: string;
	what: string;
	where: string;
	href?: string;
}

export function Sources({ items }: { items: Source[] }) {
	return (
		<section className="story-sources" aria-label="Sources">
			<h3>Sources</h3>
			<ol>
				{items.map((s) => (
					<li key={s.what}>
						{s.who}, {s.href ? <a href={s.href}>{s.what}</a> : s.what}.{" "}
						<span>{s.where}</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/** Small legend row: swatch + label pairs. */
export function Legend({
	items,
}: {
	items: { color: string; label: string; outline?: boolean }[];
}) {
	return (
		<div className="story-legend">
			{items.map((it) => (
				<span key={it.label}>
					<i
						style={{
							background: it.color,
							boxShadow: it.outline ? "inset 0 0 0 1px var(--rule)" : undefined,
						}}
						aria-hidden="true"
					/>
					{it.label}
				</span>
			))}
		</div>
	);
}

/** Toggle group for choosing which layer a figure shows. */
export function LayerTabs<T extends string>({
	value,
	onChange,
	options,
}: {
	value: T;
	onChange: (v: T) => void;
	options: { value: T; label: string }[];
}) {
	return (
		<fieldset className="diagram-tools layer-tabs">
			<legend className="sr-only">Show layer</legend>
			<span style={{ color: "var(--ink-3)" }}>Show</span>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					className="btn"
					aria-pressed={value === o.value}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</fieldset>
	);
}
