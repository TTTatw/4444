import { useState, useCallback, useEffect, useRef } from 'react';
import { Point } from '../types';

export const useCanvasInteraction = () => {
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1.0);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);

    const clampZoom = (z: number) => Math.min(Math.max(0.2, z), 2);

    // Prevent browser-level zoom (Ctrl + wheel / Ctrl + +/-)
    useEffect(() => {
        const preventBrowserZoom = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };
        const preventKeyZoom = (e: KeyboardEvent) => {
            if (e.ctrlKey && ['=', '+', '-', '0'].includes(e.key)) {
                e.preventDefault();
            }
        };
        window.addEventListener('wheel', preventBrowserZoom, { passive: false });
        window.addEventListener('keydown', preventKeyZoom, { passive: false });
        return () => {
            window.removeEventListener('wheel', preventBrowserZoom);
            window.removeEventListener('keydown', preventKeyZoom);
        };
    }, []);

    // Use refs to access current state in event handlers without re-binding
    const zoomRef = useRef(zoom);
    const panRef = useRef(pan);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
        panRef.current = pan;
    }, [pan]);

    const zoomAroundPoint = useCallback((zoomDelta: number, pointer: { x: number; y: number }) => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const center = pointer;
        // Note: pointer is already relative to viewport (clientX/Y) or calculated correctly?
        // In handleWheel, we pass: x: pointer.x + rect.left, y: pointer.y + rect.top
        // which is clientX/Y.

        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const canvasPos = { x: center.x - (rect?.left || 0), y: center.y - (rect?.top || 0) };

        const newZoom = clampZoom(currentZoom + zoomDelta);

        if (newZoom === currentZoom) return;

        const worldX = (canvasPos.x - currentPan.x) / currentZoom;
        const worldY = (canvasPos.y - currentPan.y) / currentZoom;

        const newPan = {
            x: canvasPos.x - worldX * newZoom,
            y: canvasPos.y - worldY * newZoom,
        };

        setPan(newPan);
        setZoom(newZoom);
    }, [canvas]);

    // Handle Wheel Zoom & Pan
    useEffect(() => {
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            // 1. Handle Zoom (Ctrl + Wheel) - Always zoom canvas, prevent browser zoom
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = canvas?.getBoundingClientRect();
                if (!rect) return;

                const pointer = { x: e.clientX, y: e.clientY };
                const scale = e.deltaY * -0.001;
                zoomAroundPoint(scale, pointer);
                return;
            }

            // 2. Handle Scroll/Pan
            // Check if the target is an input/textarea or a scrollable element (marked by custom-scrollbar class)
            const target = e.target as Element;
            const isInput = ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName);
            const isScrollable = target.closest('.custom-scrollbar');

            if (isInput || isScrollable) {
                // Allow native scrolling behavior for these elements
                return;
            }

            // 3. Prevent default behavior for everything else (Canvas background)
            // This effectively disables "Pan on Wheel" and browser scrolling on the canvas
            e.preventDefault();
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [zoomAroundPoint, container, canvas]);

    // Helper: Screen to World
    const screenToWorld = useCallback((screenPos: Point) => {
        return {
            x: (screenPos.x - pan.x) / zoom,
            y: (screenPos.y - pan.y) / zoom,
        };
    }, [pan, zoom]);

    return {
        pan,
        setPan,
        zoom,
        setZoom,
        container,
        setContainer,
        setContainerRef: setContainer, // Alias for App.tsx compatibility
        canvas,
        setCanvas,
        setCanvasRef: setCanvas, // Alias for App.tsx compatibility
        zoomAroundPoint,
        screenToWorld
    };
};
