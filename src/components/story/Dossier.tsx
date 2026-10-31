import type { ReactNode } from "react";

/**
 * Record-shaped blocks for a story that has people and objects in it as
 * well as numbers: a museum object file with its photograph, a timeline,
 * a quoted document, and short profiles of the people who touched the
 * record. Each is plain markup so the copy stays in the route file.
 */

const BASE = import.meta.env.BASE_URL;

/** A resolved public image path, honouring the build's base path. */
export function imageUrl(path: string): string {
	return `${BASE}${path.replace(/^\//, "")}`;
}

export interface PhotoMark {
	/** left, top, width, height as percentages of the image box */
	box: [number, number, number, number];
	label: string;
	/** where the label sits relative to its box */
	at?: "above" | "below";
	tone?: "accent" | "muted";
}

/**
 * A photograph with optional outlined regions, so a structure the story
 * argues from can be pointed at on the object itself.
 */
export function Photo({
	src,
	srcSet,
	sizes,
	alt,
	width,
	height,
	marks,
	credit,
}: {
	src: string;
	srcSet?: string;
	sizes?: string;
	alt: string;
	width: number;
	height: number;
	marks?: PhotoMark[];
	credit?: ReactNode;
}) {
	return (
		<div className="photo">
			<div
				className="photo-box"
				style={{ aspectRatio: `${width} / ${height}` }}
			>
				<img
					src={src}
					srcSet={srcSet}
					sizes={sizes}
					alt={alt}
					width={width}
					height={height}
					loading="lazy"
					decoding="async"
				/>
				{marks?.map((m) => (
					<div
						key={m.label}
						className={`photo-mark is-${m.at ?? "above"} is-${m.tone ?? "accent"}`}
						style={{
							left: `${m.box[0]}%`,
							top: `${m.box[1]}%`,
							width: `${m.box[2]}%`,
							height: `${m.box[3]}%`,
						}}
						aria-hidden="true"
					>
						<span>{m.label}</span>
					</div>
				))}
			</div>
			{credit && <div className="photo-credit">{credit}</div>}
		</div>
	);
}

export interface FileRow {
	term: ReactNode;
	value: ReactNode;
}

/**
 * A museum object file: the photograph, then the catalogue fields as a
 * definition list, then what the recorded cords add.
 */
export function ObjectFile({
	heading,
	sub,
	photo,
	rows,
	children,
}: {
	heading: ReactNode;
	sub?: ReactNode;
	photo: ReactNode;
	rows: FileRow[];
	children?: ReactNode;
}) {
	return (
		<article className="object-file">
			<header className="object-file-head">
				<h3>{heading}</h3>
				{sub && <p>{sub}</p>}
			</header>
			{photo}
			<dl className="object-file-rows">
				{rows.map((r, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed catalogue rows
					<div key={i}>
						<dt>{r.term}</dt>
						<dd>{r.value}</dd>
					</div>
				))}
			</dl>
			{children}
		</article>
	);
}

export interface TimelineEvent {
	when: string;
	/** which strand of the story the event belongs to */
	track: "object" | "record" | "world";
	title: ReactNode;
	body?: ReactNode;
	/** a span rather than a point, e.g. a radiocarbon range */
	span?: boolean;
}

const TRACK_LABEL: Record<TimelineEvent["track"], string> = {
	object: "The objects",
	record: "The records",
	world: "Around them",
};

/** Events in order down the page, colour-coded by strand. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
	return (
		<div className="timeline">
			<div className="timeline-key" aria-hidden="true">
				{(Object.keys(TRACK_LABEL) as TimelineEvent["track"][]).map((t) => (
					<span key={t} className={`is-${t}`}>
						<i />
						{TRACK_LABEL[t]}
					</span>
				))}
			</div>
			<ol className="timeline-list">
				{events.map((e, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: ordered, fixed
						key={i}
						className={`timeline-event is-${e.track} ${e.span ? "is-span" : ""}`}
					>
						<span className="timeline-when">{e.when}</span>
						<span className="timeline-dot" aria-hidden="true" />
						<div className="timeline-body">
							<strong>{e.title}</strong>
							{e.body && <p>{e.body}</p>}
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}

/**
 * A passage from a document, in the original and in translation, with its
 * citation. Used for the colonial testimony and the recorders' own notes.
 */
export function PullQuote({
	original,
	translation,
	lang,
	cite,
	label,
}: {
	original?: ReactNode;
	translation: ReactNode;
	lang?: string;
	cite: ReactNode;
	label?: ReactNode;
}) {
	return (
		<figure className="pull-quote">
			{label && <div className="pull-quote-label">{label}</div>}
			<blockquote>
				<p className="pull-quote-translation">{translation}</p>
				{original && (
					<p className="pull-quote-original" lang={lang}>
						{original}
					</p>
				)}
			</blockquote>
			<figcaption>{cite}</figcaption>
		</figure>
	);
}

/**
 * A recorder's note reproduced as a document: monospaced, numbered, with
 * the words as they were typed. The heading says whose and when.
 */
export function Facsimile({
	heading,
	sub,
	lines,
	cite,
}: {
	heading: ReactNode;
	sub?: ReactNode;
	lines: ReactNode[];
	cite?: ReactNode;
}) {
	return (
		<figure className="facsimile">
			<div className="facsimile-head">
				<strong>{heading}</strong>
				{sub && <span>{sub}</span>}
			</div>
			<ol className="facsimile-lines">
				{lines.map((l, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: numbered paragraphs
					<li key={i}>{l}</li>
				))}
			</ol>
			{cite && <figcaption>{cite}</figcaption>}
		</figure>
	);
}

export interface ProfileItem {
	name: ReactNode;
	dates?: ReactNode;
	role: ReactNode;
	body: ReactNode;
	/** what this person's work contributes to the finding */
	saw?: ReactNode;
}

/** Short profiles of the hands the record passed through. */
export function Profiles({ items }: { items: ProfileItem[] }) {
	return (
		<div className="profiles">
			{items.map((p, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed cast list
				<article key={i} className="profile">
					<header>
						<h3>{p.name}</h3>
						{p.dates && <span className="profile-dates">{p.dates}</span>}
						<p className="profile-role">{p.role}</p>
					</header>
					<p className="profile-body">{p.body}</p>
					{p.saw && (
						<p className="profile-saw">
							<span>What the record shows</span>
							{p.saw}
						</p>
					)}
				</article>
			))}
		</div>
	);
}
