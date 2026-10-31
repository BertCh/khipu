import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/**
 * Step-through playback for a trace array (see src/lib/matching/*Trace.ts):
 * play/pause, step ±1, a speed multiplier, autoplay once a figure scrolls
 * into view (pausing when it scrolls out), and `prefers-reduced-motion`
 * support. Complements src/components/story/Scenes.tsx's `useScenePlayer`,
 * which is for hand-authored scenes rather than a long mechanical trace.
 */

export type TraceSpeed = 1 | 4 | 16;

export interface UseTraceOptions {
	/** steps per second at 1x (default 2) */
	fps?: number;
	/** autoplay once the figure is >= 45% in view (default true; never under reduced motion) */
	autoplay?: boolean;
	loop?: boolean;
	/** initial step under prefers-reduced-motion (default: the last step) */
	reducedStep?: number;
}

export interface UseTraceState {
	step: number;
	/** clamps to [0, nSteps - 1]; stops playback */
	setStep: (s: number | ((cur: number) => number)) => void;
	playing: boolean;
	/** play/pause; restarts from 0 if toggled on at the last step */
	toggle: () => void;
	speed: TraceSpeed;
	setSpeed: (s: TraceSpeed) => void;
	/** attach to the figure's container; drives the in-view autoplay */
	ref: RefObject<HTMLDivElement | null>;
	nSteps: number;
	reducedMotion: boolean;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
	);
}

export function useTrace(
	nSteps: number,
	{ fps = 2, autoplay = true, loop = false, reducedStep }: UseTraceOptions = {},
): UseTraceState {
	const last = Math.max(0, nSteps - 1);
	const [reducedMotion] = useState(prefersReducedMotion);
	const [step, setStepRaw] = useState(() =>
		reducedMotion ? Math.max(0, Math.min(last, reducedStep ?? last)) : 0,
	);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState<TraceSpeed>(1);
	const ref = useRef<HTMLDivElement>(null);
	const started = useRef(false);
	const pausedByScroll = useRef(false);
	const stepRef = useRef(step);
	stepRef.current = step;

	const setStep = useCallback(
		(s: number | ((cur: number) => number)) => {
			setPlaying(false);
			setStepRaw((cur) => {
				const v = typeof s === "function" ? s(cur) : s;
				return Math.max(0, Math.min(last, v));
			});
		},
		[last],
	);

	// autoplay once the figure scrolls into view; pause while it is out of view
	useEffect(() => {
		if (reducedMotion) return;
		const el = ref.current;
		if (!el) return;
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
	}, [autoplay, reducedMotion]);

	// the playback clock
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let lastTick = performance.now();
		const interval = 1000 / (fps * speed);
		const tick = (t: number) => {
			if (t - lastTick >= interval) {
				lastTick = t;
				setStepRaw((cur) => {
					if (cur + 1 > last) {
						if (loop) return 0;
						setPlaying(false);
						return cur;
					}
					return cur + 1;
				});
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, fps, speed, last, loop]);

	const toggle = useCallback(() => {
		setPlaying((p) => {
			if (!p && stepRef.current >= last) setStepRaw(0);
			return !p;
		});
	}, [last]);

	return {
		step,
		setStep,
		playing,
		toggle,
		speed,
		setSpeed,
		ref,
		nSteps,
		reducedMotion,
	};
}
