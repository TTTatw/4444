import React, { useState, useRef, useCallback } from 'react';
import { Node, Group, Point } from '../types';

interface UseSelectionProps {
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

export const useSelection = ({ setNodes, setGroups }: UseSelectionProps) => {
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [activeConnectionIds, setActiveConnectionIds] = useState<Set<string>>(new Set());
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

    // We use a ref for isSelecting to avoid re-renders during mouse move, similar to original interactionState
    const isSelectingRef = useRef(false);
    const selectionStartPointRef = useRef<Point>({ x: 0, y: 0 });

    const deselectAll = useCallback(() => {
        setNodes(ns => ns.map(n => ({ ...n, selected: false })));
        setGroups(gs => gs.map(g => ({ ...g, selected: false })));
        setSelectedConnectionId(null);
        setActiveNodeId(null);
    }, [setNodes, setGroups]);

    const selectNode = useCallback((id: string, multi: boolean) => {
        setNodes(ns => ns.map(n => {
            if (n.id === id) {
                return { ...n, selected: multi ? !n.selected : true };
            }
            return { ...n, selected: multi ? n.selected : false };
        }));
        if (!multi) {
            setGroups(gs => gs.map(g => ({ ...g, selected: false })));
            setSelectedConnectionId(null);
        }
        setActiveNodeId(id);
    }, [setNodes, setGroups]);

    const selectGroup = useCallback((id: string, multi: boolean) => {
        setGroups(gs => gs.map(g => {
            if (g.id === id) {
                return { ...g, selected: multi ? !g.selected : true };
            }
            return { ...g, selected: multi ? g.selected : false };
        }));
        if (!multi) {
            setNodes(ns => ns.map(n => ({ ...n, selected: false })));
            setSelectedConnectionId(null);
        }
    }, [setNodes, setGroups]);

    const startSelection = useCallback((point: Point) => {
        isSelectingRef.current = true;
        selectionStartPointRef.current = point;
        setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
    }, []);

    const updateSelection = useCallback((point: Point) => {
        if (!isSelectingRef.current) return;
        const start = selectionStartPointRef.current;
        setSelectionBox({
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(start.x - point.x),
            height: Math.abs(start.y - point.y),
        });
    }, []);

    const endSelection = useCallback((nodes: Node[], groups: Group[], isCtrlPressed: boolean) => {
        if (!isSelectingRef.current) return;
        isSelectingRef.current = false;

        if (selectionBox && selectionBox.width > 0 && selectionBox.height > 0) {
            const selectedNodeIds = new Set(isCtrlPressed ? nodes.filter(n => n.selected).map(n => n.id) : []);
            const selectedGroupIds = new Set(isCtrlPressed ? groups.filter(g => g.selected).map(g => g.id) : []);

            const checkIntersection = (elemRect: DOMRect) =>
                elemRect.x < selectionBox.x + selectionBox.width &&
                elemRect.x + elemRect.width > selectionBox.x &&
                elemRect.y < selectionBox.y + selectionBox.height &&
                elemRect.y + elemRect.height > selectionBox.y;

            nodes.forEach(n => {
                const elem = document.getElementById(n.id);
                if (elem && checkIntersection(elem.getBoundingClientRect())) selectedNodeIds.add(n.id);
            });
            groups.forEach(g => {
                const elem = document.getElementById(`group-${g.id}`);
                if (elem && checkIntersection(elem.getBoundingClientRect())) selectedGroupIds.add(g.id);
            });

            setNodes(ns => ns.map(n => ({ ...n, selected: selectedNodeIds.has(n.id) })));
            setGroups(gs => gs.map(g => ({ ...g, selected: selectedGroupIds.has(g.id) })));
        }
        setSelectionBox(null);
    }, [selectionBox, setNodes, setGroups]);

    return {
        selectionBox,
        setSelectionBox,
        selectedConnectionId,
        setSelectedConnectionId,
        activeConnectionIds,
        setActiveConnectionIds,
        activeNodeId,
        setActiveNodeId,
        isSelectingRef,
        deselectAll,
        selectNode,
        selectGroup,
        startSelection,
        updateSelection,
        endSelection
    };
};
