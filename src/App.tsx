
import React, { useState, useCallback, useRef, MouseEvent, useMemo, useEffect } from 'react';
import { NodeComponent } from './components/NodeComponent';
import { ContextMenu } from './components/ContextMenu';
import { Connection } from './components/Connection';
import { GroupComponent } from './components/GroupComponent';
import { SelectionToolbar } from './components/SelectionToolbar';
import { ViewerModal } from './components/ViewerModal';
import { WorkflowToolbar } from './components/WorkflowToolbar';
import { HistoryTray } from './components/HistoryTray';
import { HistoryDetailModal } from './components/HistoryDetailModal';
import { SaveAssetModal } from './components/SaveAssetModal';
import { AssetLibrary } from './components/AssetLibrary';
import type { Node, Connection as ConnectionType, Point, ContextMenu as ContextMenuType, Group, NodeType, HistoryItem, WorkflowAsset, SerializedNode, SerializedConnection, NodeStatus } from './types';
import { runNode } from './services/geminiService';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from './constants';

const TextIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M17 6.1H3" /><path d="M21 12.1H3" /><path d="M15.1 18.1H3" /></svg>
);

const ImageIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
);

type SnapLine = { type: 'v' | 'h'; x1: number; y1: number; x2: number; y2: number; };

// Define state interface for history
interface CanvasState {
    nodes: Node[];
    connections: ConnectionType[];
    groups: Group[];
}

const App: React.FC = () => {
    // console.log('App component rendering...');
    // Core State
    const [nodes, setNodes] = useState<Node[]>([]);
    const [connections, setConnections] = useState<ConnectionType[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [assets, setAssets] = useState<WorkflowAsset[]>([]);

    // Undo/Redo State
    const [past, setPast] = useState<CanvasState[]>([]);
    const [future, setFuture] = useState<CanvasState[]>([]);
    const MAX_HISTORY = 10;

    // Clipboard
    const clipboard = useRef<CanvasState | null>(null);

    // Canvas Interaction State
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isDraggingNode, setIsDraggingNode] = useState(false);
    const interactionState = useRef({
        isPanning: false,
        isSelecting: false,
        hasDragged: false,
        startPanPoint: { x: 0, y: 0 },
        dragStart: { x: 0, y: 0 }
    });
    const selectionStartPointRef = useRef<Point>({ x: 0, y: 0 });

    // UI State
    const [contextMenu, setContextMenu] = useState<ContextMenuType | null>(null);
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    const [drawingConnection, setDrawingConnection] = useState<{ from?: string; to?: string; } | null>(null);
    const [previewConnection, setPreviewConnection] = useState<{ start: Point; end: Point } | null>(null);
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [activeConnectionIds, setActiveConnectionIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<string | null>(null);
    const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

    // Modals & Trays State
    const [viewerContent, setViewerContent] = useState<{ type: NodeType, content: string, name: string } | null>(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
    const [isSaveAssetModalOpen, setIsSaveAssetModalOpen] = useState(false);
    const [groupToSave, setGroupToSave] = useState<Group | null>(null);

    // Refs
    const canvasRef = useRef<HTMLDivElement>(null);
    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const groupsRef = useRef(groups);
    const dragStateRef = useRef<{ id: string; offset: Point } | null>(null);
    const onMouseMoveRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);
    const onMouseUpRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);

    // Update refs when state changes
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);
    useEffect(() => { groupsRef.current = groups; }, [groups]);

    // Derived State (Memoized for performance)
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId), [nodes, activeNodeId]);
    const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes]);
    const selectedGroups = useMemo(() => groups.filter(g => g.selected), [groups]);
    const generatedNodeIds = useMemo(() => new Set(connections.map(c => c.to)), [connections]);
    const selectionType = useMemo(() => {
        if (selectedGroups.length > 0) return 'group';
        if (selectedNodes.filter(n => !n.groupId).length > 1) return 'node';
        return 'none';
    }, [selectedGroups, selectedNodes]);

    // --- Undo/Redo System ---
    const recordHistory = useCallback(() => {
        setPast(p => {
            const newState = {
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                groups: groupsRef.current
            };
            const newPast = [...p, newState];
            if (newPast.length > MAX_HISTORY) {
                newPast.shift();
            }
            return newPast;
        });
        setFuture([]);
    }, []);

    const undo = useCallback(() => {
        if (past.length === 0) return;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        setFuture(f => [{
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            groups: groupsRef.current
        }, ...f]);

        setNodes(previous.nodes);
        setConnections(previous.connections);
        setGroups(previous.groups);
        setPast(newPast);
    }, [past]);

    const redo = useCallback(() => {
        if (future.length === 0) return;

        const next = future[0];
        const newFuture = future.slice(1);

        setPast(p => [...p, {
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            groups: groupsRef.current
        }]);

        setNodes(next.nodes);
        setConnections(next.connections);
        setGroups(next.groups);
        setFuture(newFuture);
    }, [future]);

    // Utility and State Update Functions
    const updateNodeData = useCallback((id: string, data: Partial<Node>) => {
        setNodes(prevNodes => {
            const targetNodeIndex = prevNodes.findIndex(n => n.id === id);
            if (targetNodeIndex === -1) return prevNodes;

            const targetNode = prevNodes[targetNodeIndex];
            const updatedNode = { ...targetNode, ...data };

            // If node was in error state and is now being edited by user, reset its status
            if (targetNode.status === 'error' && (data.content !== undefined || data.inputImage !== undefined || data.instruction !== undefined)) {
                updatedNode.status = 'idle';

                // If the user isn't the one editing the content (e.g. they changed instruction or image),
                // then we should clear the error message from the content of generated nodes.
                const isGenerated = connectionsRef.current.some(c => c.to === id);
                if (isGenerated && data.content === undefined) {
                    updatedNode.content = targetNode.type === 'image' ? '等待生成...' : '';
                }
            }

            let newNodes = [...prevNodes];
            newNodes[targetNodeIndex] = updatedNode;

            // Collision Detection & Resolution
            // Only run if dimensions are explicitly changing (e.g., image loaded)
            if ((data.width !== undefined || data.height !== undefined) && updatedNode.width && updatedNode.height) {
                const PADDING = 20;
                const r1 = {
                    left: updatedNode.position.x,
                    top: updatedNode.position.y,
                    right: updatedNode.position.x + updatedNode.width,
                    bottom: updatedNode.position.y + updatedNode.height,
                    centerX: updatedNode.position.x + updatedNode.width / 2,
                    centerY: updatedNode.position.y + updatedNode.height / 2
                };

                newNodes = newNodes.map(other => {
                    if (other.id === id) return updatedNode;

                    const otherW = other.width || DEFAULT_NODE_WIDTH;
                    const otherH = other.height || DEFAULT_NODE_HEIGHT;

                    const r2 = {
                        left: other.position.x,
                        top: other.position.y,
                        right: other.position.x + otherW,
                        bottom: other.position.y + otherH,
                        centerX: other.position.x + otherW / 2,
                        centerY: other.position.y + otherH / 2
                    };

                    // Check overlap
                    if (r1.left < r2.right && r1.right > r2.left && r1.top < r2.bottom && r1.bottom > r2.top) {
                        // Calculate displacement vector
                        const dx = r2.centerX - r1.centerX;
                        const dy = r2.centerY - r1.centerY;

                        let newX = other.position.x;
                        let newY = other.position.y;

                        if (Math.abs(dx) > Math.abs(dy)) {
                            // Horizontal push
                            if (dx > 0) newX = r1.right + PADDING;
                            else newX = r1.left - otherW - PADDING;
                        } else {
                            // Vertical push
                            if (dy > 0) newY = r1.bottom + PADDING;
                            else newY = r1.top - otherH - PADDING;
                        }

                        return { ...other, position: { x: newX, y: newY } };
                    }
                    return other;
                });
            }

            return newNodes;
        });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
        setDrawingConnection(null);
        setPreviewConnection(null);
    }, []);

    const deselectAll = useCallback(() => {
        setNodes(ns => ns.map(n => ({ ...n, selected: false })));
        setGroups(gs => gs.map(g => ({ ...g, selected: false })));
        setSelectedConnectionId(null);
        setActiveNodeId(null);
    }, []);

    const createNode = useCallback((type: NodeType, position: Point, namePrefix: string) => {
        recordHistory(); // Save before creating
        const count = nodesRef.current.filter(n => n.type === type).length + 1;
        const newNode: Node = {
            id: `${type}-${Date.now()}`,
            name: `${namePrefix} ${count}`,
            type,
            position,
            content: '',
            instruction: '',
            status: 'idle',
            selected: false,
            inputImage: null,
            width: DEFAULT_NODE_WIDTH,
            height: DEFAULT_NODE_HEIGHT,
            selectedModel: type === 'image' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview',
        };
        setNodes(ns => [...ns, newNode]);
        return newNode;
    }, [recordHistory]);

    // --- Global Event Handling for Robust Interactions ---

    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
        if (interactionState.current.isPanning) {
            const dx = e.clientX - interactionState.current.dragStart.x;
            const dy = e.clientY - interactionState.current.dragStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                interactionState.current.hasDragged = true;
            }
            setPan({ x: e.clientX - interactionState.current.startPanPoint.x, y: e.clientY - interactionState.current.startPanPoint.y });
        } else if (interactionState.current.isSelecting) {
            const dx = e.clientX - interactionState.current.dragStart.x;
            const dy = e.clientY - interactionState.current.dragStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                interactionState.current.hasDragged = true;
            }
            const start = selectionStartPointRef.current;
            const end = { x: e.clientX, y: e.clientY };
            setSelectionBox({
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(start.x - end.x),
                height: Math.abs(start.y - end.y),
            });
        } else if (dragStateRef.current) {
            interactionState.current.hasDragged = true;
            if (!isDraggingNode) setIsDraggingNode(true);
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
        } else if (drawingConnection) {
            const startNodeId = drawingConnection.from || drawingConnection.to;
            if (!startNodeId) return;
            const startNodeElem = document.getElementById(startNodeId);
            if (!startNodeElem) return;

            const rect = startNodeElem.getBoundingClientRect();
            const endPoint = { x: e.clientX, y: e.clientY };
            let startPoint;
            if (drawingConnection.from) { // Forward
                startPoint = { x: rect.right, y: rect.top + rect.height / 2 };
                setPreviewConnection({ start: startPoint, end: endPoint });
            } else { // Reverse
                startPoint = { x: rect.left, y: rect.top + rect.height / 2 };
                setPreviewConnection({ start: endPoint, end: startPoint });
            }
        }
    };

    const handleGlobalMouseUp = (e: globalThis.MouseEvent) => {
        if (interactionState.current.hasDragged && dragStateRef.current) {
            // Only record history if we actually dragged a node
            recordHistory();
        }

        if (selectionBox && selectionBox.width > 0 && selectionBox.height > 0) {
            const selectedNodeIds = new Set(e.ctrlKey ? selectedNodes.map(n => n.id) : []);
            const selectedGroupIds = new Set(e.ctrlKey ? selectedGroups.map(g => g.id) : []);

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

        if (drawingConnection) {
            const isReleasedOnConnector = (e.target as HTMLElement).closest('[data-connector="true"]');
            if (!isReleasedOnConnector) {
                const canvasPosition = { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom };
                const createAndConnect = (type: NodeType) => {
                    const newNode = createNode(type, canvasPosition, type === 'text' ? '文本' : '图片');
                    if (drawingConnection?.from) {
                        setConnections(cs => [...cs, { id: `${drawingConnection.from}-${newNode.id}`, from: drawingConnection.from!, to: newNode.id }]);
                    } else if (drawingConnection?.to) {
                        setConnections(cs => [...cs, { id: `${newNode.id}-${drawingConnection.to}`, from: newNode.id, to: drawingConnection.to! }]);
                    }
                    closeContextMenu();
                };
                setContextMenu({
                    position: { x: e.clientX, y: e.clientY }, title: '创建并连接节点',
                    options: [
                        { label: '文本', description: '创建文本节点', action: () => createAndConnect('text'), icon: <TextIcon /> },
                        { label: '图片', description: '创建图片节点', action: () => createAndConnect('image'), icon: <ImageIcon /> },
                    ]
                });
            }
        }

        // Reset all interaction states
        if (isDraggingNode) setIsDraggingNode(false);
        interactionState.current.isPanning = false;
        interactionState.current.isSelecting = false;
        dragStateRef.current = null;
        setDrawingConnection(null);
        setPreviewConnection(null);
        setSelectionBox(null);
        setSnapLines([]);
        setTimeout(() => { interactionState.current.hasDragged = false; }, 0);
    };

    useEffect(() => {
        onMouseMoveRef.current = handleGlobalMouseMove;
        onMouseUpRef.current = handleGlobalMouseUp;
    });

    const startGlobalInteraction = () => {
        const onMove = (e: globalThis.MouseEvent) => onMouseMoveRef.current?.(e);
        const onUp = (e: globalThis.MouseEvent) => {
            onMouseUpRef.current?.(e);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Event Handlers
    const handleCanvasMouseDown = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (contextMenu) closeContextMenu();

        const isCanvasClick = (e.target as HTMLElement).closest('[data-id="canvas-bg"]');
        if (!isCanvasClick) return;

        if (e.button === 0) { // Left click
            if (!e.ctrlKey) deselectAll();
            interactionState.current.isSelecting = true;
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
            selectionStartPointRef.current = { x: e.clientX, y: e.clientY };
            setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
        } else if (e.button === 2) { // Right click
            interactionState.current.isPanning = true;
            interactionState.current.startPanPoint = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
        }
        startGlobalInteraction();
    };

    const handleCanvasContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (interactionState.current.hasDragged) return;

        const isCanvasClick = (e.target as HTMLElement).closest('[data-id="canvas-bg"]');
        if (!isCanvasClick) return;

        const position = { x: e.clientX, y: e.clientY };
        const canvasPosition = { x: (position.x - pan.x) / zoom, y: (position.y - pan.y) / zoom };

        const createAndClose = (type: NodeType) => {
            createNode(type, canvasPosition, type === 'text' ? '文本' : '图片');
            closeContextMenu();
        };

        setContextMenu({
            position, title: '创建节点',
            options: [
                { label: '文本', description: '纯文本输入或输出', action: () => createAndClose('text'), icon: <TextIcon /> },
                { label: '图片', description: '图片输入或输出', action: () => createAndClose('image'), icon: <ImageIcon /> },
            ]
        });
    };

    const handleNodeMouseDown = (nodeId: string, e: MouseEvent) => {
        // Blur any active element to ensure the delete handler isn't blocked by a focused textarea.
        // Modified to only blur if the active element is an input or textarea,
        // allowing our node divs to keep focus (for paste events).
        if (document.activeElement && (document.activeElement as HTMLElement).blur) {
            const tagName = document.activeElement.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                (document.activeElement as HTMLElement).blur();
            }
        }

        setActiveNodeId(nodeId);
        e.stopPropagation();

        if (e.ctrlKey) {
            // Toggle selection for the clicked node
            setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, selected: !n.selected } : n));
        } else if (!nodes.find(n => n.id === nodeId)?.selected) {
            // A non-ctrl click should make this node the sole selection, if it isn't already part of a selection.
            setNodes(ns => ns.map(n => ({ ...n, selected: n.id === nodeId })));
            setGroups(gs => gs.map(g => ({ ...g, selected: false })));
            setSelectedConnectionId(null);
        }
    };

    const handleNodeHeaderMouseDown = (nodeId: string, e: MouseEvent<HTMLElement>) => {
        recordHistory(); // Save state before starting drag
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        dragStateRef.current = {
            id: nodeId,
            offset: {
                x: e.clientX - (node.position.x * zoom + pan.x),
                y: e.clientY - (node.position.y * zoom + pan.y),
            }
        };
        e.preventDefault();
        e.stopPropagation();
        startGlobalInteraction();
    };

    const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string, type: 'input' | 'output') => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
        const nodeHeight = node.height || DEFAULT_NODE_HEIGHT;

        let startX, startY;

        if (type === 'output') {
            setDrawingConnection({ from: nodeId });
            // Offset for output connector (right side + 12px)
            startX = node.position.x + nodeWidth + 12;
            startY = node.position.y + nodeHeight / 2;
        } else { // type === 'input'
            setDrawingConnection({ to: nodeId });
            // Offset for input connector (left side - 12px)
            startX = node.position.x - 12;
            startY = node.position.y + nodeHeight / 2;
        }
        setPreviewConnection({ start: { x: startX, y: startY }, end: { x: startX, y: startY } });
        startGlobalInteraction();
    };

    const handleConnectorMouseUp = (nodeId: string, type: 'input' | 'output') => {
        if (!drawingConnection) return;

        const fromNode = drawingConnection.from || (type === 'output' ? nodeId : undefined);
        const toNode = drawingConnection.to || (type === 'input' ? nodeId : undefined);

        if (fromNode && toNode && fromNode !== toNode) {
            const alreadyExists = connections.some(c => c.from === fromNode && c.to === toNode);
            if (!alreadyExists) {
                recordHistory();
                setConnections(cs => [...cs, { id: `${fromNode}-${toNode}`, from: fromNode, to: toNode }]);
            }
        }
        setDrawingConnection(null);
        setPreviewConnection(null);
    };

    const groupSelectedNodes = () => {
        const nodesToGroup = selectedNodes.filter(n => !n.groupId);
        if (nodesToGroup.length < 2) return;
        recordHistory();

        const PADDING = 40;
        const HEADER_SPACE = 30; // Extra space for node headers to prevent overlap
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        nodesToGroup.forEach(node => {
            const nodeWidth = node.width || DEFAULT_NODE_WIDTH;
            const nodeHeight = node.height || DEFAULT_NODE_HEIGHT;
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + nodeWidth);
            maxY = Math.max(maxY, node.position.y + nodeHeight);
        });

        const groupId = `group-${Date.now()}`;
        const nodeIds = nodesToGroup.map(n => n.id);

        const newGroup: Group = {
            id: groupId, name: `新建工作流 ${groups.length + 1}`, nodeIds,
            position: { x: minX - PADDING, y: minY - PADDING - HEADER_SPACE },
            size: { width: (maxX - minX) + 2 * PADDING, height: (maxY - minY) + 2 * PADDING + HEADER_SPACE },
            selected: true,
        };

        setNodes(ns => ns.map(n => nodeIds.includes(n.id) ? { ...n, groupId, selected: false } : { ...n, selected: false }));
        setGroups(gs => [...gs.map(g => ({ ...g, selected: false })), newGroup]);
    };

    const ungroupSelectedNodes = () => {
        const groupIdsToUngroup = new Set(selectedGroups.map(g => g.id));
        if (groupIdsToUngroup.size === 0) return;
        recordHistory();

        const nodeIdsInSelectedGroups = new Set(
            groups.filter(g => groupIdsToUngroup.has(g.id)).flatMap(g => g.nodeIds)
        );

        setNodes(ns => ns.map(n => nodeIdsInSelectedGroups.has(n.id) ? { ...n, groupId: undefined } : n));
        setGroups(gs => gs.filter(g => !groupIdsToUngroup.has(g.id)));
    };

    // Workflow Execution
    const executeNode = async (nodeId: string, instructionFromInput?: string) => {
        const nodeToExecute = nodesRef.current.find(n => n.id === nodeId);
        if (!nodeToExecute || nodeToExecute.status === 'running') return;

        updateNodeData(nodeId, { status: 'running' });

        const incomingConnectionIds = new Set(connectionsRef.current.filter(c => c.to === nodeId).map(c => c.id));
        // Additive update for active connections
        setActiveConnectionIds(prev => {
            const next = new Set(prev);
            incomingConnectionIds.forEach(id => next.add(id));
            return next;
        });

        const inputConnections = connectionsRef.current.filter(c => c.to === nodeId);
        const inputNodes = nodesRef.current.filter(n => inputConnections.some(c => c.from === n.id));
        const inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));

        // Self-reference logic for single node execution:
        // If a node has NO input connections, but has an image, we treat it as input (Img2Img / Editing).
        // If it HAS inputs, we ignore its own image (it will be overwritten).
        const hasInputs = inputConnections.length > 0;
        if (nodeToExecute.type === 'image' && nodeToExecute.inputImage && !hasInputs) {
             inputs.push({ type: 'image', data: nodeToExecute.inputImage });
        }

        const instructionToUse = instructionFromInput !== undefined ? instructionFromInput : nodeToExecute.instruction;

        try {
            const result = await runNode(
                instructionToUse,
                nodeToExecute.type,
                inputs,
                nodeToExecute.selectedModel
            );

            if (result.type === 'image') {
                // Reset dimensions for new generated image to trigger auto-sizing
                updateNodeData(nodeId, { 
                    status: 'success', 
                    inputImage: result.content, 
                    content: '生成图片',
                    width: undefined, // Force re-calculation of dimensions
                    height: undefined 
                });
                const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                const historyItem: HistoryItem = { id: `hist-${Date.now()}`, timestamp: new Date(), image: result.content, prompt: instructionToUse, context, nodeName: nodeToExecute.name };
                setHistory(h => [historyItem, ...h]);
            } else {
                const update: Partial<Node> = { status: 'success', content: result.content };
                if (nodeToExecute.type === 'image') {
                    // An image node returned text (e.g. refusal). Clear image.
                    update.inputImage = null;
                }
                updateNodeData(nodeId, update);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            updateNodeData(nodeId, { status: 'error', content: errorMessage });
        } finally {
            // Subtractive update for active connections
            setActiveConnectionIds(prev => {
                const next = new Set(prev);
                incomingConnectionIds.forEach(id => next.delete(id));
                return next;
            });
        }
    };

    const runGroupWorkflow = async (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        const groupNodeIds = new Set(group.nodeIds);
        const allNodesInGroup = nodesRef.current.filter(n => groupNodeIds.has(n.id));
        const groupConnections = connectionsRef.current.filter(c => groupNodeIds.has(c.from) && groupNodeIds.has(c.to));

        if (allNodesInGroup.length === 0) return;

        // 1. Initialize Topology & Data Snapshot
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        const executionData = new Map<string, Node>();
        
        // SNAPSHOT LOGIC: 
        // We capture the state of ALL nodes to support external dependencies.
        nodesRef.current.forEach(node => {
            // We check global connections to see if this node acts as a 'consumer' or 'provider' in the context of a run.
            // If a node has incoming connections, it expects to receive NEW data. So we wipe its current 'output' fields.
            const hasIncoming = connectionsRef.current.some(c => c.to === node.id);
            
            const cleanNode = { ...node };
            
            if (hasIncoming) {
                // DEPENDENT NODE: Clear stale outputs. It will be regenerated.
                cleanNode.content = node.type === 'text' ? '' : ''; 
                cleanNode.inputImage = null; 
                cleanNode.status = 'idle';
            } else {
                // ROOT NODE: Keep its content!
                // This allows:
                // 1. User uploaded images (static input).
                // 2. Previous generations to be used as input for the next run (Iterative Img2Img).
                // We just mark it as idle so it's ready to trigger downstream, but we DON'T wipe the data.
                cleanNode.status = 'idle';
            }
            executionData.set(node.id, cleanNode);
        });

        // Initialize adjacency for group nodes
        allNodesInGroup.forEach(node => {
            adj.set(node.id, []);
            inDegree.set(node.id, 0);
        });

        groupConnections.forEach(conn => {
            adj.get(conn.from)?.push(conn.to);
            inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
        });

        // 2. Reset UI State (Visual Only)
        setNodes(prevNodes => prevNodes.map(n => {
            if (groupNodeIds.has(n.id)) {
                const hasIncoming = connectionsRef.current.some(c => c.to === n.id);
                return {
                    ...n,
                    status: 'idle',
                    // Same logic as snapshot: if it has incoming, it's waiting for data.
                    content: hasIncoming && n.type === 'text' ? '' : n.content,
                    inputImage: hasIncoming ? null : n.inputImage,
                };
            }
            return n;
        }));

        const newHistoryItems: HistoryItem[] = [];

        // Helper to stop execution branch if a node fails
        const cancelDownstream = (failedNodeId: string) => {
             const children = adj.get(failedNodeId) || [];
             children.forEach(childId => {
                 setNodes(ns => ns.map(n => n.id === childId ? { ...n, status: 'idle', content: 'Upstream dependency failed' } : n));
                 // Recursively cancel
                 cancelDownstream(childId);
             });
        };

        // 3. Parallel Execution Function
        const triggerNode = async (nodeId: string) => {
            // PHANTOM NODE CHECK: Ensure node still exists in the live canvas
            if (!nodesRef.current.find(n => n.id === nodeId)) return;

            const currentNodeData = executionData.get(nodeId);
            if (!currentNodeData) return;

            setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'running' } : n));

            const incomingConns = connectionsRef.current.filter(c => c.to === nodeId);
            const incomingConnIds = incomingConns.map(c => c.id);
            
            if (incomingConnIds.length > 0) {
                setActiveConnectionIds(prev => {
                    const next = new Set(prev);
                    incomingConnIds.forEach(id => next.add(id));
                    return next;
                });
            }

            // Minimal UI delay for connection highlighting
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const hasInputs = incomingConns.length > 0;
                const hasInstruction = currentNodeData.instruction.trim().length > 0;

                if (!hasInputs && !hasInstruction) {
                   // Static node (e.g., pure text prompt or uploaded image provider).
                   // No API call needed.
                } else {
                    const inputNodesData = incomingConns
                        .map(c => executionData.get(c.from))
                        .filter(n => n !== undefined) as Node[];
                    
                    const inputs = inputNodesData.map(n => ({ 
                        type: n.type, 
                        data: n.type === 'image' ? n.inputImage : n.content 
                    }));

                    // In-Place Iteration Logic:
                    // If I have an image (from previous run or upload) AND NO inputs, use myself as input.
                    if (currentNodeData.type === 'image' && currentNodeData.inputImage && !hasInputs) {
                        inputs.push({ type: 'image', data: currentNodeData.inputImage });
                    }

                    const result = await runNode(
                        currentNodeData.instruction,
                        currentNodeData.type,
                        inputs,
                        currentNodeData.selectedModel
                    );

                    // Update Data Snapshot
                    const updatedNode = { ...currentNodeData };
                    if (result.type === 'image') {
                        updatedNode.inputImage = result.content;
                        updatedNode.content = '生成图片';
                        const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                        const histItem: HistoryItem = { 
                            id: `hist-${Date.now()}-${nodeId}`, 
                            timestamp: new Date(), 
                            image: result.content, 
                            prompt: currentNodeData.instruction, 
                            context, 
                            nodeName: currentNodeData.name 
                        };
                        newHistoryItems.push(histItem);
                    } else {
                        updatedNode.content = result.content;
                        if (currentNodeData.type === 'image') {
                            updatedNode.inputImage = null;
                        }
                    }
                    updatedNode.status = 'success';
                    executionData.set(nodeId, updatedNode);

                    // Update UI
                    setNodes(ns => ns.map(n => n.id === nodeId ? { 
                        ...n, 
                        ...updatedNode, 
                        status: 'success', 
                        width: undefined, 
                        height: undefined 
                    } : n));
                }

                // Trigger Children Immediately (No Stagger)
                const children = adj.get(nodeId) || [];
                children.forEach(childId => {
                    const currentInDegree = (inDegree.get(childId) || 1) - 1;
                    inDegree.set(childId, currentInDegree);
                    if (currentInDegree === 0) {
                        triggerNode(childId);
                    }
                });

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error";
                setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'error', content: errorMessage } : n));
                console.error(`Workflow execution failed at node ${nodeId}.`, error);
                // ERROR PROPAGATION: Stop downstream
                cancelDownstream(nodeId);
            } finally {
                if (incomingConnIds.length > 0) {
                    setActiveConnectionIds(prev => {
                        const next = new Set(prev);
                        incomingConnIds.forEach(id => next.delete(id));
                        return next;
                    });
                }
                
                if (newHistoryItems.length > 0) {
                    setHistory(h => [...newHistoryItems.filter(item => !h.some(existing => existing.id === item.id)).reverse(), ...h]);
                    newHistoryItems.length = 0; 
                }
            }
        };

        // 4. Start Execution
        const roots = allNodesInGroup.filter(n => inDegree.get(n.id) === 0);
        roots.forEach(n => triggerNode(n.id));
    };

    // Asset Management
    useEffect(() => {
        try {
            const savedAssets = localStorage.getItem('gemini-canvas-assets');
            if (savedAssets) {
                setAssets(JSON.parse(savedAssets));
            } else {
                const defaultAsset: WorkflowAsset = {
                    id: 'asset-default-multimodal-1',
                    name: "多模态图片生成",
                    tags: ['默认', '多模态', '图片生成'],
                    notes: "这是一个默认的工作流示例，展示了如何将文本和图片输入结合起来，以生成一张新的图片。",
                    nodes: [
                        { id: 'default-image-1', name: '图片 1', type: 'image', position: { x: 0, y: 0 }, content: '', instruction: '', inputImage: null, selectedModel: 'gemini-2.5-flash-image' },
                        { id: 'default-text-1', name: '文本 1', type: 'text', position: { x: 0, y: 250 }, content: '', instruction: '', inputImage: null, selectedModel: 'gemini-3-pro-preview' },
                        { id: 'default-image-2', name: '图片 2', type: 'image', position: { x: 400, y: 125 }, content: '', instruction: '将文字作为水印添加到图片中', inputImage: null, selectedModel: 'gemini-2.5-flash-image' },
                    ],
                    connections: [
                        { fromNode: 'default-image-1', toNode: 'default-image-2' },
                        { fromNode: 'default-text-1', toNode: 'default-image-2' }
                    ],
                };
                const assetsToSave = [defaultAsset];
                setAssets(assetsToSave);
                localStorage.setItem('gemini-canvas-assets', JSON.stringify(assetsToSave));
            }
        } catch (error) {
            console.error("Failed to load assets from local storage:", error);
        }
    }, []);

    const saveAssetsToLocal = (updatedAssets: WorkflowAsset[]) => {
        setAssets(updatedAssets);
        localStorage.setItem('gemini-canvas-assets', JSON.stringify(updatedAssets));
    };

    const handleSaveAsset = (details: { name: string, tags: string[], notes: string }) => {
        if (!groupToSave) return;

        const groupNodeIds = new Set(groupToSave.nodeIds);
        const workflowNodes = nodes.filter(n => groupNodeIds.has(n.id));
        const workflowConnections = connections.filter(c => groupNodeIds.has(c.from) && groupNodeIds.has(c.to));

        if (workflowNodes.length === 0) return;

        const generatedNodeIdsInGroup = new Set(workflowConnections.map(c => c.to));

        const minX = Math.min(...workflowNodes.map(n => n.position.x));
        const minY = Math.min(...workflowNodes.map(n => n.position.y));

        const serializableNodes: SerializedNode[] = workflowNodes.map((node) => {
            const isGenerated = generatedNodeIdsInGroup.has(node.id);
            const hasNoInputs = !connections.some(c => c.to === node.id);

            // Preserve content only for root text nodes (user-defined prompts).
            // Clear content for all other nodes to create a clean template.
            const shouldPreserveContent = node.type === 'text' && hasNoInputs;

            return {
                id: node.id,
                name: node.name,
                type: node.type,
                position: { x: node.position.x - minX, y: node.position.y - minY },
                content: shouldPreserveContent ? node.content : '',
                instruction: node.instruction,
                inputImage: null, // Always clear image data
                selectedModel: node.selectedModel,
            };
        });

        const serializableConnections: SerializedConnection[] = workflowConnections.map(({ from, to }) => ({ fromNode: from, toNode: to }));

        const newAsset: WorkflowAsset = {
            id: `asset-${Date.now()}`, ...details,
            nodes: serializableNodes, connections: serializableConnections,
        };

        saveAssetsToLocal([...assets, newAsset]);
        setIsSaveAssetModalOpen(false);
        setGroupToSave(null);
        setToast('资产保存成功！');
        setTimeout(() => setToast(null), 3000);
    };

    const addWorkflowToCanvas = (workflow: { nodes: SerializedNode[], connections: SerializedConnection[] }) => {
        // We don't strictly record history here as it's a big operation, 
        // but usually it's good to have an undo point.
        recordHistory();
        deselectAll();

        // 1. Calculate new workflow bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        workflow.nodes.forEach(n => {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + (n.width || DEFAULT_NODE_WIDTH));
            maxY = Math.max(maxY, n.position.y + (n.height || DEFAULT_NODE_HEIGHT));
        });
        const workflowWidth = maxX - minX;
        const workflowHeight = maxY - minY;

        // 2. Get existing element bounds
        const PADDING = 50;
        const existingBounds = [
            ...nodes.map(n => ({ left: n.position.x, top: n.position.y, right: n.position.x + (n.width || DEFAULT_NODE_WIDTH), bottom: n.position.y + (n.height || DEFAULT_NODE_HEIGHT) })),
            ...groups.map(g => ({ left: g.position.x, top: g.position.y, right: g.position.x + g.size.width, bottom: g.position.y + g.size.height }))
        ];

        // 3. Find a non-overlapping position
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        let targetPos = {
            x: canvasRect ? ((canvasRect.width / 2) - pan.x) / zoom : 0,
            y: canvasRect ? ((canvasRect.height / 2) - pan.y) / zoom : 0,
        };

        const doesOverlap = (pos: Point) => {
            const newBounds = { left: pos.x, top: pos.y, right: pos.x + workflowWidth, bottom: pos.y + workflowHeight };
            for (const bounds of existingBounds) {
                if (newBounds.right + PADDING > bounds.left && newBounds.left < bounds.right + PADDING && newBounds.bottom + PADDING > bounds.top && newBounds.top < bounds.bottom + PADDING) {
                    return true;
                }
            }
            return false;
        };

        while (doesOverlap(targetPos)) {
            targetPos.x += 100; // Shift right to find empty space
        }

        const idMap = new Map<string, string>();
        const loadedNodes: Node[] = workflow.nodes.map((nodeData: SerializedNode) => {
            const oldId = nodeData.id;
            const newId = `${nodeData.type}-${Date.now()}-${Math.random()}`;
            idMap.set(oldId, newId);
            return {
                ...nodeData, id: newId, status: 'idle', selected: true,
                width: nodeData.width || (nodeData.type === 'image' ? DEFAULT_NODE_WIDTH : undefined),
                height: nodeData.height || (nodeData.type === 'image' ? DEFAULT_NODE_HEIGHT : undefined),
                position: {
                    x: nodeData.position.x - minX + targetPos.x,
                    y: nodeData.position.y - minY + targetPos.y,
                },
                selectedModel: nodeData.selectedModel
            };
        });
        const loadedConnections: ConnectionType[] = workflow.connections.map((connData: SerializedConnection) => {
            const fromId = idMap.get(connData.fromNode);
            const toId = idMap.get(connData.toNode);
            return { id: `${fromId}-${toId}`, from: fromId!, to: toId! };
        }).filter(c => c.from && c.to);

        setNodes(n => [...n, ...loadedNodes]);
        setConnections(c => [...c, ...loadedConnections]);
    };

    // --- Keyboard Shortcuts (Copy/Paste/Delete/Undo) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const targetElement = e.target as HTMLElement;

            // Check if typing in an input
            const isTyping = ['INPUT', 'TEXTAREA'].includes(targetElement.tagName);

            // --- DELETE ---
            if (!isTyping && (e.key === 'Backspace' || e.key === 'Delete')) {
                const selectedNodeIds = new Set(nodesRef.current.filter(n => n.selected).map(n => n.id));
                
                // Should we record history? Yes if we are about to delete something.
                if (selectedNodeIds.size > 0 || selectedGroups.length > 0 || selectedConnectionId) {
                    recordHistory();
                }

                if (selectedNodeIds.size > 0) {
                    if (activeNodeId && selectedNodeIds.has(activeNodeId)) {
                        setActiveNodeId(null);
                    }
                    setNodes(ns => ns.filter(n => !selectedNodeIds.has(n.id)));
                    setConnections(cs => cs.filter(c => !selectedNodeIds.has(c.from) && !selectedNodeIds.has(c.to)));
                }
                if (selectedGroups.length > 0) {
                    // ungroupSelectedNodes internally records history if groups exist
                    ungroupSelectedNodes(); 
                }
                if (selectedConnectionId) {
                     setConnections(cs => cs.filter(c => c.id !== selectedConnectionId));
                     setSelectedConnectionId(null);
                }
            }

            // --- COPY (Ctrl+C) ---
            if (!isTyping && e.ctrlKey && e.key === 'c') {
                const selected = nodesRef.current.filter(n => n.selected);
                if (selected.length === 0) return;
                
                // Also copy groups if they are selected or if all their nodes are selected
                const selectedGroupIds = new Set(groupsRef.current.filter(g => g.selected).map(g => g.id));
                // If all nodes of a group are selected, implicitly copy the group too? 
                // For now, let's stick to explicit selection or just nodes. 
                // The `selectedNodes` logic handles the content.
                
                const nodesToCopy = selected;
                const nodeIds = new Set(nodesToCopy.map(n => n.id));
                
                // Copy connections between selected nodes
                const connectionsToCopy = connectionsRef.current.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to));
                
                // Copy groups if selected
                const groupsToCopy = groupsRef.current.filter(g => g.selected);

                clipboard.current = {
                    nodes: nodesToCopy,
                    connections: connectionsToCopy,
                    groups: groupsToCopy
                };
                setToast('复制成功');
                setTimeout(() => setToast(null), 1000);
            }

            // --- PASTE (Ctrl+V) ---
            if (!isTyping && e.ctrlKey && e.key === 'v') {
                if (!clipboard.current) return;
                recordHistory();
                deselectAll();

                const { nodes: cpNodes, connections: cpConnections, groups: cpGroups } = clipboard.current;
                
                // Offset for paste
                const OFFSET = 50;
                const idMap = new Map<string, string>();

                const newNodes = cpNodes.map(n => {
                    const newId = `${n.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    idMap.set(n.id, newId);
                    return {
                        ...n,
                        id: newId,
                        position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
                        selected: true,
                        groupId: undefined // Reset group initially, re-link below if group is also copied
                    };
                });

                const newConnections = cpConnections.map(c => ({
                    id: `${idMap.get(c.from)}-${idMap.get(c.to)}`,
                    from: idMap.get(c.from)!,
                    to: idMap.get(c.to)!
                }));

                const newGroups = cpGroups.map(g => ({
                    ...g,
                    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    position: { x: g.position.x + OFFSET, y: g.position.y + OFFSET },
                    nodeIds: g.nodeIds.map(oldId => idMap.get(oldId)).filter(Boolean) as string[],
                    selected: true
                }));

                // Link nodes back to new groups if applicable
                newGroups.forEach(ng => {
                    const groupNodeSet = new Set(ng.nodeIds);
                    newNodes.forEach(n => {
                        if (groupNodeSet.has(n.id)) {
                            n.groupId = ng.id;
                            n.selected = false; // Deselect nodes if group is selected
                        }
                    });
                });

                setNodes(ns => [...ns, ...newNodes]);
                setConnections(cs => [...cs, ...newConnections]);
                setGroups(gs => [...gs, ...newGroups]);
            }

             // --- UNDO (Ctrl+Z) ---
            if (!isTyping && e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undo();
            }

            // --- REDO (Ctrl+Y or Ctrl+Shift+Z) ---
            if (!isTyping && ( (e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z') )) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedGroups, selectedConnectionId, ungroupSelectedNodes, activeNodeId, undo, redo, recordHistory, deselectAll]);

    const toolbarPosition = useMemo(() => {
        if (!canvasRef.current || (selectedNodes.length === 0 && selectedGroups.length === 0)) return null;
        const selectedElements = [
            ...selectedNodes.map(n => document.getElementById(n.id)),
            ...selectedGroups.map(g => document.getElementById(`group-${g.id}`))
        ].filter(Boolean) as HTMLElement[];
        if (selectedElements.length === 0) return null;
        let top = Infinity, left = Infinity, right = -Infinity;
        selectedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            top = Math.min(top, rect.top); left = Math.min(left, rect.left); right = Math.max(right, rect.right);
        });
        return { top: top - 50, left: left + (right - left) / 2 };
    }, [selectedNodes, selectedGroups, pan, zoom]);

    const handleClearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const handleDeleteHistoryItem = useCallback((id: string) => {
        setHistory(h => h.filter(item => item.id !== id));
        setSelectedHistoryItem(currentItem => {
            if (currentItem && currentItem.id === id) {
                return null;
            }
            return currentItem;
        });
    }, []);

    return (
        <div
            className="w-screen h-screen overflow-hidden cursor-default text-slate-200 font-sans select-none"
            onWheel={(e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const scale = e.deltaY * -0.001;
                    setZoom(z => Math.min(Math.max(0.2, z + scale), 2));
                }
            }}
        >
            <div
                ref={canvasRef}
                data-id="canvas-bg"
                className="absolute top-0 left-0 w-full h-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleCanvasMouseDown}
                onContextMenu={handleCanvasContextMenu}
                style={{
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, rgba(0, 0, 0, 0) 1px)',
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                }}
            />

            {toast && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 glass-panel text-white px-6 py-3 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.3)] z-50 toast-animate border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse"></div>
                    {toast}
                </div>
            )}

            {/* Add API Key Selection Button here if needed based on platform, 
                though gemini-3-pro-image-preview requires it, 
                for now assuming environment key is valid or handled elsewhere 
                to minimize UI clutter as per prompt request to only add model selection. */}

            <WorkflowToolbar
                onLoad={addWorkflowToCanvas}
                onOpenLibrary={() => setIsAssetLibraryOpen(true)}
            />

            <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'top left' }}>
                <svg width="100%" height="100%" className="absolute top-0 left-0 overflow-visible pointer-events-none">
                    {connections.map(conn => (
                        <Connection
                            key={conn.id} id={conn.id} from={conn.from} to={conn.to}
                            nodes={nodes} isSelected={selectedConnectionId === conn.id}
                            onClick={() => { deselectAll(); setSelectedConnectionId(conn.id); }}
                            isActive={activeConnectionIds.has(conn.id)}
                        />
                    ))}
                    {previewConnection && (
                        <path
                            d={`M ${previewConnection.start.x} ${previewConnection.start.y} C ${previewConnection.start.x + 50} ${previewConnection.start.y}, ${previewConnection.end.x - 50} ${previewConnection.end.y}, ${previewConnection.end.x} ${previewConnection.end.y}`}
                            className="stroke-neon-blue fill-none opacity-60" strokeWidth="2" strokeDasharray="5 5"
                            style={{ transform: `translate(${-pan.x}px, ${-pan.y}px)` }}
                        />
                    )}
                    {snapLines.map((line, i) => (
                        <line
                            key={`snap-${i}`}
                            x1={line.x1} y1={line.y1}
                            x2={line.x2} y2={line.y2}
                            className="stroke-neon-pink"
                            strokeWidth={1 / zoom}
                            strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                        />
                    ))}
                </svg>

                {groups.map(group => (
                    <GroupComponent
                        key={group.id} group={group}
                        onRunWorkflow={runGroupWorkflow}
                        onMouseDown={(groupId, e) => {
                            if (e.ctrlKey) setGroups(gs => gs.map(g => g.id === groupId ? { ...g, selected: !g.selected } : g));
                            else if (!group.selected) { deselectAll(); setGroups(gs => gs.map(g => g.id === groupId ? { ...g, selected: true } : g)); }
                            e.stopPropagation();
                        }}
                        onSaveAsset={(groupId) => { setGroupToSave(groups.find(g => g.id === groupId) || null); setIsSaveAssetModalOpen(true); }}
                        onUpdateName={(id, name) => setGroups(gs => gs.map(g => g.id === id ? { ...g, name } : g))}
                    />
                ))}

                {nodes.map(node => (
                    <NodeComponent
                        key={node.id} node={node}
                        onDataChange={updateNodeData}
                        onConnectorMouseDown={handleConnectorMouseDown}
                        onConnectorMouseUp={handleConnectorMouseUp}
                        onMouseDown={handleNodeMouseDown}
                        onHeaderMouseDown={handleNodeHeaderMouseDown}
                        onViewContent={(type, content, name) => setViewerContent({ type, content, name })}
                        isGenerated={generatedNodeIds.has(node.id)}
                    />
                ))}
            </div>

            {contextMenu && <ContextMenu {...contextMenu} onClose={closeContextMenu} />}

            {selectionBox && <div className="absolute border border-neon-blue/50 bg-neon-blue/10 pointer-events-none rounded-md backdrop-blur-[1px]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}

            {toolbarPosition && selectionType !== 'none' && (
                <SelectionToolbar position={toolbarPosition} onGroup={groupSelectedNodes} onUngroup={ungroupSelectedNodes} selectionType={selectionType} />
            )}

            {viewerContent && <ViewerModal {...viewerContent} onClose={() => setViewerContent(null)} />}

            {isSaveAssetModalOpen && groupToSave && (
                <SaveAssetModal groupName={groupToSave.name} onClose={() => setIsSaveAssetModalOpen(false)} onSave={handleSaveAsset} />
            )}

            {isAssetLibraryOpen && (
                <AssetLibrary
                    assets={assets} onClose={() => setIsAssetLibraryOpen(false)} onAdd={addWorkflowToCanvas}
                    onDownload={(asset) => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes: asset.nodes, connections: asset.connections }, null, 2));
                        const a = document.createElement('a');
                        a.href = dataStr;
                        a.download = `${asset.name.replace(/\s/g, '_')}.json`;
                        a.click();
                    }}
                    onDelete={(id) => saveAssetsToLocal(assets.filter(a => a.id !== id))}
                />
            )}

            {history.length > 0 && <HistoryTray history={history} onSelect={setSelectedHistoryItem} onClearAll={handleClearHistory} onDeleteItem={handleDeleteHistoryItem} />}
            {selectedHistoryItem && <HistoryDetailModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />}

            <div className="absolute bottom-6 right-6 text-xs text-slate-400 glass-panel p-3 rounded-xl select-none pointer-events-none space-y-2 backdrop-blur-md">
                <p className="flex items-center gap-2"><kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white border border-white/10">Right Click</kbd> <span>Move Canvas</span></p>
                <p className="flex items-center gap-2"><kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white border border-white/10">Ctrl + Click</kbd> <span>Multi Select</span></p>
                <p className="flex items-center gap-2"><kbd className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white border border-white/10">Ctrl + Scroll</kbd> <span>Zoom</span></p>
            </div>
        </div>
    );
};

export default App;
