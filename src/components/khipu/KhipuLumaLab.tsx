import { Matrix4 } from "@math.gl/core";
import { Link } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { AXIS_TEXT, axisKind, KNOT_DIR_TEXT } from "#/lib/khipu/anatomy";
import { describeColor } from "#/lib/khipu/colors";
import {
	cordKindLabel,
	describeAttachment,
	describeKnot,
	describePrimaryEnds,
	describeTermination,
	describeTwist,
	formatCm,
	knotTypeName,
	LONG_KNOT_TYPES,
} from "#/lib/khipu/describe";
import type { ColorTable, Khipu, Knot } from "#/lib/khipu/types";
import {
	boundsCentre,
	type Camera,
	distance,
	FOVY,
	fitCamera,
	formatCam,
	forwardOf,
	LOOK_GAIN,
	lookAtCamera,
	NAV_KEYS,
	orbitCamera,
	PITCH_LIMIT,
	parseCam,
	rightOf,
	rotateAbout,
	stepCamera,
	upOf,
	viewProjection,
	WORLD_UP,
} from "./luma/camera";
import {
	add,
	cross,
	dot,
	type LabModel,
	makeModel,
	normalize,
	type Rope,
	resetRopes,
	scale,
	settle,
	simulate,
	sub,
	type V3,
} from "./luma/model";
import { pickRope } from "./luma/paths";
import { type FrameView, LabRenderer } from "./luma/renderer";

interface Props {
	khipu: Khipu;
	colors: ColorTable;
	/** cord to select on mount, by name (from the URL) */
	initialCord?: string;
	/** camera to start from, "x,y,z,yaw,pitch" (from the URL); else the fitted view */
	initialCam?: string;
	/**
	 * Called (debounced) when the selection changes or the camera settles, so
	 * the page can keep them in the URL. `cam` is undefined for the fitted view.
	 */
	onViewChange?: (view: { cord?: string; cam?: string }) => void;
}

type DragMode = "look" | "slide" | "orbit";
type Phase = "starting" | "ready" | "lost" | "failed";
/** When selecting a cord, fly to it: always, only if it is out of sight, or never. */
type FocusRule = "always" | "if-hidden" | "never";

const VIEW_MODES = ["Material", "Knots", "Attachment"] as const;
/** remembers that the controls card has been seen */
const HINTS_KEY = "khipu-lab-hints-seen";
/** how long the first-visit controls card stays up without any interaction */
const HINTS_MS = 6000;
/** pick tolerances in CSS pixels */
const HOVER_RADIUS = 6;
const CLICK_RADIUS = 9;
/** the selection and a settled camera reach the URL this long after the last change */
const URL_DEBOUNCE_MS = 400;
/** below this width the cord panel is a bottom sheet (see lab.css) */
const NARROW = 760;
/** two taps or clicks closer than this (ms, CSS px) are a double tap */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 30;

/**
 * The lab, remounted from scratch with a fresh canvas when a lost WebGL
 * context comes back (a device cannot be revived in place).
 */
export default function KhipuLumaLab(props: Props) {
	const [generation, setGeneration] = useState(0);
	const restart = useCallback(() => setGeneration((g) => g + 1), []);
	return <LabView key={generation} {...props} onRestart={restart} />;
}

/**
 * Cords in reading order: pendants (and top cords) along the primary by
 * where they are hitched, each followed by its subsidiaries, depth first.
 */
function cordOrder(model: LabModel): Rope[] {
	const children = childrenOf(model);
	const out: Rope[] = [];
	const visit = (rope: Rope) => {
		out.push(rope);
		for (const child of children.get(rope.id) ?? []) visit(child);
	};
	const roots = model.ropes
		.filter((r) => r.parentId == null)
		.sort((a, b) => a.posCm - b.posCm);
	for (const root of roots) visit(root);
	return out;
}

/** Each cord's subsidiaries, in order along it. */
function childrenOf(model: LabModel): Map<number, Rope[]> {
	const map = new Map<number, Rope[]>();
	for (const rope of model.ropes) {
		if (rope.parentId == null) continue;
		const list = map.get(rope.parentId) ?? [];
		list.push(rope);
		map.set(rope.parentId, list);
	}
	for (const list of map.values()) list.sort((a, b) => a.posCm - b.posCm);
	return map;
}

/** "3 single (Z) @ 5 cm → 300", "long ×5 (S) @ 17.5 cm → 5": one line per knot. */
function knotLine(k: Knot): string {
	const raw = k.dir ?? "U";
	const dir = raw === "U" ? "" : ` (${raw})`;
	const what = LONG_KNOT_TYPES.has(k.type)
		? `${knotTypeName(k.type)} ×${k.n}`
		: `${k.n} ${knotTypeName(k.type)}`;
	const val = k.value != null ? ` → ${k.value.toLocaleString()}` : "";
	return `${what}${dir} @ ${k.pos} cm${val}`;
}

/** The long reading of a knot, for its tooltip. */
function knotTitle(k: Knot): string {
	const axis = axisKind(k);
	const dir = KNOT_DIR_TEXT[k.dir?.[0] ?? "U"] ?? KNOT_DIR_TEXT.U;
	return `${describeKnot(k)} — ${dir}${axis ? `; ${AXIS_TEXT[axis]}` : ""}`;
}

function readStorage(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// private mode or blocked storage: the card just shows again next time
	}
}

const mediaMatches = (query: string) =>
	typeof window !== "undefined" && window.matchMedia?.(query).matches === true;

function LabView({
	khipu,
	colors,
	initialCord,
	initialCam,
	onViewChange,
	onRestart,
}: Props & { onRestart: () => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLElement>(null);
	const tipRef = useRef<HTMLDivElement>(null);
	const rendererRef = useRef<LabRenderer | null>(null);
	const modelRef = useRef<LabModel>(makeModel(khipu, colors));
	// the URL's camera, if it parses, replaces the first auto-fit
	const restoredCamRef = useRef<Camera | null>(parseCam(initialCam));
	const camRef = useRef<Camera>(
		restoredCamRef.current ?? fitCamera(modelRef.current, 1.8),
	);
	const goalRef = useRef<Camera | null>(null);
	const mvpRef = useRef<Matrix4>(new Matrix4());
	const sizeRef = useRef<[number, number]>([1, 1]);
	const reducedMotion = useMemo(
		() => mediaMatches("(prefers-reduced-motion: reduce)"),
		[],
	);
	const isTouch = useMemo(() => mediaMatches("(pointer: coarse)"), []);
	const reducedMotionRef = useRef(reducedMotion);
	const gravityRef = useRef(9.8);
	const windRef = useRef(reducedMotion ? 0 : 0.7);
	const pausedRef = useRef(false);
	const exposureRef = useRef(1.08);
	const viewModeRef = useRef(0);
	const selectedRef = useRef(-1);
	const hoverRef = useRef(-1);
	const lastFrameRef = useRef<FrameView | null>(null);
	const dragRef = useRef<{
		x: number;
		y: number;
		startX: number;
		startY: number;
		mode: DragMode;
		/** the world point under the cursor when the drag began */
		pivot: V3;
		moved: boolean;
	} | null>(null);
	/** every pointer that is down, for pinch and two-finger pan */
	const pointersRef = useRef(new Map<number, { x: number; y: number }>());
	const pinchRef = useRef<{
		mid: [number, number];
		dist: number;
		pivot: V3;
	} | null>(null);
	const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
		null,
	);
	const lastPointerTypeRef = useRef("mouse");
	/** a pending deselect from a click on empty space (see tapAt) */
	const deselectTimerRef = useRef(0);
	/** the last pointer position over the canvas (client px), for hover */
	const pointerRef = useRef<{ x: number; y: number } | null>(null);
	const hoverFrameRef = useRef(0);
	/** set once the id pass has failed; picking falls back to the CPU ray test */
	const gpuPickBrokenRef = useRef(false);
	const keysRef = useRef<Set<string>>(new Set());
	const velocityRef = useRef<V3>([0, 0, 0]);
	/** a cord from the URL to fly to once the first view is fitted */
	const pendingFocusRef = useRef<Rope | null>(null);
	/** whether the camera has left the fitted view (and so belongs in the URL) */
	const camTouchedRef = useRef(restoredCamRef.current != null);
	const lastCamKeyRef = useRef("");
	const urlTimerRef = useRef(0);
	const writtenRef = useRef({ cord: initialCord, cam: initialCam });
	const onViewChangeRef = useRef(onViewChange);
	onViewChangeRef.current = onViewChange;
	const panelOpenRef = useRef(true);
	const helpRef = useRef<"intro" | "sheet" | null>(null);

	const [gravity, setGravity] = useState(9.8);
	const [wind, setWind] = useState(windRef.current);
	const [exposure, setExposure] = useState(1.08);
	const [viewMode, setViewMode] = useState(0);
	const [paused, setPaused] = useState(false);
	const [selected, setSelected] = useState<Rope | null>(
		() => modelRef.current.ropes.find((r) => r.name === initialCord) ?? null,
	);
	const [hovered, setHovered] = useState<Rope | null>(null);
	const [panelOpen, setPanelOpen] = useState(true);
	const [help, setHelp] = useState<"intro" | "sheet" | null>(null);
	const [introFading, setIntroFading] = useState(false);
	const [phase, setPhase] = useState<Phase>("starting");
	const [status, setStatus] = useState("");
	const [gpuName, setGpuName] = useState("");
	const [failure, setFailure] = useState("");
	const [saving, setSaving] = useState(false);
	const describedBy = useId();

	const order = useMemo(() => cordOrder(modelRef.current), []);
	const children = useMemo(() => childrenOf(modelRef.current), []);

	/* -------------------------------------------------------------------------
	   Deep links: the selection and a settled camera go to the URL
	   ------------------------------------------------------------------------- */

	const scheduleUrl = useCallback(() => {
		window.clearTimeout(urlTimerRef.current);
		urlTimerRef.current = window.setTimeout(() => {
			const rope = modelRef.current.ropes[selectedRef.current];
			const view = {
				cord: rope?.name,
				cam: camTouchedRef.current ? formatCam(camRef.current) : undefined,
			};
			const last = writtenRef.current;
			if (view.cord === last.cord && view.cam === last.cam) return;
			writtenRef.current = view;
			onViewChangeRef.current?.(view);
		}, URL_DEBOUNCE_MS);
	}, []);

	/** Per frame: when the camera has moved, (re)start the URL debounce. */
	const noteCamera = useCallback(() => {
		const key = formatCam(camRef.current);
		if (key === lastCamKeyRef.current) return;
		lastCamKeyRef.current = key;
		if (camTouchedRef.current) scheduleUrl();
	}, [scheduleUrl]);

	useEffect(
		() => () => {
			window.clearTimeout(urlTimerRef.current);
			window.clearTimeout(deselectTimerRef.current);
		},
		[],
	);

	/* -------------------------------------------------------------------------
	   Onboarding: a controls card on first visit that fades on first use
	   ------------------------------------------------------------------------- */

	const showHelp = useCallback((next: "intro" | "sheet" | null) => {
		helpRef.current = next;
		setHelp(next);
		setIntroFading(false);
	}, []);

	const dismissIntro = useCallback(() => {
		if (helpRef.current !== "intro") return;
		helpRef.current = null;
		writeStorage(HINTS_KEY, "1");
		setIntroFading(true);
		window.setTimeout(() => {
			if (helpRef.current === null) setHelp(null);
			setIntroFading(false);
		}, 700);
	}, []);

	useEffect(() => {
		if (readStorage(HINTS_KEY)) return;
		showHelp("intro");
	}, [showHelp]);
	// the card's clock starts once there is something to look at
	useEffect(() => {
		if (phase !== "ready" || helpRef.current !== "intro") return;
		const timer = window.setTimeout(dismissIntro, HINTS_MS);
		return () => window.clearTimeout(timer);
	}, [phase, dismissIntro]);

	/* -------------------------------------------------------------------------
	   Selection and focus
	   ------------------------------------------------------------------------- */

	/**
	 * The part of the canvas the cord panel leaves uncovered, in CSS pixels
	 * from the canvas's top left. Read from the panel when it is showing,
	 * otherwise estimated from the layout it will take (see lab.css).
	 */
	const visibleRect = useCallback((expectPanel: boolean) => {
		const canvas = canvasRef.current;
		const box = canvas?.getBoundingClientRect();
		const w = box?.width ?? 1;
		const h = box?.height ?? 1;
		const out = { left: 0, top: 0, right: w, bottom: h };
		if (!expectPanel || !box) return out;
		const panel = panelRef.current?.getBoundingClientRect();
		if (panel && panel.width > 0) {
			if (panel.left - box.left > w * 0.4) out.right = panel.left - box.left;
			else if (panel.top - box.top > h * 0.25) out.bottom = panel.top - box.top;
		} else if (w > NARROW) out.right = w - (panelOpenRef.current ? 336 : 250);
		else out.bottom = h * (panelOpenRef.current ? 0.55 : 0.85);
		return out;
	}, []);

	// fly to a spot in front of the cord's middle, keeping the present
	// heading, placed so the cord lands in the part the panel leaves clear
	const focusOn = useCallback(
		(rope: Rope) => {
			const ps = rope.particles;
			const mid = ps[Math.floor(ps.length / 2)].p;
			const cam = camRef.current;
			const standOff = Math.max(
				1.35,
				Math.min(4.8, rope.lengthCm * 0.035 + 1.15),
			);
			const view = visibleRect(true);
			const height = canvasRef.current?.getBoundingClientRect().height ?? 1;
			const width = canvasRef.current?.getBoundingClientRect().width ?? 1;
			// world units per CSS pixel at the stand-off distance
			const perPx = (2 * Math.tan(FOVY / 2) * standOff) / Math.max(1, height);
			const ox = (view.left + view.right) / 2 - width / 2;
			const oy = (view.top + view.bottom) / 2 - height / 2;
			const shift = add(
				scale(rightOf(cam), -ox * perPx),
				scale(upOf(cam), oy * perPx),
			);
			camTouchedRef.current = true;
			goalRef.current = {
				eye: add(sub(mid, scale(forwardOf(cam), standOff)), shift),
				yaw: cam.yaw,
				pitch: cam.pitch,
			};
		},
		[visibleRect],
	);

	/** Whether a cord's middle is on screen and clear of the panel. */
	const inSight = useCallback(
		(rope: Rope) => {
			const ps = rope.particles;
			const [x, y, z] = ps[Math.floor(ps.length / 2)].p;
			const m = mvpRef.current;
			const w = m[3] * x + m[7] * y + m[11] * z + m[15];
			if (w <= 0) return false;
			const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
			const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
			const box = canvasRef.current?.getBoundingClientRect();
			if (!box) return false;
			const px = ((nx + 1) / 2) * box.width;
			const py = ((1 - ny) / 2) * box.height;
			const view = visibleRect(true);
			const pad = 24;
			return (
				px > view.left + pad &&
				px < view.right - pad &&
				py > view.top + pad &&
				py < view.bottom - pad
			);
		},
		[visibleRect],
	);

	const selectRope = useCallback(
		(rope: Rope | null, focus: FocusRule = "never") => {
			setSelected(rope);
			if (!rope) return;
			if (focus === "always" || (focus === "if-hidden" && !inSight(rope)))
				focusOn(rope);
		},
		[focusOn, inSight],
	);

	useEffect(() => {
		selectedRef.current = selected ? selected.id : -1;
		scheduleUrl();
	}, [selected, scheduleUrl]);

	useEffect(() => {
		gravityRef.current = gravity;
	}, [gravity]);
	useEffect(() => {
		windRef.current = wind;
	}, [wind]);
	useEffect(() => {
		pausedRef.current = paused;
	}, [paused]);
	useEffect(() => {
		exposureRef.current = exposure;
	}, [exposure]);
	useEffect(() => {
		viewModeRef.current = viewMode;
	}, [viewMode]);
	useEffect(() => {
		panelOpenRef.current = panelOpen;
	}, [panelOpen]);

	/* -------------------------------------------------------------------------
	   The device, the simulation and the draw loop
	   ------------------------------------------------------------------------- */

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let disposed = false;
		let lost = false;
		let frame = 0;
		let renderer: LabRenderer | undefined;
		let removeDevHooks: (() => void) | undefined;

		// a lost context stops the loop; if the browser restores it, the lab
		// remounts on a fresh canvas
		const onLost = (event: Event) => {
			event.preventDefault();
			lost = true;
			cancelAnimationFrame(frame);
			setPhase("lost");
		};
		const onRestored = () => onRestart();
		canvas.addEventListener("webglcontextlost", onLost);
		canvas.addEventListener("webglcontextrestored", onRestored);

		// the loop runs only while the canvas can be seen
		let inView = true;
		let onScreen = true;
		let resume = () => {};
		const updateOnScreen = () => {
			onScreen = inView && document.visibilityState === "visible";
			if (onScreen) resume();
		};
		const observer = new IntersectionObserver((entries) => {
			inView = entries.some((entry) => entry.isIntersecting);
			updateOnScreen();
		});
		observer.observe(canvas);
		document.addEventListener("visibilitychange", updateOnScreen);

		const start = async () => {
			try {
				const created = await LabRenderer.create(canvas, modelRef.current);
				if (disposed) {
					created.destroy();
					return;
				}
				renderer = created;
				rendererRef.current = created;
				// let the loading card paint before the settle blocks the thread
				await new Promise((resolve) =>
					requestAnimationFrame(() => setTimeout(resolve, 0)),
				);
				if (disposed) return;
				// cords find their places against their neighbours before anyone looks
				settle(modelRef.current);
				renderer.update(modelRef.current);
				const label = () =>
					`${renderer?.builder.segments.toLocaleString()} cord segments`;
				setGpuName(renderer.renderer);
				setStatus(label());
				setPhase("ready");
				let lastTime = performance.now();
				let statusTime = lastTime;
				let statusFrames = 0;
				// a camera from the URL stands in for the first fit
				let framed = restoredCamRef.current != null;
				if (!framed && selectedRef.current >= 0)
					pendingFocusRef.current =
						modelRef.current.ropes[selectedRef.current] ?? null;
				if (import.meta.env.DEV) {
					const dev = await import("./luma/devtools");
					if (disposed) return;
					// a hook for driving the camera from a test script
					removeDevHooks = dev.installDevHooks(
						renderer,
						{ mvp: () => mvpRef.current, eye: () => camRef.current.eye },
						{
							cam: camRef,
							goal: goalRef,
							model: modelRef,
							keys: keysRef,
							sizeRef,
							mvpRef,
							lookAt: (eye: V3, target: V3) => {
								camRef.current = lookAtCamera(eye, target);
								goalRef.current = null;
							},
							orbit: (target: V3, yaw: number, pitch: number, dist: number) => {
								camRef.current = orbitCamera(target, yaw, pitch, dist);
								goalRef.current = null;
							},
							settle: (seconds: number) =>
								settle(modelRef.current, seconds, gravityRef.current),
							focus: (name: string) => {
								const rope = modelRef.current.ropes.find(
									(r) => r.name === name,
								);
								if (rope) selectRope(rope, "always");
							},
						},
					);
				}

				// What the last drawn frame showed; a frame whose inputs all match it
				// and whose instances did not change is not drawn again (the canvas
				// keeps showing it), so a still khipu costs next to nothing.
				let shown = "";
				const draw = (time: number) => {
					if (disposed || lost || !renderer) return;
					if (!onScreen) {
						// offscreen or in a hidden tab: stop until it is seen again
						frame = 0;
						return;
					}
					const dt = (time - lastTime) / 1000;
					lastTime = time;
					const lab = modelRef.current;
					if (!pausedRef.current)
						simulate(lab, dt, gravityRef.current, windRef.current);
					renderer.update(lab);

					if (time - statusTime > 1500) {
						const fps = Math.round((statusFrames * 1000) / (time - statusTime));
						setStatus(
							statusFrames === 0
								? `${label()} · at rest`
								: `${label()} · ${fps} fps`,
						);
						statusTime = time;
						statusFrames = 0;
					}

					const [width, height] = renderer.drawingBufferSize();
					sizeRef.current = [width, height];
					if (!framed && width > 1 && height > 1) {
						framed = true;
						camRef.current = fitCamera(lab, width / height);
						const rope = pendingFocusRef.current;
						pendingFocusRef.current = null;
						if (rope) focusOn(rope);
					}
					const stepped = stepCamera(
						camRef.current,
						goalRef.current,
						keysRef.current,
						velocityRef.current,
						lab,
						dt,
						{ snap: reducedMotionRef.current },
					);
					camRef.current = stepped.cam;
					goalRef.current = stepped.goal;
					noteCamera();
					const { mvp, view, projection } = viewProjection(
						camRef.current,
						width / Math.max(1, height),
					);
					mvpRef.current = mvp;
					const frameView: FrameView = {
						mvp,
						view,
						projection,
						eye: camRef.current.eye,
						exposure: exposureRef.current,
						viewMode: viewModeRef.current,
						selected: selectedRef.current,
						hover: hoverRef.current,
					};
					lastFrameRef.current = frameView;
					const inputs = [
						...mvp,
						width,
						height,
						frameView.exposure,
						frameView.viewMode,
						frameView.selected,
						frameView.hover,
					].join();
					if (
						renderer.instancesChanged ||
						renderer.shadowDirty ||
						inputs !== shown
					) {
						shown = inputs;
						renderer.render(frameView);
						renderer.governor.frame(time);
						statusFrames++;
					}
					frame = requestAnimationFrame(draw);
				};
				resume = () => {
					if (frame || disposed || lost) return;
					// time spent away is not simulated
					lastTime = performance.now();
					frame = requestAnimationFrame(draw);
				};
				frame = requestAnimationFrame(draw);
			} catch (error) {
				const why = error instanceof Error ? error.message : String(error);
				// no renderer yet: the device itself would not start
				setFailure(
					renderer
						? `The 3D view could not start (${why}).`
						: `The 3D view needs WebGL 2, which this browser could not start (${why}).`,
				);
				setPhase("failed");
			}
		};
		// Defer one tick so React's development-only effect probe can cancel the
		// first mount before WebGL binds permanently to this canvas.
		const startTimer = window.setTimeout(() => void start(), 0);
		return () => {
			disposed = true;
			window.clearTimeout(startTimer);
			cancelAnimationFrame(frame);
			cancelAnimationFrame(hoverFrameRef.current);
			canvas.removeEventListener("webglcontextlost", onLost);
			canvas.removeEventListener("webglcontextrestored", onRestored);
			observer.disconnect();
			document.removeEventListener("visibilitychange", updateOnScreen);
			removeDevHooks?.();
			rendererRef.current = null;
			try {
				renderer?.destroy();
			} catch {
				// a lost device may already be gone
			}
		};
	}, [focusOn, selectRope, noteCamera, onRestart]);

	/* -------------------------------------------------------------------------
	   Picking: GPU id pass round the cursor, CPU ray test for depth/fallback
	   ------------------------------------------------------------------------- */

	/** A world-space ray through a canvas pixel. */
	const rayAt = useCallback(
		(clientX: number, clientY: number): [V3, V3] | null => {
			const canvas = canvasRef.current;
			if (!canvas) return null;
			const rect = canvas.getBoundingClientRect();
			const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
			const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
			const inv = new Matrix4(mvpRef.current).invert();
			const near = inv.transformAsPoint([nx, ny, -1]) as unknown as number[];
			const far = inv.transformAsPoint([nx, ny, 1]) as unknown as number[];
			const o: V3 = [near[0], near[1], near[2]];
			const d = normalize(sub([far[0], far[1], far[2]], o));
			return [o, d];
		},
		[],
	);

	/** World units per CSS pixel at unit depth, and the canvas height in CSS pixels. */
	const screenScale = useCallback((): [number, number] => {
		const height = canvasRef.current?.getBoundingClientRect().height ?? 1;
		return [(2 * Math.tan(FOVY / 2)) / Math.max(1, height), height];
	}, []);

	/** The cord under a pixel, within about `px` pixels, and how far away it is (CPU). */
	const pickUnder = useCallback(
		(clientX: number, clientY: number, px: number) => {
			const ray = rayAt(clientX, clientY);
			if (!ray) return null;
			const [perUnit] = screenScale();
			return {
				ray,
				pick: pickRope(modelRef.current, ray[0], ray[1], 0.02, perUnit * px),
			};
		},
		[rayAt, screenScale],
	);

	/**
	 * The cord drawn under a pixel (within `px` CSS pixels), from the GPU id
	 * pass: exact and occlusion-aware. Falls back to the CPU ray test if the
	 * id pass is unavailable or has failed once.
	 */
	const cordAt = useCallback(
		(clientX: number, clientY: number, px: number): Rope | null => {
			const renderer = rendererRef.current;
			const canvas = canvasRef.current;
			if (renderer && canvas && !gpuPickBrokenRef.current) {
				try {
					const rect = canvas.getBoundingClientRect();
					const [w, h] = renderer.drawingBufferSize();
					const kx = w / Math.max(1, rect.width);
					const ky = h / Math.max(1, rect.height);
					const id = renderer.pickAt(
						(clientX - rect.left) * kx,
						(clientY - rect.top) * ky,
						px * kx,
					);
					return id >= 0 ? (modelRef.current.ropes[id] ?? null) : null;
				} catch (error) {
					gpuPickBrokenRef.current = true;
					console.warn("GPU picking failed; using the ray test", error);
				}
			}
			return pickUnder(clientX, clientY, px)?.pick?.rope ?? null;
		},
		[pickUnder],
	);

	/**
	 * The world point under a pixel: on the cord there if one is close,
	 * otherwise at the khipu's depth along the ray.
	 */
	const pointUnder = useCallback(
		(clientX: number, clientY: number): V3 => {
			const cam = camRef.current;
			const under = pickUnder(clientX, clientY, 24);
			if (under?.pick)
				return add(cam.eye, scale(under.ray[1], under.pick.depth));
			const dir = under?.ray[1] ?? forwardOf(cam);
			const depth = Math.max(
				0.3,
				dot(sub(boundsCentre(modelRef.current), cam.eye), forwardOf(cam)),
			);
			return add(cam.eye, scale(dir, depth));
		},
		[pickUnder],
	);

	/** Show the hover tooltip and pointer cursor for a cord (or clear them). */
	const setHover = useCallback((rope: Rope | null) => {
		const id = rope ? rope.id : -1;
		if (hoverRef.current === id) return;
		hoverRef.current = id;
		setHovered(rope);
		const canvas = canvasRef.current;
		if (canvas) canvas.style.cursor = rope ? "pointer" : "";
	}, []);

	/** Place the tooltip beside the pointer, kept inside the canvas. */
	const moveTip = useCallback((clientX: number, clientY: number) => {
		const tip = tipRef.current;
		const wrap = wrapRef.current;
		if (!tip || !wrap) return;
		const box = wrap.getBoundingClientRect();
		const x = Math.min(
			clientX - box.left + 14,
			box.width - tip.offsetWidth - 8,
		);
		const y = clientY - box.top + 18;
		const flip = y + tip.offsetHeight > box.height - 8;
		tip.style.transform = `translate(${Math.max(8, x)}px, ${flip ? y - tip.offsetHeight - 30 : y}px)`;
	}, []);

	// hover picking: at most once per animation frame, only after the pointer
	// moved, never mid-drag
	const requestHover = useCallback(() => {
		if (hoverFrameRef.current) return;
		hoverFrameRef.current = requestAnimationFrame(() => {
			hoverFrameRef.current = 0;
			const at = pointerRef.current;
			if (!at || dragRef.current || pointersRef.current.size > 1) {
				setHover(null);
				return;
			}
			setHover(cordAt(at.x, at.y, HOVER_RADIUS));
			moveTip(at.x, at.y);
		});
	}, [cordAt, setHover, moveTip]);

	/* -------------------------------------------------------------------------
	   Camera gestures
	   ------------------------------------------------------------------------- */

	const resetCamera = useCallback(() => {
		const [w, h] = sizeRef.current;
		goalRef.current = fitCamera(modelRef.current, w / Math.max(1, h));
		velocityRef.current = [0, 0, 0];
		camTouchedRef.current = false;
		scheduleUrl();
	}, [scheduleUrl]);

	/** Slide the eye across the view so `pivot` follows a pointer moved by (dx, dy). */
	const slideBy = useCallback(
		(dx: number, dy: number, pivot: V3) => {
			const cam = camRef.current;
			const [perUnit] = screenScale();
			const perPixel = perUnit * distance(pivot, cam.eye);
			const right = rightOf(cam);
			const up = cross(right, forwardOf(cam));
			cam.eye = add(
				cam.eye,
				add(scale(right, -dx * perPixel), scale(up, dy * perPixel)),
			);
		},
		[screenScale],
	);

	/** Move the eye along the ray under a pixel by `share` of the distance to what is there. */
	const dollyAt = useCallback(
		(clientX: number, clientY: number, share: number) => {
			const under = pickUnder(clientX, clientY, 24);
			if (!under) return;
			const cam = camRef.current;
			goalRef.current = null;
			camTouchedRef.current = true;
			const reach = under.pick
				? under.pick.depth
				: distance(boundsCentre(modelRef.current), cam.eye);
			const s = Math.max(-0.5, Math.min(0.5, share));
			cam.eye = add(cam.eye, scale(under.ray[1], Math.max(0.3, reach) * s));
		},
		[pickUnder],
	);

	const pointerDown = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = event.currentTarget;
			canvas.setPointerCapture(event.pointerId);
			canvas.focus({ preventScroll: true });
			lastPointerTypeRef.current = event.pointerType;
			const pointers = pointersRef.current;
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			setHover(null);
			if (pointers.size === 2) {
				// a second finger: the one-finger look becomes pinch and pan
				dragRef.current = null;
				const [a, b] = [...pointers.values()];
				const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
				pinchRef.current = {
					mid,
					dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
					pivot: pointUnder(mid[0], mid[1]),
				};
				return;
			}
			if (pointers.size > 2) return;
			const mode: DragMode = event.altKey
				? "orbit"
				: event.button === 2 || event.button === 1 || event.shiftKey
					? "slide"
					: "look";
			dragRef.current = {
				x: event.clientX,
				y: event.clientY,
				startX: event.clientX,
				startY: event.clientY,
				mode,
				pivot:
					mode === "look"
						? camRef.current.eye
						: pointUnder(event.clientX, event.clientY),
				moved: false,
			};
		},
		[pointUnder, setHover],
	);

	/** Two fingers: pinch dollies along the ray through their midpoint, moving them slides. */
	const pinchMove = useCallback(() => {
		const pinch = pinchRef.current;
		if (!pinch) return;
		const [a, b] = [...pointersRef.current.values()];
		const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
		const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
		goalRef.current = null;
		camTouchedRef.current = true;
		slideBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1], pinch.pivot);
		dollyAt(mid[0], mid[1], dist / pinch.dist - 1);
		pinch.mid = mid;
		pinch.dist = dist;
		dismissIntro();
	}, [slideBy, dollyAt, dismissIntro]);

	// Dragging grabs the world: whatever is under the cursor follows it.
	const pointerMove = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const pointers = pointersRef.current;
			if (pointers.has(event.pointerId))
				pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (pinchRef.current && pointers.size >= 2) {
				pinchMove();
				return;
			}
			const drag = dragRef.current;
			if (!drag) {
				if (event.pointerType === "mouse" || event.pointerType === "pen") {
					pointerRef.current = { x: event.clientX, y: event.clientY };
					moveTip(event.clientX, event.clientY);
					requestHover();
				}
				return;
			}
			const dx = event.clientX - drag.x;
			const dy = event.clientY - drag.y;
			if (
				!drag.moved &&
				Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
					(event.pointerType === "touch" ? 8 : 3)
			) {
				drag.moved = true;
				camTouchedRef.current = true;
				dismissIntro();
			}
			if (!drag.moved) return;
			const cam = camRef.current;
			goalRef.current = null;
			const [, height] = screenScale();
			const radPerPx = (FOVY / height) * LOOK_GAIN;
			if (drag.mode === "look") {
				cam.yaw -= dx * radPerPx;
				cam.pitch = Math.max(
					-PITCH_LIMIT,
					Math.min(PITCH_LIMIT, cam.pitch + dy * radPerPx),
				);
			} else if (drag.mode === "slide") {
				slideBy(dx, dy, drag.pivot);
			} else {
				// orbit the point that was under the cursor: swing the eye round
				// it and turn the view by the same angles, so it stays put
				const turn = dx * radPerPx;
				const pitch = Math.max(
					-PITCH_LIMIT,
					Math.min(PITCH_LIMIT, cam.pitch - dy * radPerPx),
				);
				const tilt = pitch - cam.pitch;
				let offset = sub(cam.eye, drag.pivot);
				offset = rotateAbout(offset, WORLD_UP, -turn);
				offset = rotateAbout(
					offset,
					rightOf({ ...cam, yaw: cam.yaw + turn }),
					tilt,
				);
				cam.eye = add(drag.pivot, offset);
				cam.yaw += turn;
				cam.pitch = pitch;
			}
			drag.x = event.clientX;
			drag.y = event.clientY;
		},
		[screenScale, slideBy, pinchMove, moveTip, requestHover, dismissIntro],
	);

	/** A tap or click that did not drag: select what is under it; a double tap focuses. */
	const tapAt = useCallback(
		(clientX: number, clientY: number, touch: boolean) => {
			const rope = cordAt(clientX, clientY, touch ? 16 : CLICK_RADIUS);
			if (touch) {
				const last = lastTapRef.current;
				const now = performance.now();
				if (
					last &&
					now - last.time < DOUBLE_TAP_MS &&
					Math.hypot(clientX - last.x, clientY - last.y) < DOUBLE_TAP_PX
				) {
					lastTapRef.current = null;
					window.clearTimeout(deselectTimerRef.current);
					if (rope) selectRope(rope, "always");
					else resetCamera();
					return;
				}
				lastTapRef.current = { time: now, x: clientX, y: clientY };
			}
			window.clearTimeout(deselectTimerRef.current);
			if (rope) selectRope(rope);
			// a click on empty space deselects, unless it turns out to be the
			// first half of a double-click (which resets the view and keeps it)
			else
				deselectTimerRef.current = window.setTimeout(
					() => selectRope(null),
					DOUBLE_TAP_MS,
				);
		},
		[cordAt, selectRope, resetCamera],
	);

	const pointerUp = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const pointers = pointersRef.current;
			pointers.delete(event.pointerId);
			if (pinchRef.current) {
				// the gesture ends with the pinch; a finger left behind does not drag
				if (pointers.size < 2) pinchRef.current = null;
				dragRef.current = null;
				return;
			}
			const drag = dragRef.current;
			dragRef.current = null;
			if (drag && !drag.moved && event.button === 0)
				tapAt(event.clientX, event.clientY, event.pointerType === "touch");
		},
		[tapAt],
	);

	const pointerCancel = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			pointersRef.current.delete(event.pointerId);
			if (pointersRef.current.size < 2) pinchRef.current = null;
			dragRef.current = null;
		},
		[],
	);

	// double-click a cord to select and fly to it; on empty space, the whole view
	const doubleClick = useCallback(
		(event: React.MouseEvent<HTMLCanvasElement>) => {
			if (lastPointerTypeRef.current === "touch") return; // see tapAt
			window.clearTimeout(deselectTimerRef.current);
			const rope = cordAt(event.clientX, event.clientY, CLICK_RADIUS);
			if (rope) selectRope(rope, "always");
			else resetCamera();
		},
		[cordAt, selectRope, resetCamera],
	);

	// scrolling moves the eye along the line of sight under the cursor, by a
	// share of the distance to whatever is there; React's onWheel is passive
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			dismissIntro();
			const lines =
				event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
			dollyAt(event.clientX, event.clientY, -event.deltaY * lines * 0.0012);
		};
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", onWheel);
	}, [dollyAt, dismissIntro]);

	/* -------------------------------------------------------------------------
	   Keyboard: flight keys, cord navigation, shortcuts
	   ------------------------------------------------------------------------- */

	const stepCord = useCallback(
		(delta: number) => {
			const index = selected ? order.indexOf(selected) : -1;
			const next =
				index < 0
					? delta > 0
						? 0
						: order.length - 1
					: (index + delta + order.length) % order.length;
			if (order[next]) selectRope(order[next], "if-hidden");
		},
		[order, selected, selectRope],
	);

	const keyDown = useCallback(
		(event: React.KeyboardEvent<HTMLCanvasElement>) => {
			if (event.metaKey || event.ctrlKey) return;
			if (NAV_KEYS.has(event.code) && !event.altKey) {
				event.preventDefault();
				keysRef.current.add(event.code);
				if (!event.code.startsWith("Shift")) {
					camTouchedRef.current = true;
					dismissIntro();
				}
				return;
			}
			const parent =
				selected?.parentId != null
					? modelRef.current.ropes[selected.parentId]
					: undefined;
			const firstChild = selected ? children.get(selected.id)?.[0] : undefined;
			let handled = true;
			switch (event.key) {
				case "]":
				case ".":
					stepCord(1);
					break;
				case "[":
				case ",":
					stepCord(-1);
					break;
				case "Enter":
				case "f":
				case "F":
					if (selected) focusOn(selected);
					break;
				case "Escape":
					if (helpRef.current === "sheet") showHelp(null);
					else setSelected(null);
					break;
				case "u":
				case "U":
					if (parent) selectRope(parent, "if-hidden");
					break;
				case "i":
				case "I":
					if (firstChild) selectRope(firstChild, "if-hidden");
					break;
				case "?":
					showHelp(helpRef.current === "sheet" ? null : "sheet");
					break;
				default:
					handled = false;
			}
			if (handled) {
				event.preventDefault();
				dismissIntro();
			}
		},
		[selected, children, stepCord, focusOn, selectRope, showHelp, dismissIntro],
	);

	/* -------------------------------------------------------------------------
	   Screenshot
	   ------------------------------------------------------------------------- */

	const saveImage = useCallback(async () => {
		const renderer = rendererRef.current;
		const frame = lastFrameRef.current;
		if (!renderer || !frame) return;
		setSaving(true);
		try {
			const blob = await renderer.capture(frame);
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${khipu.id}${selected ? `-${selected.name}` : ""}.png`;
			document.body.append(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 2000);
		} catch (error) {
			console.warn("could not save the image", error);
		} finally {
			setSaving(false);
		}
	}, [khipu.id, selected]);

	/* -------------------------------------------------------------------------
	   Interface
	   ------------------------------------------------------------------------- */

	const legend = useMemo(() => {
		if (viewMode === 1)
			return [
				["single", "#fa6b2e"],
				["long", "#dbad4d"],
				["figure-eight", "#e6ebe0"],
				["other", "#9e8cd9"],
				["stopper", "#8c9e99"],
			];
		if (viewMode === 2)
			return [
				["recto", "#40c7b8"],
				["verso", "#fa8c33"],
				["not recorded", "#9e9e99"],
				["cord end", "#bf9ed9"],
			];
		return [
			["S-plied  \\", "#c9a469"],
			["Z-plied  /", "#c9a469"],
		];
	}, [viewMode]);

	const cord = selected?.cord;
	const attach = cord ? describeAttachment(cord) : null;
	const twist = cord ? describeTwist(cord) : null;
	const term = cord ? describeTermination(cord) : null;
	const parent =
		selected?.parentId != null
			? modelRef.current.ropes[selected.parentId]
			: undefined;
	const subs = selected ? (children.get(selected.id) ?? []) : [];

	const announcement = useMemo(() => {
		if (!selected) return "";
		const c = selected.cord;
		const value = c.value != null ? `, value ${c.value.toLocaleString()}` : "";
		return `${cordKindLabel(c)} ${c.name}, ${order.indexOf(selected) + 1} of ${order.length}, ${describeColor(c.colorParsed, colors)}${value}`;
	}, [selected, order, colors]);

	const hoverText = hovered
		? [
				hovered.cord.name,
				describeColor(hovered.cord.colorParsed, colors),
				hovered.cord.value != null ? hovered.cord.value.toLocaleString() : "",
			]
				.filter(Boolean)
				.join(" · ")
		: "";

	const controlsList = isTouch ? (
		<ul>
			<li>
				<b>Drag</b> look around
			</li>
			<li>
				<b>Pinch</b> move closer
			</li>
			<li>
				<b>Two fingers</b> slide
			</li>
			<li>
				<b>Tap</b> read a cord
			</li>
			<li>
				<b>Double tap</b> fly to it
			</li>
		</ul>
	) : (
		<ul>
			<li>
				<b>Drag</b> look around
			</li>
			<li>
				<b>Scroll</b> move toward the cursor
			</li>
			<li>
				<b>W A S D · Q E</b> fly (Shift: fast)
			</li>
			<li>
				<b>Shift-drag</b> slide
			</li>
			<li>
				<b>Alt-drag</b> orbit the point under the cursor
			</li>
			<li>
				<b>Click</b> read a cord · <b>double-click</b> fly to it
			</li>
		</ul>
	);

	return (
		<div className="luma-lab-shell">
			<div className="luma-lab-canvas-wrap" ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="luma-lab-canvas"
					tabIndex={0}
					onPointerDown={pointerDown}
					onPointerMove={pointerMove}
					onPointerUp={pointerUp}
					onPointerCancel={pointerCancel}
					onPointerLeave={() => {
						pointerRef.current = null;
						if (!dragRef.current) setHover(null);
					}}
					onContextMenu={(event) => event.preventDefault()}
					onKeyDown={keyDown}
					onKeyUp={(event) => {
						keysRef.current.delete(event.code);
					}}
					onBlur={() => {
						keysRef.current.clear();
					}}
					onDoubleClick={doubleClick}
					aria-label={`Khipu ${khipu.id}, 3D view`}
					aria-describedby={describedBy}
				/>
				<p id={describedBy} className="sr-only">
					Drag to look around; W A S D and Q E fly; scroll moves toward the
					cursor. Click a cord to read its record. Square brackets step to the
					previous or next cord, U goes to its parent, I to its first
					subsidiary, F or Enter flies to it, Escape deselects, and the question
					mark lists every control.
				</p>
				<output className="sr-only" aria-live="polite">
					{announcement}
				</output>

				<div
					className={`luma-lab-tip${hovered && hovered !== selected ? "" : " is-hidden"}`}
					ref={tipRef}
					aria-hidden="true"
				>
					{hoverText}
				</div>

				<div className="luma-lab-knot-key" aria-hidden="true">
					{legend.map(([label, color]) => (
						<span key={label}>
							<i style={{ background: color }} /> {label}
						</span>
					))}
				</div>

				<button
					type="button"
					className="luma-lab-help-button"
					aria-label="Controls and keyboard shortcuts"
					aria-expanded={help === "sheet"}
					onClick={() => showHelp(help === "sheet" ? null : "sheet")}
				>
					?
				</button>

				{help === "intro" && (
					<div
						className={`luma-lab-help luma-lab-help-intro${introFading ? " is-fading" : ""}`}
						aria-hidden="true"
					>
						<strong className="luma-lab-help-title">
							{isTouch ? "Gestures" : "Controls"}
						</strong>
						{controlsList}
					</div>
				)}
				{help === "sheet" && (
					<section
						className="luma-lab-help luma-lab-help-sheet"
						aria-label="Controls"
					>
						<button
							type="button"
							className="luma-lab-help-close"
							onClick={() => showHelp(null)}
							aria-label="Close"
						>
							×
						</button>
						<strong className="luma-lab-help-title">
							{isTouch ? "Gestures" : "Controls"}
						</strong>
						{controlsList}
						{!isTouch && (
							<>
								<strong className="luma-lab-help-title">
									Keys (click the view first)
								</strong>
								<ul>
									<li>
										<b>[ ]</b> or <b>, .</b> previous / next cord
									</li>
									<li>
										<b>U</b> parent cord · <b>I</b> first subsidiary
									</li>
									<li>
										<b>F</b> or <b>Enter</b> fly to the selected cord
									</li>
									<li>
										<b>Esc</b> deselect · <b>?</b> this sheet
									</li>
								</ul>
							</>
						)}
					</section>
				)}

				{phase !== "ready" && (
					<output className="luma-lab-overlay">
						{phase === "starting" && (
							<span className="luma-lab-overlay-busy">Settling cords…</span>
						)}
						{phase === "lost" && (
							<>
								<span>The graphics context was lost.</span>
								<button type="button" onClick={onRestart}>
									Restart the renderer
								</button>
							</>
						)}
						{phase === "failed" && <span>{failure}</span>}
					</output>
				)}

				<nav className="luma-lab-cordlist" aria-label={`Cords of ${khipu.id}`}>
					<ul>
						{order.map((rope) => (
							<li key={rope.id}>
								<button
									type="button"
									aria-current={rope === selected ? "true" : undefined}
									onClick={() => selectRope(rope, "always")}
								>
									{rope.name}
									{rope.cord.value != null
										? `, ${rope.cord.value.toLocaleString()}`
										: ""}
								</button>
							</li>
						))}
					</ul>
				</nav>

				{selected && cord && (
					<aside
						ref={panelRef}
						className={`luma-lab-panel${panelOpen ? "" : " is-collapsed"}`}
						aria-label={`Cord ${cord.name}`}
					>
						<header>
							<span className="luma-lab-panel-kicker">
								{cordKindLabel(cord)}
							</span>
							<strong>{cord.name}</strong>
							{cord.value != null && (
								<span className="luma-lab-panel-value">
									{cord.value.toLocaleString()}
								</span>
							)}
							<div className="luma-lab-panel-actions">
								<button type="button" onClick={() => focusOn(selected)}>
									Focus
								</button>
								<button
									type="button"
									onClick={() => setPanelOpen((open) => !open)}
									aria-expanded={panelOpen}
									aria-label={panelOpen ? "Hide details" : "Show details"}
								>
									{panelOpen ? "–" : "+"}
								</button>
								<button
									type="button"
									onClick={() => setSelected(null)}
									aria-label="Close"
								>
									×
								</button>
							</div>
						</header>
						{panelOpen && (
							<>
								<dl>
									<dt>Colour</dt>
									<dd>{describeColor(cord.colorParsed, colors)}</dd>
									<dt>Ply</dt>
									<dd title={twist?.how || undefined}>{twist?.label}</dd>
									<dt>Hitch</dt>
									<dd title={attach?.how || undefined}>
										{attach?.label}
										{cord.pos != null ? ` @ ${cord.pos} cm` : ""}
									</dd>
									<dt>Length</dt>
									<dd>{formatCm(cord.length)}</dd>
									<dt>End</dt>
									<dd title={term?.how || undefined}>{term?.label}</dd>
									<dt>Knots</dt>
									<dd>
										{cord.knots.length === 0 ? (
											"none"
										) : (
											<ol className="luma-lab-knots">
												{cord.knots.map((k, i) => (
													// biome-ignore lint/suspicious/noArrayIndexKey: positional record
													<li key={i} title={knotTitle(k)}>
														{knotLine(k)}
													</li>
												))}
											</ol>
										)}
									</dd>
								</dl>
								{(parent || subs.length > 0) && (
									<p className="luma-lab-relations">
										{parent && (
											<span>
												Subsidiary of{" "}
												<button
													type="button"
													onClick={() => selectRope(parent, "if-hidden")}
												>
													{parent.name}
												</button>
											</span>
										)}
										{subs.length > 0 && (
											<span>
												{subs.length}{" "}
												{subs.length === 1 ? "subsidiary" : "subsidiaries"}:{" "}
												{subs.map((s) => (
													<button
														key={s.id}
														type="button"
														onClick={() => selectRope(s, "if-hidden")}
													>
														{s.name}
													</button>
												))}
											</span>
										)}
									</p>
								)}
								<Link
									className="luma-lab-diagram-link"
									to="/khipus/$id"
									params={{ id: khipu.id }}
								>
									Open {khipu.id} in the diagram →
								</Link>
							</>
						)}
					</aside>
				)}
			</div>
			<div className="luma-lab-controls">
				<span className="sr-only">Physics controls</span>
				<label>
					<span>
						Gravity <output>{gravity.toFixed(1)} m/s²</output>
					</span>
					<input
						type="range"
						min="0"
						max="14"
						step="0.1"
						value={gravity}
						onChange={(event) => setGravity(Number(event.target.value))}
					/>
				</label>
				<label>
					<span>
						Andean wind <output>{wind.toFixed(1)}</output>
					</span>
					<input
						type="range"
						min="0"
						max="8"
						step="0.1"
						value={wind}
						onChange={(event) => setWind(Number(event.target.value))}
					/>
				</label>
				<label>
					<span>
						Light <output>{exposure.toFixed(2)}</output>
					</span>
					<input
						type="range"
						min="0.65"
						max="1.6"
						step="0.01"
						value={exposure}
						onChange={(event) => setExposure(Number(event.target.value))}
					/>
				</label>
				<fieldset className="luma-lab-view">
					<legend className="sr-only">Rendering mode</legend>
					{VIEW_MODES.map((label, index) => (
						<button
							key={label}
							type="button"
							className={viewMode === index ? "active" : undefined}
							onClick={() => setViewMode(index)}
						>
							{label}
						</button>
					))}
				</fieldset>
				<div className="luma-lab-actions">
					<button type="button" onClick={() => setPaused((value) => !value)}>
						{paused ? "Resume" : "Freeze"}
					</button>
					<button type="button" onClick={() => resetRopes(modelRef.current)}>
						Reset fall
					</button>
					<button type="button" onClick={resetCamera}>
						Reset view
					</button>
					<button
						type="button"
						onClick={() => void saveImage()}
						disabled={phase !== "ready" || saving}
					>
						Save image
					</button>
				</div>
			</div>
			<div className="luma-lab-status">
				<span className={`luma-lab-live${paused ? " is-paused" : ""}`}>
					<i aria-hidden="true" />{" "}
					{paused ? "Solver frozen" : "Live constraint solver"}
				</span>
				<span>{status}</span>
				{gpuName && (
					<details className="luma-lab-gpu">
						<summary>GPU</summary>
						<span>{gpuName}</span>
					</details>
				)}
			</div>
			<p className="luma-lab-primary-note">
				Primary cord: {describeColor(khipu.primary.colorParsed, colors)},{" "}
				{khipu.primary.twist === "S"
					? "S-plied"
					: khipu.primary.twist === "Z"
						? "Z-plied"
						: "twist not recorded"}
				, {describePrimaryEnds(khipu.primary)}.
			</p>
		</div>
	);
}
