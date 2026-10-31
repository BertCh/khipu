import { useEffect, useRef, useState } from "react";

/** Width of a container element, kept up to date with ResizeObserver. */
export function useMeasure<T extends HTMLElement>(initial = 640) {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const w = entry.contentRect.width;
			if (w > 0) setWidth(w);
		});
		ro.observe(el);
		setWidth(el.clientWidth || initial);
		return () => ro.disconnect();
	}, [initial]);
	return { ref, width };
}
