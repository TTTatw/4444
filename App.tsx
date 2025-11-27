
import React, { useState, useCallback, useRef, MouseEvent, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UIOverlay } from './components/UIOverlay';
import { NodeComponent } from './components/NodeComponent';
import { ContextMenu } from './components/ContextMenu';
import { Connection } from './components/Connection';
import { GroupComponent } from './components/GroupComponent';
import { InstructionInput } from './components/InstructionInput';
import { SelectionToolbar } from './components/SelectionToolbar';
import { ViewerModal } from './components/ViewerModal';
import { WorkflowToolbar } from './components/WorkflowToolbar';
import { HistoryTray } from './components/HistoryTray';
import { HistoryDetailModal } from './components/HistoryDetailModal';
import { SaveAssetModal } from './components/SaveAssetModal';
import { AssetLibrary } from './components/AssetLibrary';
import type { Node, Connection as ConnectionType, Point, ContextMenu as ContextMenuType, Group, NodeType, HistoryItem, WorkflowAsset, SerializedNode, SerializedConnection, NodeStatus } from './types';
import { runNode } from './services/geminiService';
import { isSupabaseConfigured, fetchAssets, upsertAsset, deleteAsset, fetchHistoryItems, insertHistoryItem, removeHistoryItem, clearHistoryItems, fetchUsers, upsertUser, deleteUser, supabaseAuth } from './services/storageService';
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
    const supabaseEnabled = isSupabaseConfigured();
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKeyDraft, setApiKeyDraft] = useState('');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [loginName, setLoginName] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [authorizedUsers, setAuthorizedUsers] = useState<{ id?: string; name: string; password: string; }[]>([]);
    const [currentUser, setCurrentUser] = useState<{ role: 'guest' | 'admin' | 'user'; name: string; id?: string }>({ role: 'guest', name: 'Guest' });
    const [newAuthorizedName, setNewAuthorizedName] = useState('');
    const [newAuthorizedPassword, setNewAuthorizedPassword] = useState('');

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
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
    const [historyModalSelection, setHistoryModalSelection] = useState<Set<string>>(new Set());
    const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
    const [isSaveAssetModalOpen, setIsSaveAssetModalOpen] = useState(false);
    const [groupToSave, setGroupToSave] = useState<Group | null>(null);
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');

    // Refs
    const canvasRef = useRef<HTMLDivElement>(null);
    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const groupsRef = useRef(groups);
    const dragStateRef = useRef<{ id: string; offset: Point } | null>(null);
    const onMouseMoveRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);
    const onMouseUpRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);
    const groupDragRef = useRef<{ id: string; offset: { x: number; y: number } } | null>(null);

    const clampZoom = (z: number) => Math.min(Math.max(0.2, z), 2);

    // Prevent browser-level zoom (Ctrl + wheel / Ctrl + +/-) so only canvas zoom applies
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

    const zoomAroundPoint = useCallback((newZoom: number, pointer?: { x: number; y: number }) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const center = pointer || (rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 });
        const canvasPos = { x: center.x - (rect?.left || 0), y: center.y - (rect?.top || 0) };
        setZoom(prevZoom => {
            const targetZoom = clampZoom(newZoom);
            const worldX = (canvasPos.x - pan.x) / prevZoom;
            const worldY = (canvasPos.y - pan.y) / prevZoom;
            setPan({
                x: canvasPos.x - worldX * targetZoom,
                y: canvasPos.y - worldY * targetZoom,
            });
            return targetZoom;
        });
    }, [pan.x, pan.y]);

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
    const visibleAssets = useMemo(
        () => assets.filter(a => a.visibility !== 'private' || currentUser.role === 'admin' || a.ownerId === currentUser.id),
        [assets, currentUser]
    );
    const visibleHistory = useMemo(
        () => history.filter(item => !item.ownerId || currentUser.role === 'admin' || item.ownerId === currentUser.id),
        [history, currentUser]
    );

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
                    updatedNode.content = targetNode.type === 'image' ? 'Waiting for generation...' : '';
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
        } else if (groupDragRef.current) {
            const drag = groupDragRef.current;
            const group = groupsRef.current.find(g => g.id === drag.id);
            if (!group) return;
            const newX = (e.clientX - pan.x - drag.offset.x) / zoom;
            const newY = (e.clientY - pan.y - drag.offset.y) / zoom;
            const deltaX = newX - group.position.x;
            const deltaY = newY - group.position.y;
            if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
                interactionState.current.hasDragged = true;
                setGroups(gs => gs.map(g => g.id === drag.id ? { ...g, position: { x: newX, y: newY } } : g));
                setNodes(ns => ns.map(n => group.nodeIds.includes(n.id) ? { ...n, position: { x: n.position.x + deltaX, y: n.position.y + deltaY } } : n));
            }
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
            const startNode = nodesRef.current.find(n => n.id === startNodeId);
            if (!startNode) return;
            const startW = startNode.width || DEFAULT_NODE_WIDTH;
            const startH = startNode.height || DEFAULT_NODE_HEIGHT;

            const startPoint = drawingConnection.from
                ? { x: startNode.position.x + startW + 12, y: startNode.position.y + startH / 2 }
                : { x: startNode.position.x - 12, y: startNode.position.y + startH / 2 };

            const endPoint = { x: (e.clientX - pan.x) / zoom, y: (e.clientY - pan.y) / zoom };
            if (drawingConnection.from) {
                setPreviewConnection({ start: startPoint, end: endPoint });
            } else {
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
                    const newNode = createNode(type, canvasPosition, type === 'text' ? 'Text' : 'Image');
                    if (drawingConnection?.from) {
                        setConnections(cs => [...cs, { id: `${drawingConnection.from}-${newNode.id}`, from: drawingConnection.from!, to: newNode.id }]);
                    } else if (drawingConnection?.to) {
                        setConnections(cs => [...cs, { id: `${newNode.id}-${drawingConnection.to}`, from: newNode.id, to: drawingConnection.to! }]);
                    }
                    closeContextMenu();
                };
                setContextMenu({
                    position: { x: e.clientX, y: e.clientY }, title: 'Create and connect node',
                    options: [
                        { label: 'Text', description: 'Create text node', action: () => createAndConnect('text'), icon: <TextIcon /> },
                        { label: 'Image', description: 'Create image node', action: () => createAndConnect('image'), icon: <ImageIcon /> },
                    ]
                });
            }
        }

        // Reset all interaction states
        if (isDraggingNode) setIsDraggingNode(false);
        interactionState.current.isPanning = false;
        interactionState.current.isSelecting = false;
        dragStateRef.current = null;
        groupDragRef.current = null;
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

        if (e.button === 2) { // Right click panning, allow anywhere
            interactionState.current.isPanning = true;
            interactionState.current.startPanPoint = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
            startGlobalInteraction();
            return;
        }

        if (!isCanvasClick) return;

        if (e.button === 0) { // Left click
            if (!e.ctrlKey) deselectAll();
            interactionState.current.isSelecting = true;
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
            selectionStartPointRef.current = { x: e.clientX, y: e.clientY };
            setSelectionBox({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
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
            createNode(type, canvasPosition, type === 'text' ? 'Text' : 'Image');
            closeContextMenu();
        };

        setContextMenu({
            position,
            title: 'Create Node',
            options: [
                { label: 'Text', description: 'Text input or output', action: () => createAndClose('text'), icon: <TextIcon /> },
                { label: 'Image', description: 'Image input or output', action: () => createAndClose('image'), icon: <ImageIcon /> },
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

    const handleNodeContextMenu = (nodeId: string, e: MouseEvent) => {
        e.preventDefault();
        const position = { x: e.clientX, y: e.clientY };
        setContextMenu({
            position,
            title: '节点',
            options: [
                { label: '保存为预设', action: () => { handleSaveSelectionAsPreset(nodeId); closeContextMenu(); } },
            ],
            onClose: closeContextMenu,
        });
    };

    const handleGroupMouseDown = (groupId: string, e: MouseEvent) => {
        if (e.button === 2) return;
        if (e.ctrlKey) {
            setGroups(gs => gs.map(g => g.id === groupId ? { ...g, selected: !g.selected } : g));
        } else {
            setGroups(gs => gs.map(g => ({ ...g, selected: g.id === groupId })));
            setNodes(ns => ns.map(n => ({ ...n, selected: false })));
            setSelectedConnectionId(null);
        }

        const group = groupsRef.current.find(g => g.id === groupId);
        if (group) {
            groupDragRef.current = {
                id: groupId,
                offset: {
                    x: e.clientX - (group.position.x * zoom + pan.x),
                    y: e.clientY - (group.position.y * zoom + pan.y),
                }
            };
        }
        e.preventDefault();
        e.stopPropagation();
        startGlobalInteraction();
    };

    const handleSaveSelectionAsPreset = (nodeId?: string) => {
        const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
        if (nodeId && !selectedIds.has(nodeId)) {
            selectedIds.clear();
            selectedIds.add(nodeId);
        }
        if (selectedIds.size === 0) return;

        const selectedNodes = nodes.filter(n => selectedIds.has(n.id));
        const selectedConnections = connections.filter(c => selectedIds.has(c.from) && selectedIds.has(c.to));
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        const minY = Math.min(...selectedNodes.map(n => n.position.y));

        const serializableNodes: SerializedNode[] = selectedNodes.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            position: { x: node.position.x - minX, y: node.position.y - minY },
            content: node.content,
            instruction: node.instruction,
            inputImage: node.inputImage,
            width: node.width,
            height: node.height,
            selectedModel: node.selectedModel,
        }));
        const serializableConnections: SerializedConnection[] = selectedConnections.map(({ from, to }) => ({ fromNode: from, toNode: to }));

        const newAsset: WorkflowAsset = {
            id: `preset-${Date.now()}`,
            name: `Preset ${new Date().toLocaleTimeString()}`,
            tags: ['preset'],
            notes: 'Saved from selection',
            nodes: serializableNodes,
            connections: serializableConnections,
            visibility: 'private',
            ownerId: currentUser.id,
        };
        saveAssets([...assets, newAsset]);
        if (supabaseEnabled) {
            upsertAsset(newAsset).catch(err => console.error("Supabase asset sync failed:", err));
        }
        setToast('已保存到预设');
        setTimeout(() => setToast(null), 2000);
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
            id: groupId, name: `New Group ${groups.length + 1}`, nodeIds,
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

        // A node's own image should only be an input if it's a root node (no inputs),
        // implying the image was user-uploaded for editing.
        const isGenerated = connectionsRef.current.some(c => c.to === nodeId);
        // We also strictly check status. If success, it's likely a previous generation, so ignore it unless user explicitly wants to re-gen.
        const isPreviousOutput = nodeToExecute.status === 'success';
        if (nodeToExecute.type === 'image' && nodeToExecute.inputImage && !isGenerated && !isPreviousOutput) {
            inputs.push({ type: 'image', data: nodeToExecute.inputImage });
        }

        const instructionToUse = instructionFromInput !== undefined ? instructionFromInput : nodeToExecute.instruction;

        try {
            const result = await runNode(
                instructionToUse,
                nodeToExecute.type,
                inputs,
                nodeToExecute.selectedModel,
                apiKey || undefined
            );

            if (result.type === 'image') {
                // Reset dimensions for new generated image to trigger auto-sizing
                updateNodeData(nodeId, { 
                    status: 'success', 
                    inputImage: result.content, 
                    content: 'Generated image',
                    width: undefined, // Force re-calculation of dimensions
                    height: undefined 
                });
                const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                const historyItem: HistoryItem = { id: `hist-${Date.now()}`, timestamp: new Date(), image: result.content, prompt: instructionToUse, context, nodeName: nodeToExecute.name, ownerId: currentUser.id };
                setHistory(h => [historyItem, ...h]);
                if (supabaseEnabled) {
                    insertHistoryItem(historyItem, currentUser.id).catch(err => console.error("Supabase history insert failed:", err));
                }
            } else {
                const update: Partial<Node> = { status: 'success', content: result.content };
                if (nodeToExecute.type === 'image') {
                    // An image node returned text. This can happen if the model can't fulfill
                    // the image edit request and provides a text explanation instead.
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
        // Topology uses only internal connections to determine execution order
        const groupConnections = connectionsRef.current.filter(c => groupNodeIds.has(c.from) && groupNodeIds.has(c.to));

        if (allNodesInGroup.length === 0) return;

        // 1. Initialize Topology
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        
        // Initialize data store for the run. 
        const executionData = new Map<string, Node>();
        nodesRef.current.forEach(node => {
            const isGenerated = connectionsRef.current.some(c => c.to === node.id);
            // Important: If a node has 'success' status or 'running', its content might be stale output from a previous run.
            // We should clear it for the execution snapshot unless it's a root node that was USER uploaded (status='idle').
            const isStaleOutput = (node.status === 'success' || node.status === 'running' || node.status === 'error');
            
            const cleanNode = { ...node };
            if (isStaleOutput) {
                // If it's a generated node (has inputs), or if it's a root node that ran previously, clear data.
                // However, for root nodes, we must be careful.
                if (isGenerated) {
                     cleanNode.content = node.type === 'image' ? '' : '';
                     cleanNode.inputImage = null;
                } else {
                    // It's a root node. If it ran before (status=success), the inputImage currently holds the OUTPUT of that run.
                    // We DO NOT want to feed that output back in as input for a text-to-image gen.
                    // BUT, if it's an img2img workflow, maybe we do?
                    // Heuristic: If it has an instruction and is an image node, and status is success, assume previous run was T2I and clear.
                    if (node.type === 'image' && node.instruction) {
                         cleanNode.inputImage = null;
                    }
                }
            }
            executionData.set(node.id, cleanNode);
        });

        // Initialize adjacency only for group nodes
        allNodesInGroup.forEach(node => {
            adj.set(node.id, []);
            inDegree.set(node.id, 0);
        });

        groupConnections.forEach(conn => {
            adj.get(conn.from)?.push(conn.to);
            inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
        });

        // 2. Reset UI State for group nodes
        setNodes(prevNodes => prevNodes.map(n => {
            if (groupNodeIds.has(n.id)) {
                // Reset status
                const isGenerated = connectionsRef.current.some(c => c.to === n.id); // Check strictly if it has ANY input, not just internal
                return {
                    ...n,
                    status: 'idle',
                    // Clear content only if it acts as a receiver in this specific flow context? 
                    // Actually, standard behavior is to clear output before run.
                    content: isGenerated && n.type === 'text' ? '' : n.content,
                    inputImage: isGenerated ? null : n.inputImage,
                };
            }
            return n;
        }));

        const newHistoryItems: HistoryItem[] = [];

        // 3. Parallel Execution Function
        const triggerNode = async (nodeId: string) => {
            const currentNodeData = executionData.get(nodeId);
            if (!currentNodeData) return;

            // Set 'running' state in UI
            setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'running' } : n));

            // Highlight Connections (Additive)
            // We want to highlight ALL incoming connections to this node, even from outside the group
            const incomingConns = connectionsRef.current.filter(c => c.to === nodeId);
            const incomingConnIds = incomingConns.map(c => c.id);
            
            if (incomingConnIds.length > 0) {
                setActiveConnectionIds(prev => {
                    const next = new Set(prev);
                    incomingConnIds.forEach(id => next.add(id));
                    return next;
                });
            }

            // UX: Small delay to ensure the connection highlight is visible and the UI updates
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                // Determine if this node is "generated" (has inputs). 
                // We check global connections because a group node might receive from outside.
                const hasInputs = incomingConns.length > 0;
                const hasInstruction = currentNodeData.instruction.trim().length > 0;

                // Optimization: If a root node (no inputs) has no instruction, it's static data.
                // But if it has an image (User Uploaded), we shouldn't skip it if downstream depends on it.
                // The 'runNode' call handles "just pass data" if needed, but usually we only call API if there is work.
                // Actually, nodes without inputs don't *run* API unless they are generators (have instruction).
                if (!hasInputs && !hasInstruction) {
                    // It's a static provider node (like an uploaded image with no prompt).
                    // We don't need to call API. We just mark success so children can run.
                    // The data is already in executionData.
                } else {
                    // Prepare inputs from executionData
                    // Since executionData now has all nodes, this works for external dependencies too.
                    const inputNodesData = incomingConns
                        .map(c => executionData.get(c.from))
                        .filter(n => n !== undefined) as Node[];
                    
                    const inputs = inputNodesData.map(n => ({ 
                        type: n.type, 
                        data: n.type === 'image' ? n.inputImage : n.content 
                    }));

                    // Self-image input (if it's a root node effectively for this operation or purely editing)
                    // If hasInputs is false, it's a root. If it has inputs, we generally don't use its own image unless specifically handled?
                    if (currentNodeData.type === 'image' && currentNodeData.inputImage && !hasInputs) {
                        inputs.push({ type: 'image', data: currentNodeData.inputImage });
                    }

                    const result = await runNode(
                        currentNodeData.instruction,
                        currentNodeData.type,
                        inputs,
                        currentNodeData.selectedModel,
                        apiKey || undefined
                    );

                    // Update Local Data
                    const updatedNode = { ...currentNodeData };
                    if (result.type === 'image') {
                        updatedNode.inputImage = result.content;
                        updatedNode.content = 'Generated image';
                        // Store history item
                        const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                        const histItem: HistoryItem = { 
                            id: `hist-${Date.now()}-${nodeId}`, 
                            timestamp: new Date(), 
                            image: result.content, 
                            prompt: currentNodeData.instruction, 
                            context, 
                            nodeName: currentNodeData.name,
                            ownerId: currentUser.id,
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

                // Trigger Children
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
                console.error(`Workflow execution failed at node ${nodeId}.`);
            } finally {
                // Remove connections highlights (Subtractive)
                if (incomingConnIds.length > 0) {
                    setActiveConnectionIds(prev => {
                        const next = new Set(prev);
                        incomingConnIds.forEach(id => next.delete(id));
                        return next;
                    });
                }
                
                if (newHistoryItems.length > 0) {
                    setHistory(h => [...newHistoryItems.filter(item => !h.some(existing => existing.id === item.id)).reverse(), ...h]);
                    if (supabaseEnabled) {
                        newHistoryItems.forEach(item => insertHistoryItem({ ...item, ownerId: currentUser.id }, currentUser.id).catch(err => console.error("Supabase history insert failed:", err)));
                    }
                    newHistoryItems.length = 0; 
                }
            }
        };

        // 4. Start Execution for Roots (nodes with 0 in-degree within the group)
        // Note: Nodes with inputs from OUTSIDE the group will have in-degree 0 here, which is correct.
        const roots = allNodesInGroup.filter(n => inDegree.get(n.id) === 0);
        roots.forEach(n => triggerNode(n.id));
    };

    // Asset Management + History bootstrap
    const defaultAsset: WorkflowAsset = useMemo(() => ({
        id: 'asset-default-multimodal-1',
        name: "Default multimodal image flow",
        tags: ['default', 'multimodal', 'image'],
        notes: "Sample workflow combining text and image inputs to produce a new image.",
        visibility: 'public',
        nodes: [
            { id: 'default-image-1', name: 'Image 1', type: 'image', position: { x: 0, y: 0 }, content: '', instruction: '', inputImage: null, selectedModel: 'gemini-2.5-flash-image' },
            { id: 'default-text-1', name: 'Text 1', type: 'text', position: { x: 0, y: 250 }, content: '', instruction: '', inputImage: null, selectedModel: 'gemini-3-pro-preview' },
            { id: 'default-image-2', name: 'Image 2', type: 'image', position: { x: 400, y: 125 }, content: '', instruction: 'Add the text as a watermark to the image.', inputImage: null, selectedModel: 'gemini-2.5-flash-image' },
        ],
        connections: [
            { fromNode: 'default-image-1', toNode: 'default-image-2' },
            { fromNode: 'default-text-1', toNode: 'default-image-2' }
        ],
    }), [])

    const loadAssetsAndHistory = useCallback(async () => {
        // 未登录（guest）且启用了 Supabase 时，不要去请求远端，避免 401/403
        const canUseSupabase = supabaseEnabled && currentUser.role !== 'guest';
        if (canUseSupabase) {
            try {
                const [remoteAssets, remoteHistory] = await Promise.all([fetchAssets(), fetchHistoryItems()]);
                const normalizedAssets = (remoteAssets || []).map(a => ({ ...a, visibility: a.visibility || 'public' as const }));
                if (normalizedAssets.length > 0) {
                    setAssets(normalizedAssets);
                } else {
                    const ownedDefault = { ...defaultAsset, ownerId: currentUser.id };
                    setAssets([ownedDefault]);
                    await upsertAsset(ownedDefault);
                }
                if (remoteHistory.length > 0) {
                    const filteredHistory = remoteHistory.filter(item => !item.ownerId || currentUser.role === 'admin' || item.ownerId === currentUser.id);
                    setHistory(filteredHistory);
                }
                return;
            } catch (error) {
                console.error("Failed to load data from Supabase, falling back to local storage:", error);
            }
        }

        try {
            const savedAssets = localStorage.getItem('gemini-canvas-assets')
            if (savedAssets) {
                const parsed: WorkflowAsset[] = JSON.parse(savedAssets);
                setAssets(parsed.map(a => ({ ...a, visibility: a.visibility || 'public' as const })));
            } else {
                const assetsToSave = [defaultAsset];
                setAssets(assetsToSave);
                localStorage.setItem('gemini-canvas-assets', JSON.stringify(assetsToSave));
            }
        } catch (error) {
            console.error("Failed to load assets from local storage:", error);
        }
    }, [supabaseEnabled, defaultAsset, currentUser])

    useEffect(() => {
        loadAssetsAndHistory()
    }, [loadAssetsAndHistory])

    // Load API key from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('user-api-key');
            if (stored) {
                setApiKey(stored);
                setApiKeyDraft(stored);
            }
        } catch (error) {
            console.error("Failed to read API key from localStorage:", error);
        }
    }, [])

    // Load auth state and authorized users (with Supabase fallback)
    const deriveRole = useCallback((email?: string, metadataRole?: string) => {
        const adminList = (((import.meta as any).env?.VITE_ADMIN_EMAILS) || '')
            .split(',')
            .map((s: string) => s.trim().toLowerCase())
            .filter(Boolean);
        const em = (email || '').trim().toLowerCase();
        const isAdmin = metadataRole === 'admin' || adminList.includes(em);
        console.log('[auth] email=', em, 'metadataRole=', metadataRole, 'envAdmins=', adminList, 'isAdmin=', isAdmin);
        return isAdmin ? 'admin' : 'user';
    }, []);

    useEffect(() => {
        const auth = supabaseAuth();
        if (!auth) return;
        auth.getSession().then(({ data }) => {
            const session = data.session;
            if (session?.user) {
                const role = deriveRole(session.user.email || '', (session.user.user_metadata as any)?.role);
                setCurrentUser({ role, name: session.user.email || 'User', id: session.user.id });
            }
        });
        const { data: sub } = auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const role = deriveRole(session.user.email || '', (session.user.user_metadata as any)?.role);
                setCurrentUser({ role, name: session.user.email || 'User', id: session.user.id });
                setIsAuthModalOpen(false); // 登录后自动关闭弹窗
            } else {
                setCurrentUser({ role: 'guest', name: 'Guest' });
                setIsAuthModalOpen(true); // 未登录时显示登录
                setIsAccountModalOpen(false);
            }
        });
        return () => { sub?.subscription.unsubscribe(); };
    }, [deriveRole]);

    useEffect(() => {
        const loadUsersForAdmin = async () => {
            if (!supabaseEnabled || currentUser.role !== 'admin') return;
            try {
                const remoteUsers = await fetchUsers();
                setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.name, password: u.password })));
            } catch (error) {
                console.error("Failed to load users from Supabase:", error);
            }
        };
        loadUsersForAdmin();
    }, [supabaseEnabled, currentUser]);

    const saveAssets = useCallback(async (updatedAssets: WorkflowAsset[]) => {
        const normalized = updatedAssets.map(a => ({
            ...a,
            visibility: a.visibility || 'public',
            ownerId: a.ownerId || currentUser.id,
        }));
        setAssets(normalized);
        if (supabaseEnabled) {
            await Promise.all(normalized.map(asset => upsertAsset(asset).catch(err => console.error("Supabase asset sync failed:", err))));
        } else {
            localStorage.setItem('gemini-canvas-assets', JSON.stringify(normalized));
        }
    }, [supabaseEnabled, currentUser.id]);

    const handleSaveAsset = (details: { name: string, tags: string[], notes: string, visibility: 'public' | 'private' }) => {
        if (!groupToSave) return;
        if (currentUser.role === 'guest') {
            alert('请先登录再保存工作流。');
            return;
        }

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
            id: `asset-${Date.now()}`,
            ...details,
            nodes: serializableNodes,
            connections: serializableConnections,
            visibility: details.visibility || 'public',
            ownerId: currentUser.id,
        };

        saveAssets([...assets, newAsset]);
        setIsSaveAssetModalOpen(false);
        setGroupToSave(null);
        setToast('Asset saved');
        setTimeout(() => setToast(null), 3000);
    };

    const handleDeleteAsset = (assetId: string) => {
        const target = assets.find(a => a.id === assetId);
        if (target && target.visibility === 'private' && target.ownerId && currentUser.role !== 'admin' && target.ownerId !== currentUser.id) {
            alert('无权删除其他用户的私密工作流');
            return;
        }
        const remaining = assets.filter(a => a.id !== assetId);
        saveAssets(remaining);
        if (supabaseEnabled) {
            deleteAsset(assetId).catch(err => console.error("Supabase asset delete failed:", err));
        }
    };

    const addWorkflowToCanvas = (workflow: WorkflowAsset | { nodes: SerializedNode[], connections: SerializedConnection[], visibility?: 'public' | 'private', ownerId?: string }) => {
        // We don't strictly record history here as it's a big operation, 
        // but usually it's good to have an undo point.
        recordHistory();
        deselectAll();

        const visibility = (workflow as WorkflowAsset).visibility || 'public';
        const ownerId = (workflow as WorkflowAsset).ownerId;
        const shouldLock = visibility === 'private' && ownerId && currentUser.role !== 'admin' && ownerId !== currentUser.id;
        const isPreset = Array.isArray((workflow as WorkflowAsset).tags) && (workflow as WorkflowAsset).tags!.includes('preset');

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
                ...nodeData, id: newId, status: 'idle', selected: false,
                width: nodeData.width || (nodeData.type === 'image' ? DEFAULT_NODE_WIDTH : undefined),
                height: nodeData.height || (nodeData.type === 'image' ? DEFAULT_NODE_HEIGHT : undefined),
                position: {
                    x: nodeData.position.x - minX + targetPos.x,
                    y: nodeData.position.y - minY + targetPos.y,
                },
                selectedModel: nodeData.selectedModel,
                locked: shouldLock,
            };
        });
        const loadedConnections: ConnectionType[] = workflow.connections.map((connData: SerializedConnection) => {
            const fromId = idMap.get(connData.fromNode);
            const toId = idMap.get(connData.toNode);
            return { id: `${fromId}-${toId}`, from: fromId!, to: toId! };
        }).filter(c => c.from && c.to);

        setNodes(n => [...n, ...loadedNodes]);
        setConnections(c => [...c, ...loadedConnections]);

        // Auto-group the imported workflow for easier selection
        if (!isPreset) {
            const groupId = `group-${Date.now()}`;
            const namesafe = (workflow as WorkflowAsset).name || '导入工作流';
            const bounds = {
                left: Math.min(...loadedNodes.map(n => n.position.x)),
                top: Math.min(...loadedNodes.map(n => n.position.y)),
                right: Math.max(...loadedNodes.map(n => n.position.x + (n.width || DEFAULT_NODE_WIDTH))),
                bottom: Math.max(...loadedNodes.map(n => n.position.y + (n.height || DEFAULT_NODE_HEIGHT))),
            };
            const GROUP_PADDING = 60;
            const size = { width: bounds.right - bounds.left + GROUP_PADDING * 2, height: bounds.bottom - bounds.top + GROUP_PADDING * 2 };
            setGroups(g => [...g, {
                id: groupId,
                name: namesafe,
                nodeIds: loadedNodes.map(n => n.id),
                position: { x: bounds.left - GROUP_PADDING, y: bounds.top - GROUP_PADDING },
                size,
                selected: true,
            }]);
        }
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
                setToast('Copied');
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
        setHistory(h => h.filter(item => item.ownerId && item.ownerId !== currentUser.id && currentUser.role !== 'admin'));
        if (supabaseEnabled) {
            clearHistoryItems(currentUser.role === 'admin' ? undefined : currentUser.id).catch(err => console.error("Supabase clear history failed:", err));
        }
    }, [supabaseEnabled, currentUser]);

    const handleDeleteHistoryItem = useCallback((id: string) => {
        setHistory(h => h.filter(item => item.id !== id));
        setSelectedHistoryItem(currentItem => {
            if (currentItem && currentItem.id === id) {
                return null;
            }
            return currentItem;
        });
        if (supabaseEnabled) {
            removeHistoryItem(id, currentUser.role === 'admin' ? undefined : currentUser.id).catch(err => console.error("Supabase delete history failed:", err));
        }
    }, [supabaseEnabled, currentUser]);

    const handleBulkDeleteHistory = useCallback((ids: string[]) => {
        setHistory(h => h.filter(item => !ids.includes(item.id)));
        setHistoryModalSelection(new Set());
        if (supabaseEnabled) {
            ids.forEach(id => removeHistoryItem(id, currentUser.role === 'admin' ? undefined : currentUser.id).catch(err => console.error("Supabase delete history failed:", err)));
        }
    }, [supabaseEnabled, currentUser]);

    // API Key modal handlers
    const handleSaveApiKey = () => {
        setApiKey(apiKeyDraft.trim() || null);
        try {
            if (apiKeyDraft.trim()) {
                localStorage.setItem('user-api-key', apiKeyDraft.trim());
            } else {
                localStorage.removeItem('user-api-key');
            }
        } catch (error) {
            console.error("Failed to write API key to localStorage:", error);
        }
        setIsApiKeyModalOpen(false);
    };

    const handleClearApiKey = () => {
        setApiKey(null);
        setApiKeyDraft('');
        try {
            localStorage.removeItem('user-api-key');
        } catch (error) {
            console.error("Failed to clear API key from localStorage:", error);
        }
    };

    // Auth handlers
    const persistAuthorizedUsers = (users: { id?: string; name: string; password: string; }[]) => {
        setAuthorizedUsers(users);
        try {
            localStorage.setItem('authorized-users', JSON.stringify(users));
        } catch (error) {
            console.error("Failed to save authorized users:", error);
        }
    };

    const handleLogin = async (register = false) => {
        const auth = supabaseAuth();
        if (!auth) return;
        try {
            if (register) {
                const { error } = await auth.signUp({ email: loginName, password: loginPassword });
                if (error) throw error;
                setToast('注册成功，请登录');
                setTimeout(() => setToast(null), 2000);
                return;
            }
            const { data, error } = await auth.signInWithPassword({ email: loginName, password: loginPassword });
            if (error || !data.session) throw error || new Error('No session');
            const role = deriveRole(data.session.user.email || '', (data.session.user.user_metadata as any)?.role);
            setCurrentUser({ role, name: data.session.user.email || 'User', id: data.session.user.id });
            setIsAuthModalOpen(false);
        } catch (error) {
            alert("登录失败，请检查邮箱/密码");
        }
    };

    // Admin create new user via Supabase Auth (email/password)
    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPassword) {
            alert('请输入授权邮箱和密码');
            return;
        }
        try {
            await upsertUser({ name: newUserEmail.trim(), password: newUserPassword });
            setToast('创建授权账号成功');
            setNewUserEmail('');
            setNewUserPassword('');
            setTimeout(() => setToast(null), 2000);
            // refresh list
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.name, password: u.password })));
        } catch (err) {
            alert('创建授权账号失败：' + (err as Error).message);
        }
    };

    const handleLogout = async () => {
        const auth = supabaseAuth();
        if (auth) await auth.signOut();
        setCurrentUser({ role: 'guest', name: 'Guest' });
        setLoginName('');
        setLoginPassword('');
        setNodes([]);
        setConnections([]);
        setGroups([]);
        setHistory([]);
    };

    const handleAddAuthorizedUser = async () => {
        if (!supabaseEnabled) return;
        if (!newAuthorizedName || !newAuthorizedPassword) return;
        try {
            const auth = supabaseAuth();
            if (auth) {
                const { error } = await auth.signUp({ email: newAuthorizedName, password: newAuthorizedPassword });
                if (error) throw error;
            }
            await upsertUser({ name: newAuthorizedName, password: '' });
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.name, password: u.password })));
            setNewAuthorizedName('');
            setNewAuthorizedPassword('');
            setToast('已添加授权账号');
            setTimeout(() => setToast(null), 2000);
        } catch (error) {
            alert('添加授权账号失败，请检查邮箱是否已存在');
        }
    };
    const handleRemoveAuthorizedUser = async (name: string) => {
        if (!supabaseEnabled) return;
        try {
            const target = authorizedUsers.find(u => u.name === name);
            if (target?.id) await deleteUser(target.id);
            const remoteUsers = await fetchUsers();
            setAuthorizedUsers(remoteUsers.map(u => ({ id: u.id, name: u.name, password: u.password })));
        } catch (error) {
            console.error("Failed to delete user:", error);
        }
    };

    if (currentUser.role === 'guest') {
        return (
            <div className="w-screen h-screen bg-[#0f1118] flex items-center justify-center text-slate-200">
                <div className="bg-[#141925] border border-slate-700 rounded-3xl shadow-2xl w-full max-w-3xl p-10 space-y-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">登录到工作流画布</h1>
                        <p className="text-sm text-slate-400 mt-2">使用您的邮箱和密码登录。管理员可以在登录后添加授权账号。</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-3">
                            <input
                                type="email"
                                value={loginName}
                                onChange={e => setLoginName(e.target.value)}
                                placeholder="邮箱"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                                type="password"
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                                placeholder="密码"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex items-center gap-3">
                                <button onClick={() => handleLogin()} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm">登录</button>
                                <button onClick={() => handleLogin(true)} className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-500 text-sm">注册</button>
                            </div>
                        </div>
                        <div className="space-y-3 bg-slate-900/60 rounded-2xl border border-slate-700 p-4">
                            <h3 className="text-sm font-semibold text-slate-200">提示</h3>
                            <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
                                <li>登录后才能进入画布和节点操作</li>
                                <li>管理员邮箱（env: VITE_ADMIN_EMAILS 或 Supabase metadata role=admin）可管理 API 与授权账号</li>
                                <li>忘记密码请在 Supabase 控制台重置或使用注册创建新账号</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="w-screen h-screen overflow-hidden cursor-default text-slate-200 font-sans select-none"
            onWheel={(e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    const pointer = { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) };
                    const scale = e.deltaY * -0.001;
                    zoomAroundPoint(zoom + scale, { x: pointer.x + (rect?.left || 0), y: pointer.y + (rect?.top || 0) });
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
                    backgroundColor: '#0f1118',
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                }}
            />

            {toast && createPortal(
                <div className="fixed top-8 left-1/2 -translate-x-1/2 glass-panel text-white px-6 py-3 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.3)] z-[9997] toast-animate border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse"></div>
                    {toast}
                </div>,
                document.body
            )}

            {/* Add API Key Selection Button here if needed based on platform, 
                though gemini-3-pro-image-preview requires it, 
                for now assuming environment key is valid or handled elsewhere 
                to minimize UI clutter as per prompt request to only add model selection. */}

            <div className={`absolute top-0 left-0 w-full h-full ${currentUser.role === 'guest' ? 'pointer-events-none opacity-10 blur-sm' : 'pointer-events-none'}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
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
                    onMouseDown={handleGroupMouseDown}
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
                        onContextMenu={handleNodeContextMenu}
                    />
                ))}

                {activeNode && !isDraggingNode && (
                    <InstructionInput
                        node={activeNode}
                        onDataChange={updateNodeData}
                        onExecute={(nodeId, instruction) => executeNode(nodeId, instruction)}
                    />
                )}
            </div>

            {contextMenu && <ContextMenu {...contextMenu} onClose={closeContextMenu} />}

            {selectionBox && <div className="absolute border border-neon-blue/50 bg-neon-blue/10 pointer-events-none rounded-md backdrop-blur-[1px]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}

            {toolbarPosition && selectionType !== 'none' && (
                <SelectionToolbar position={toolbarPosition} onGroup={groupSelectedNodes} onUngroup={ungroupSelectedNodes} selectionType={selectionType} />
            )}

            {viewerContent && <ViewerModal {...viewerContent} onClose={() => setViewerContent(null)} />}

            {isSaveAssetModalOpen && groupToSave && (
                <SaveAssetModal groupName={groupToSave.name} defaultVisibility="public" onClose={() => setIsSaveAssetModalOpen(false)} onSave={handleSaveAsset} />
            )}

            {selectedHistoryItem && <HistoryDetailModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />}

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-[#111827] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[80vh] p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">历史图库</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    disabled={historyModalSelection.size === 0}
                                    onClick={() => handleBulkDeleteHistory(Array.from(historyModalSelection))}
                                    className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-500'}`}
                                >
                                    删除选中
                                </button>
                                <button
                                    disabled={historyModalSelection.size === 0}
                                    onClick={() => {
                                        history.filter(h => historyModalSelection.has(h.id)).forEach(item => {
                                            const a = document.createElement('a');
                                            a.href = `data:image/png;base64,${item.image}`;
                                            a.download = `${item.nodeName || 'history'}.png`;
                                            a.click();
                                        });
                                    }}
                                    className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-600 text-white hover:bg-slate-500'}`}
                                >
                                    下载选中
                                </button>
                                <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-300 hover:text-white">&times;</button>
                            </div>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {history.map(item => (
                                <div key={item.id} className={`relative bg-slate-800/70 border ${historyModalSelection.has(item.id) ? 'border-sky-500' : 'border-slate-700'} rounded-lg overflow-hidden`}>
                                    <div className="absolute top-2 left-2">
                                        <input
                                            type="checkbox"
                                            checked={historyModalSelection.has(item.id)}
                                            onChange={(e) => {
                                                setHistoryModalSelection(prev => {
                                                    const next = new Set(prev);
                                                    if (e.target.checked) next.add(item.id); else next.delete(item.id);
                                                    return next;
                                                });
                                            }}
                                        />
                                    </div>
                                    <img src={`data:image/png;base64,${item.image}`} alt={item.nodeName} className="w-full h-40 object-cover" />
                                    <div className="p-2 text-sm text-slate-200 space-y-1">
                                        <p className="font-semibold line-clamp-1">{item.nodeName}</p>
                                        <p className="text-xs text-slate-400 line-clamp-2">{item.prompt}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isAssetLibraryOpen && (
                <AssetLibrary
                    assets={visibleAssets}
                    onClose={() => setIsAssetLibraryOpen(false)}
                    onAdd={addWorkflowToCanvas}
                    onDownload={(asset) => {
                        const payload = { ...asset, nodes: asset.nodes, connections: asset.connections };
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
                        const a = document.createElement('a');
                        a.href = dataStr;
                        a.download = `${asset.name.replace(/\s/g, '_')}.json`;
                        a.click();
                    }}
                    onDelete={handleDeleteAsset}
                />
            )}

            {/* Portal overlay: toolbar, history tray, shortcuts */}
            <UIOverlay
                currentUser={currentUser}
                onLogout={handleLogout}
                onLoad={addWorkflowToCanvas}
                onOpenLibrary={() => setIsAssetLibraryOpen(true)}
                onOpenHistory={() => setIsHistoryModalOpen(true)}
                onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
                onOpenAuthModal={() => setIsAccountModalOpen(true)}
                history={visibleHistory}
                onSelectHistory={setSelectedHistoryItem}
                onClearHistory={handleClearHistory}
                onDeleteHistory={handleDeleteHistoryItem}
                zoom={zoom}
                onZoomChange={(z) => zoomAroundPoint(z)}
            />

            {isApiKeyModalOpen && currentUser.role === 'admin' && (
                createPortal(
                    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsApiKeyModalOpen(false)}>
                        <div className="bg-[#1f2937] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold text-white">Set Gemini API Key</h2>
                                <button onClick={() => setIsApiKeyModalOpen(false)} className="text-slate-400 hover:text-white">&times;</button>
                            </div>
                            <p className="text-sm text-slate-400">Key is stored locally in your browser (localStorage). Use a limited key for safety.</p>
                            <input
                                type="password"
                                value={apiKeyDraft}
                                onChange={e => setApiKeyDraft(e.target.value)}
                                placeholder="Paste your Gemini API key"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex items-center justify-between text-xs text-slate-400">
                                <span>Current: {apiKey ? 'saved locally' : 'not set'}</span>
                                <button onClick={handleClearApiKey} className="text-red-400 hover:text-red-300">Clear</button>
                            </div>
                            <div className="flex justify-end space-x-2">
                                <button onClick={() => setIsApiKeyModalOpen(false)} className="px-3 py-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600">Cancel</button>
                                <button onClick={handleSaveApiKey} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500">Save</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            )}

            {isAccountModalOpen && currentUser.role !== 'guest' && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsAccountModalOpen(false)}>
                    <div className="bg-[#0f1625] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 text-sm">账户信息</div>
                                <div className="px-2 py-1 rounded-full text-xs border border-slate-600 text-slate-300">
                                    {currentUser.role === 'admin' ? '管理员' : '授权用户'}
                                </div>
                            </div>
                            <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-white text-lg">&times;</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <p className="text-sm text-slate-300">邮箱：{currentUser.name}</p>
                                <p className="text-sm text-slate-300">角色：{currentUser.role}</p>
                            </div>
                            {currentUser.role === 'admin' && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-slate-200">授权账号</h3>
                                    <input
                                        type="email"
                                        value={newUserEmail}
                                        onChange={e => setNewUserEmail(e.target.value)}
                                        placeholder="授权邮箱（Supabase 要求有效邮箱）"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <input
                                        type="password"
                                        value={newUserPassword}
                                        onChange={e => setNewUserPassword(e.target.value)}
                                        placeholder="设置密码"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        onClick={handleCreateUser}
                                        className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm w-fit"
                                    >
                                        创建授权账号
                                    </button>
                                    <p className="text-xs text-slate-400 leading-5">
                                        创建后用户将直接写入 Supabase Auth，请确保邮箱/密码有效。<br />
                                        如果需要查看/删除授权用户，可在 Supabase 控制台的 Authentication → Users 中操作（支持备注）。
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
};

export default App;

