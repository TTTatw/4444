import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Group, Point } from '../types';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../constants';

type SnapLine = { type: 'v' | 'h'; x1: number; y1: number; x2: number; y2: number; };

interface UseNodeDragProps {
    nodes: Node[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    groups: Group[];
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    pan: Point;
    zoom: number;
    setSnapLines: React.Dispatch<React.SetStateAction<SnapLine[]>>;
    recordHistory: () => void;
}

export const useNodeDrag = ({
    nodes,
    setNodes,
    groups,
    setGroups,
    pan,
    zoom,
    setSnapLines,
    recordHistory
}: UseNodeDragProps) => {
    const dragStateRef = useRef<{ id: string; offset: Point } | null>(null);
    const groupDragRef = useRef<{ id: string; offset: Point; initialGroupPosition: Point; initialNodePositions: Record<string, Point> } | null>(null);
    const hasDraggedRef = useRef(false);
    const [isDraggingNode, setIsDraggingNode] = useState(false);

    // We need refs for nodes and groups to access latest state in event handlers without re-binding
    const nodesRef = useRef(nodes);
    const groupsRef = useRef(groups);

    useEffect(() => {
        nodesRef.current = nodes;
        groupsRef.current = groups;
    }, [nodes, groups]);

    const startNodeDrag = useCallback((nodeId: string, e: React.MouseEvent) => {
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (!node) return;

        dragStateRef.current = {
            id: nodeId,
            offset: {
                x: e.clientX - (node.position.x * zoom + pan.x),
                y: e.clientY - (node.position.y * zoom + pan.y),
            }
        };
        hasDraggedRef.current = false;
        setIsDraggingNode(true);
    }, [pan, zoom]);

    const startGroupDrag = useCallback((groupId: string, e: React.MouseEvent) => {
        const group = groupsRef.current.find(g => g.id === groupId);
        if (!group) return;

        const canvasX = (e.clientX - pan.x) / zoom;
        const canvasY = (e.clientY - pan.y) / zoom;

        const initialNodePositions: Record<string, Point> = {};
        group.nodeIds.forEach(nodeId => {
            const node = nodesRef.current.find(n => n.id === nodeId);
            if (node) {
                initialNodePositions[nodeId] = { ...node.position };
            }
        });

        groupDragRef.current = {
            id: groupId,
            offset: {
                x: canvasX - group.position.x,
                y: canvasY - group.position.y,
            },
            initialGroupPosition: { ...group.position },
            initialNodePositions
        };
        hasDraggedRef.current = false;
        setIsDraggingNode(true);
    }, [pan, zoom]);

    const handleDrag = useCallback((e: MouseEvent) => {
        if (groupDragRef.current) {
            const drag = groupDragRef.current;
            const group = groupsRef.current.find(g => g.id === drag.id);
            if (!group) return;

            const canvasX = (e.clientX - pan.x) / zoom;
            const canvasY = (e.clientY - pan.y) / zoom;
            const newX = canvasX - drag.offset.x;
            const newY = canvasY - drag.offset.y;

            const totalDeltaX = newX - drag.initialGroupPosition.x;
            const totalDeltaY = newY - drag.initialGroupPosition.y;

            if (Math.abs(totalDeltaX) > 0 || Math.abs(totalDeltaY) > 0) {
                if (!hasDraggedRef.current) recordHistory();
                hasDraggedRef.current = true;
                setGroups(gs => gs.map(g => g.id === drag.id ? { ...g, position: { x: newX, y: newY } } : g));
                setNodes(ns => ns.map(n => {
                    if (drag.initialNodePositions[n.id]) {
                        return {
                            ...n,
                            position: {
                                x: drag.initialNodePositions[n.id].x + totalDeltaX,
                                y: drag.initialNodePositions[n.id].y + totalDeltaY
                            }
                        };
                    }
                    return n;
                }));
            }
        } else if (dragStateRef.current) {
            if (!hasDraggedRef.current) recordHistory();
            hasDraggedRef.current = true;
            const { id, offset } = dragStateRef.current;
            let newPos = {
                x: (e.clientX - pan.x - offset.x) / zoom,
                y: (e.clientY - pan.y - offset.y) / zoom,
            };

            const SNAP_THRESHOLD = 8 / zoom;
            const currentLines: SnapLine[] = [];
            const draggedNode = nodesRef.current.find(n => n.id === id);
            if (!draggedNode) return;

            const otherNodes = nodesRef.current.filter(n => n.id !== id && !n.selected);
            const draggedNodeWidth = draggedNode.width || DEFAULT_NODE_WIDTH;
            const draggedNodeHeight = draggedNode.height || DEFAULT_NODE_HEIGHT;

            const draggedPoints = {
                v: [newPos.x, newPos.x + draggedNodeWidth / 2, newPos.x + draggedNodeWidth],
                h: [newPos.y, newPos.y + draggedNodeHeight / 2, newPos.y + draggedNodeHeight],
            };

            let snappedX = false, snappedY = false;

            for (const otherNode of otherNodes) {
                const otherNodeWidth = otherNode.width || DEFAULT_NODE_WIDTH;
                const otherNodeHeight = otherNode.height || DEFAULT_NODE_HEIGHT;

                const otherPoints = {
                    v: [otherNode.position.x, otherNode.position.x + otherNodeWidth / 2, otherNode.position.x + otherNodeWidth],
                    h: [otherNode.position.y, otherNode.position.y + otherNodeHeight / 2, otherNode.position.y + otherNodeHeight],
                };

                if (!snappedX) {
                    for (const dp of draggedPoints.v) {
                        for (const op of otherPoints.v) {
                            if (Math.abs(dp - op) < SNAP_THRESHOLD) {
                                newPos.x += op - dp;
                                const lineY1 = Math.min(newPos.y, otherNode.position.y);
                                const lineY2 = Math.max(newPos.y + draggedNodeHeight, otherNode.position.y + otherNodeHeight);
                                currentLines.push({ type: 'v', x1: op, y1: lineY1 - 20, x2: op, y2: lineY2 + 20 });
                                snappedX = true; break;
                            }
                        }
                        if (snappedX) break;
                    }
                }
                if (!snappedY) {
                    for (const dp of draggedPoints.h) {
                        for (const op of otherPoints.h) {
                            if (Math.abs(dp - op) < SNAP_THRESHOLD) {
                                newPos.y += op - dp;
                                const lineX1 = Math.min(newPos.x, otherNode.position.x);
                                const lineX2 = Math.max(newPos.x + draggedNodeWidth, otherNode.position.x + otherNodeWidth);
                                currentLines.push({ type: 'h', x1: lineX1 - 20, y1: op, x2: lineX2 + 20, y2: op });
                                snappedY = true; break;
                            }
                        }
                        if (snappedY) break;
                    }
                }
            }
            setSnapLines(currentLines);
            setNodes(ns => ns.map(n => n.id === id ? { ...n, position: newPos } : n));
        }
    }, [pan, zoom, setNodes, setGroups, setSnapLines, recordHistory]);

    const endDrag = useCallback(() => {
        dragStateRef.current = null;
        groupDragRef.current = null;
        setSnapLines([]);
        setIsDraggingNode(false);
    }, [setSnapLines]);

    return {
        dragStateRef,
        groupDragRef,
        hasDraggedRef,
        startNodeDrag,
        startGroupDrag,
        handleDrag,
        endDrag,
        isDraggingNode
    };
};
