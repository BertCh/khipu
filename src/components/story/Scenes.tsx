import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * A figure told in scenes. Each scene is one camera frame and one set of
 * marks on a stage; the player steps through them, plays them on its own
 * once the figure has scrolled into view, and pauses when it scrolls out.
 */

export interface Scene {
	/** short name, for the dot and the caption's lead-in */
	label: string;
	caption?: ReactNode;
	/** ms to hold this scene when playing */
	dwell?: number;
}

export function useScenePlayer(
	scenes: Scene[],
	{
		autoplay = true,
		dwell = 3200,
		loop = false,
	}: { autoplay?: boolean; dwell?: number; loop?: boolean } = {},
) {
	const n = scenes.length;
	const [index, setIndex] = useState(0);
	const [playing, setPlaying] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const started = useRef(false);
	const pausedByScroll = useRef(false);

	// start once when the figure comes into view; pause while it is away
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					if (autoplay && !started.current) {
						started.current = true;
						setPlaying(true);
					} else if (pausedByScroll.current) {
						pausedByScroll.current = false;
						setPlaying(true);
					}
				} else {
					setPlaying((p) => {
						if (p) pausedByScroll.current = true;
						return false;
					});
				}
			},
			{ threshold: 0.45 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [autoplay]);

	const wait = scenes[index]?.dwell ?? dwell;
	useEffect(() => {
		if (!playing) return;
		const id = window.setTimeout(() => {
			if (index + 1 >= n) {
				if (loop) setIndex(0);
				else setPlaying(false);
			} else setIndex(index + 1);
		}, wait);
		return () => window.clearTimeout(id);
	}, [playing, index, n, loop, wait]);

	const go = useCallback(
		(i: number | ((cur: number) => number)) => {
			setPlaying(false);
			setIndex((cur) =>
				Math.max(0, Math.min(n - 1, typeof i === "function" ? i(cur) : i)),
			);
		},
		[n],
	);

	return {
		ref,
		index,
		playing,
		go,
		next: () => go((i) => i + 1),
		prev: () => go((i) => i - 1),
		toggle: () => {
			if (!playing && index + 1 >= n) setIndex(0);
			setPlaying((p) => !p);
		},
	};
}

export type ScenePlayerState = ReturnType<typeof useScenePlayer>;

/** The stage, its transport bar and the current scene's caption. */
export function ScenePlayer({
	scenes,
	player,
	children,
	tools,
}: {
	scenes: Scene[];
	player: ScenePlayerState;
	children: ReactNode;
	/** extra controls on the bar's right, e.g. a layer toggle */
	tools?: ReactNode;
}) {
	const { ref, index, playing, go, next, prev, toggle } = player;
	const scene = scenes[index];
	const many = scenes.length > 12;
	return (
		<div className="scene-player" ref={ref}>
			{children}
			<div className="scene-bar">
				<button
					type="button"
					className="btn scene-btn"
					onClick={toggle}
					aria-label={playing ? "Pause" : "Play"}
					aria-pressed={playing}
				>
					{playing ? "❚❚" : "▶"}
				</button>
				<button
					type="button"
					className="btn scene-btn"
					onClick={prev}
					disabled={index === 0}
					aria-label="Previous"
				>
					‹
				</button>
				{many ? (
					<div className="scene-track" aria-hidden="true">
						<div
							className="scene-track-fill"
							style={{ width: `${((index + 1) / scenes.length) * 100}%` }}
						/>
					</div>
				) : (
					<ol className="scene-dots">
						{scenes.map((s, i) => (
							<li key={s.label}>
								<button
									type="button"
									aria-label={s.label}
									aria-current={i === index ? "step" : undefined}
									onClick={() => go(i)}
								/>
							</li>
						))}
					</ol>
				)}
				<button
					type="button"
					className="btn scene-btn"
					onClick={next}
					disabled={index >= scenes.length - 1}
					aria-label="Next"
				>
					›
				</button>
				<span className="scene-count">
					{index + 1} / {scenes.length}
				</span>
				{tools && <span className="scene-tools">{tools}</span>}
			</div>
			<p className="scene-caption" aria-live="polite">
				<strong>{scene.label}</strong>
				{scene.caption && <> — {scene.caption}</>}
			</p>
		</div>
	);
}
