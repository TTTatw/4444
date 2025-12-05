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
import { LoginPage } from './components/LoginPage';
import { AdminDashboard } from './components/AdminDashboard';
import type { Node, Connection as ConnectionType, Point, ContextMenu as ContextMenuType, Group, NodeType, HistoryItem, WorkflowAsset, SerializedNode, SerializedConnection, NodeStatus, BatchItem } from './types';
import { runNode } from './services/geminiService';
import { isSupabaseConfigured, fetchAssets, upsertAsset, deleteAsset, fetchHistoryItems, insertHistoryItem, removeHistoryItem, clearHistoryItems, fetchUsers, upsertUser, deleteUser, supabaseAuth, uploadImage } from './services/storageService';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from './constants';
import { useNodeDrag } from './hooks/useNodeDrag';
import { useConnection } from './hooks/useConnection';
import { useSelection } from './hooks/useSelection';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { useAuth } from './hooks/useAuth';
import { TextIcon, ImageIcon } from './components/Icons';



const MAX_HISTORY = 50;

export const App = () => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [connections, setConnections] = useState<ConnectionType[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [contextMenu, setContextMenu] = useState<ContextMenuType | null>(null);
    const [snapLines, setSnapLines] = useState<{ type: 'v' | 'h'; x1: number; y1: number; x2: number; y2: number }[]>([]);

    // History & Assets
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [sessionHistory, setSessionHistory] = useState<HistoryItem[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [historyModalSelection, setHistoryModalSelection] = useState<Set<string>>(new Set());
    const [assets, setAssets] = useState<WorkflowAsset[]>([]);
    const [groupToSave, setGroupToSave] = useState<Group | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    // Auth & User
    const {
        currentUser, setCurrentUser,
        authorizedUsers, setAuthorizedUsers,
        loginName, setLoginName,
        loginPassword, setLoginPassword,
        authLoading,
        supabaseEnabled,
        isAuthModalOpen, setIsAuthModalOpen,
        isApiKeyModalOpen, setIsApiKeyModalOpen,
        apiKey, setApiKey,
        apiKeyDraft, setApiKeyDraft,
        newUserEmail, setNewUserEmail,
        newUserPassword, setNewUserPassword,
        newAuthorizedName, setNewAuthorizedName,
        newAuthorizedPassword, setNewAuthorizedPassword,
        handleLogin,
        handleLogout,
        handleCreateUser,
        handleAddAuthorizedUser,
        handleRemoveAuthorizedUser,
        persistAuthorizedUsers,
        handleSaveApiKey,
        handleClearApiKey
    } = useAuth();
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
    const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);

    // UI State
    const [viewerContent, setViewerContent] = useState<{ type: NodeType; content: string; name?: string } | null>(null);
    const [isSaveAssetModalOpen, setIsSaveAssetModalOpen] = useState(false);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    // Undo/Redo
    const [past, setPast] = useState<{ nodes: Node[]; connections: ConnectionType[]; groups: Group[] }[]>([]);
    const [future, setFuture] = useState<{ nodes: Node[]; connections: ConnectionType[]; groups: Group[] }[]>([]);

    // Refs
    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const groupsRef = useRef(groups);
    const interactionState = useRef({
        isPanning: false,
        isSelecting: false,
        hasDragged: false,
        startPanPoint: { x: 0, y: 0 },
        dragStart: { x: 0, y: 0 }
    });

    const onMouseMoveRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);
    const onMouseUpRef = useRef<((e: globalThis.MouseEvent) => void) | null>(null);

    const clipboard = useRef<{ nodes: Node[]; connections: ConnectionType[]; groups: Group[] } | null>(null);







    const loadHistoryItems = useCallback(async (page: number) => {
        if (!currentUser.id) return;
        setHistoryLoading(true);
        try {
            const limit = 24;
            const historyData = await fetchHistoryItems(page, limit);
            if (historyData.length < limit) {
                setHasMoreHistory(false);
            } else {
                setHasMoreHistory(true);
            }

            setHistory(prev => page === 1 ? historyData : [...prev, ...historyData]);
            setHistoryPage(page);
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setHistoryLoading(false);
        }
    }, [currentUser.id]);

    // Load History from DB
    useEffect(() => {
        loadHistoryItems(1);
    }, [loadHistoryItems]);

    // Auto-fill history if empty (e.g. after deletion)
    useEffect(() => {
        if (!historyLoading && hasMoreHistory && history.length === 0) {
            loadHistoryItems(1);
        }
    }, [history.length, historyLoading, hasMoreHistory, loadHistoryItems]);

    const { pan, setPan, zoom, setZoom, zoomAroundPoint, screenToWorld, setContainerRef, setCanvasRef, container, canvas } = useCanvasInteraction();

    // Update refs when state changes
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { connectionsRef.current = connections; }, [connections]);
    useEffect(() => { groupsRef.current = groups; }, [groups]);



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

    // Helper functions for useConnection (hoisted)
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
            selectedModel: (type === 'image' || type === 'batch-image') ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview',
        };
        setNodes(ns => [...ns, newNode]);
        return newNode;
    }, [recordHistory]);

    const closeMenuOnly = useCallback(() => {
        setContextMenu(null);
    }, []);

    // --- Hooks Integration ---
    const {
        drawingConnection, previewConnection, startConnection, onConnectorMouseUp, handleDragConnection, cancelConnection,
        onConnectionDrop
    } = useConnection({
        nodes, connections, setConnections, pan, zoom, recordHistory: () => recordHistory(),
        onCreateNode: createNode,
        onOpenContextMenu: setContextMenu,
        onCloseContextMenu: closeMenuOnly
    });

    const closeContextMenu = useCallback(() => {
        closeMenuOnly();
        cancelConnection();
    }, [closeMenuOnly, cancelConnection]);

    const {
        isDraggingNode, startNodeDrag, startGroupDrag, handleDrag, endDrag
    } = useNodeDrag({
        nodes, setNodes, groups, setGroups, pan, zoom, recordHistory: () => recordHistory(),
        setSnapLines
    });

    const {
        selectionBox, selectedConnectionId, activeConnectionIds, activeNodeId,
        setSelectionBox, setSelectedConnectionId, setActiveConnectionIds, setActiveNodeId,
        selectNode, selectGroup, startSelection, updateSelection, endSelection, deselectAll
    } = useSelection({
        setNodes, setGroups
    });

    // Derived State (Memoized for performance)
    const activeNode = useMemo(() => nodes.find(n => n.id === activeNodeId), [nodes, activeNodeId]);
    const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes]);
    const selectedGroups = useMemo(() => groups.filter(g => g.selected), [groups]);
    const generatedNodeIds = useMemo(() => new Set(connections.map(c => c.to)), [connections]);
    const selectionType = useMemo(() => {
        if (selectedGroups.length > 0) return 'groups';
        if (selectedNodes.filter(n => !n.groupId).length > 1) return 'nodes';
        return 'none';
    }, [selectedGroups, selectedNodes]);
    const visibleAssets = useMemo(
        () => assets.filter(a => a.visibility !== 'private' || currentUser.role === 'admin' || a.ownerId === currentUser.id),
        [assets, currentUser]
    );
    const visibleHistory = useMemo(
        () => (history || []).filter(item => !item.ownerId || currentUser.role === 'admin' || item.ownerId === currentUser.id),
        [history, currentUser]
    );

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
                    updatedNode.content = targetNode.type === 'image' ? '生成中...' : '';
                }
            }

            // Auto-disconnect logic for Batch Node Mode Switch
            if (targetNode.type === 'batch-image' && data.batchMode && data.batchMode !== targetNode.batchMode) {
                if (data.batchMode === 'merged') {
                    // Switching to Merged (Input/Source) -> Cannot have Inputs -> Disconnect Incoming
                    setConnections(prev => prev.filter(c => c.to !== id));
                } else {
                    // Switching to Independent (Output/Sink) -> Cannot have Outputs -> Disconnect Outgoing
                    setConnections(prev => prev.filter(c => c.from !== id));
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

    // --- Global Event Handling for Robust Interactions ---

    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
        // Panning
        if (interactionState.current.isPanning) {
            const dx = e.clientX - interactionState.current.dragStart.x;
            const dy = e.clientY - interactionState.current.dragStart.y;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                interactionState.current.hasDragged = true;
            }
            setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
            return;
        }

        // Auto-scroll when selecting near edges
        if (interactionState.current.isSelecting) {
            const EDGE_THRESHOLD = 50;
            const SCROLL_SPEED = 10;
            let dx = 0;
            let dy = 0;

            if (e.clientX < EDGE_THRESHOLD) dx = SCROLL_SPEED;
            if (e.clientX > window.innerWidth - EDGE_THRESHOLD) dx = -SCROLL_SPEED;
            if (e.clientY < EDGE_THRESHOLD) dy = SCROLL_SPEED;
            if (e.clientY > window.innerHeight - EDGE_THRESHOLD) dy = -SCROLL_SPEED;

            if (dx !== 0 || dy !== 0) {
                setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            }
        }

        handleDrag(e);
        handleDragConnection(e);
        updateSelection({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalMouseUp = (e: globalThis.MouseEvent) => {
        interactionState.current.isPanning = false;
        interactionState.current.isSelecting = false;
        endDrag();
        endSelection(nodes, groups, e.ctrlKey || e.metaKey);

        // Handle Connection Drop (Drag to Create)
        onConnectionDrop(e);

        onConnectorMouseUp(null, 'input'); // Pass null/dummy to handle global release (cancel)
        cancelConnection();
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
        // Blur any active element (inputs, textareas) when clicking the canvas
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        if (contextMenu) closeContextMenu();

        const isCanvasClick = (e.target as HTMLElement).closest('[data-id="canvas-bg"]');

        if (e.button === 2) { // Right click panning
            interactionState.current.isPanning = true;
            interactionState.current.hasDragged = false; // Reset drag state
            interactionState.current.startPanPoint = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            interactionState.current.dragStart = { x: e.clientX, y: e.clientY };
            startGlobalInteraction();
            return;
        }

        if (!isCanvasClick) return;

        if (e.button === 0) { // Left click
            if (!e.ctrlKey) deselectAll();
            interactionState.current.isSelecting = true;
            startSelection({ x: e.clientX, y: e.clientY });
        }
        startGlobalInteraction();
    };

    const handleCanvasContextMenu = (e: MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (interactionState.current.hasDragged) return;

        const isCanvasClick = (e.target as HTMLElement).closest('[data-id="canvas-bg"]');
        const position = { x: e.clientX, y: e.clientY };
        const canvasPosition = { x: (position.x - pan.x) / zoom, y: (position.y - pan.y) / zoom };

        const createAndClose = (type: NodeType) => {
            createNode(type, canvasPosition, type === 'text' ? '文本节点' : type === 'batch-image' ? '批量图片节点' : '图片节点');
            closeContextMenu();
        };

        setContextMenu({
            position,
            title: '创建节点',
            options: [
                { label: '文本节点', description: '处理文本输入', action: () => createAndClose('text'), icon: <TextIcon /> },
                { label: '图片节点', description: '生成或显示图片', action: () => createAndClose('image'), icon: <ImageIcon /> },
                { label: '批量图片节点', description: '批量处理或合并图片', action: () => createAndClose('batch-image'), icon: <ImageIcon /> },
            ]
        });
    };

    const handleNodeMouseDown = (nodeId: string, e: MouseEvent) => {
        if (document.activeElement && (document.activeElement as HTMLElement).blur) {
            const tagName = document.activeElement.tagName;
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                (document.activeElement as HTMLElement).blur();
            }
        }
        setActiveNodeId(nodeId);
        e.stopPropagation();
        selectNode(nodeId, e.ctrlKey);
    };

    const handleNodeHeaderMouseDown = (nodeId: string, e: MouseEvent<HTMLElement>) => {
        startNodeDrag(nodeId, e);
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
        selectGroup(groupId, e.ctrlKey);
        startGroupDrag(groupId, e);
        startGlobalInteraction();
    };

    const handleSaveSelectionAsPreset = async (nodeId?: string) => {
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

        setToast('正在保存预设...');

        // Process nodes to upload images if needed
        const serializableNodes: SerializedNode[] = await Promise.all(selectedNodes.map(async (node) => {
            let imageUrl = node.inputImage;

            // Always upload image to 'preset-images/' to ensure independence from history
            // This handles both Base64 (new generation) and URLs (existing history/preset)
            if (imageUrl) {
                const uploadedUrl = await uploadImage(imageUrl, currentUser.id);
                if (uploadedUrl) {
                    imageUrl = uploadedUrl;
                } else {
                    // If upload fails (e.g. RLS error), we keep the original URL but warn the user
                    // This prevents the "silent failure" where preset points to old image
                    console.warn('Failed to upload image to preset bucket, keeping original URL');
                    setToast('图片上传失败(RLS)，仅保存预设数据');
                    setTimeout(() => setToast(null), 3000);
                }
            }

            return {
                id: node.id,
                name: node.name,
                type: node.type,
                position: { x: node.position.x - minX, y: node.position.y - minY },
                content: node.content,
                instruction: node.instruction,
                inputImage: imageUrl,
                width: node.width,
                height: node.height,
                selectedModel: node.selectedModel,
                aspectRatio: node.aspectRatio,
                resolution: node.resolution,
                googleSearch: node.googleSearch,
                batchMode: node.batchMode,
                batchItems: node.batchItems,
            };
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
        // Only show success toast if we didn't show an error toast recently (simple logic: just overwrite)
        // But if upload failed, we already showed a warning. Let's make it clear.
        setToast('预设已保存');
        setTimeout(() => setToast(null), 2000);
    };

    const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string, type: 'input' | 'output') => {
        startConnection(nodeId, type, e);
        startGlobalInteraction();
    };

    const handleConnectorMouseUp = (nodeId: string, type: 'input' | 'output') => {
        onConnectorMouseUp(nodeId, type);
    };

    const groupSelectedNodes = () => {
        const nodesToGroup = selectedNodes.filter(n => !n.groupId);
        if (nodesToGroup.length < 2) return;
        recordHistory();

        const PADDING = 60; // Increased padding
        const HEADER_SPACE = 40; // Increased header space
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

        // Taint Logic: If any node is from a restricted source, the group becomes restricted
        let groupOwnerId: string | undefined = undefined;
        let groupVisibility: 'public' | 'private' | undefined = undefined;

        const restrictedNode = nodesToGroup.find(n => n.sourceVisibility === 'private' && n.ownerId && n.ownerId !== currentUser.id && currentUser.role !== 'admin');
        if (restrictedNode) {
            groupOwnerId = restrictedNode.ownerId;
            groupVisibility = 'private';
        }

        const newGroup: Group = {
            id: groupId, name: `New Group ${groups.length + 1}`, nodeIds,
            position: { x: minX - PADDING, y: minY - PADDING - HEADER_SPACE },
            size: { width: (maxX - minX) + 2 * PADDING, height: (maxY - minY) + 2 * PADDING + HEADER_SPACE },
            selected: true,
            ownerId: groupOwnerId,
            visibility: groupVisibility,
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

        // Remove groups
        setGroups(gs => gs.filter(g => !groupIdsToUngroup.has(g.id)));

        // Update nodes to remove groupId
        setNodes(ns => ns.map(n => nodeIdsInSelectedGroups.has(n.id) ? { ...n, groupId: undefined } : n));
    };

    const runGroupWorkflow = async (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        setIsBatchProcessing(true); // Start batch mode

        const groupNodeIds = new Set(group.nodeIds);
        const allNodesInGroup = nodesRef.current.filter(n => groupNodeIds.has(n.id));
        // Topology uses only internal connections to determine execution order
        const groupConnections = connectionsRef.current.filter(c => groupNodeIds.has(c.from) && groupNodeIds.has(c.to));

        if (allNodesInGroup.length === 0) {
            setIsBatchProcessing(false);
            return;
        }

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
                    // FIX: Never clear inputImage for root nodes. If it was an output from previous run, it's now the input for this run.
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

        // Track active executions to know when to turn off batch mode
        let activeExecutions = 0;
        const checkBatchCompletion = () => {
            if (activeExecutions <= 0) {
                setIsBatchProcessing(false);
            }
        };

        // 3. Parallel Execution Function
        const triggerNode = async (nodeId: string) => {
            const currentNodeData = executionData.get(nodeId);
            if (!currentNodeData) return;

            activeExecutions++;

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

                    // FIX: Explicitly set status to success for static nodes so they don't get stuck in 'running'
                    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'success' } : n));
                    executionData.set(nodeId, { ...currentNodeData, status: 'success' });
                } else {
                    // Prepare inputs from executionData
                    // Since executionData now has all nodes, this works for external dependencies too.
                    const inputNodesData = incomingConns
                        .map(c => executionData.get(c.from))
                        .filter(n => n !== undefined) as Node[];

                    // Sort inputs by X position (left to right)
                    inputNodesData.sort((a, b) => a.position.x - b.position.x);

                    const inputs = inputNodesData.map(n => ({
                        type: n.type,
                        data: n.type === 'image' ? n.inputImage : n.content
                    }));

                    // Self-image input (if it's a root node effectively for this operation or purely editing)
                    // If hasInputs is false, it's a root. If it has inputs, we generally don't use its own image unless specifically handled?
                    if (currentNodeData.type === 'image' && currentNodeData.inputImage && !hasInputs) {
                        inputs.push({ type: 'image', data: currentNodeData.inputImage });
                    }

                    // FIX: Handle Batch Node Logic (Independent vs Merged)
                    if (currentNodeData.type === 'batch-image') {
                        const batchMode = currentNodeData.batchMode || 'independent';

                        if (batchMode === 'merged') {
                            // Merged Mode: Gather all items as inputs + other inputs -> Run Once -> One Result
                            const batchInputs = (currentNodeData.batchItems || []).map(item => ({ type: 'image' as const, data: item.source }));
                            const allInputs = [...inputs, ...batchInputs];

                            const result = await runNode(
                                currentNodeData.instruction || '',
                                currentNodeData.type,
                                allInputs,
                                currentNodeData.selectedModel,
                                apiKey || undefined,
                                {
                                    aspectRatio: currentNodeData.aspectRatio,
                                    resolution: currentNodeData.resolution,
                                    googleSearch: currentNodeData.googleSearch
                                }
                            );

                            // Update Node
                            if (result.type === 'image') {
                                const newItem: BatchItem = {
                                    id: `item-${Date.now()}-${Math.random()}`,
                                    source: result.content,
                                    status: 'success'
                                };
                                const currentItems = currentNodeData.batchItems || [];
                                const updatedNode = { ...currentNodeData, status: 'success', batchItems: [...currentItems, newItem] };
                                executionData.set(nodeId, updatedNode);
                                setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, ...updatedNode, width: undefined, height: undefined } : n));

                                // History
                                const context = allInputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                                const histItem: HistoryItem = {
                                    id: `hist-${Date.now()}-${nodeId}`,
                                    timestamp: new Date(),
                                    image: result.content,
                                    prompt: currentNodeData.instruction || '',
                                    context,
                                    nodeName: currentNodeData.name,
                                    ownerId: currentUser.id,
                                    isPromptSecret: (
                                        (currentNodeData.sourceVisibility === 'private' && currentUser.role !== 'admin') ||
                                        (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
                                    ),
                                };
                                if (histItem.isPromptSecret) { histItem.prompt = ''; histItem.context = ''; }
                                setHistory(h => [histItem, ...h]);
                                setSessionHistory(sh => [histItem, ...sh].slice(0, 24));
                                if (supabaseEnabled) insertHistoryItem(histItem, currentUser.id).catch(console.error);
                            }
                        } else {
                            // Independent Mode: Iterate items -> Run per item -> Update per item
                            const items = currentNodeData.batchItems || [];
                            if (items.length === 0) {
                                // No items, just mark success
                                executionData.set(nodeId, { ...currentNodeData, status: 'success' });
                                setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'success' } : n));
                            } else {
                                const newItems = [...items];
                                // Mark all as running initially? Or incrementally? executeNode does it incrementally.
                                // Let's do parallel execution for speed in group run.
                                const promises = newItems.map(async (item, index) => {
                                    // FORCE RE-RUN: Do not skip success items. User clicked Run, so we Run.
                                    // if (item.status === 'success' && item.result) return; 

                                    // Update status to running
                                    newItems[index] = { ...item, status: 'running' };
                                    // We can't easily update UI incrementally inside this map without causing re-renders loop or race conditions in setNodes if not careful.
                                    // But we should try to show progress.
                                    // For now, let's just run logic.

                                    try {
                                        const itemInputs = [...inputs, { type: 'image' as const, data: item.source }];
                                        const result = await runNode(
                                            currentNodeData.instruction || '',
                                            currentNodeData.type,
                                            itemInputs,
                                            currentNodeData.selectedModel,
                                            apiKey || undefined,
                                            {
                                                aspectRatio: currentNodeData.aspectRatio,
                                                resolution: currentNodeData.resolution,
                                                googleSearch: currentNodeData.googleSearch
                                            }
                                        );

                                        newItems[index] = { ...item, status: 'success', result: result.content };

                                        // History per item
                                        if (result.type === 'image') {
                                            const context = itemInputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                                            const histItem: HistoryItem = {
                                                id: `hist-${Date.now()}-${nodeId}-${index}`,
                                                timestamp: new Date(),
                                                image: result.content,
                                                prompt: currentNodeData.instruction || '',
                                                context,
                                                nodeName: `${currentNodeData.name} (Batch ${index + 1})`,
                                                ownerId: currentUser.id,
                                                isPromptSecret: (
                                                    (currentNodeData.sourceVisibility === 'private' && currentUser.role !== 'admin') ||
                                                    (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
                                                ),
                                            };
                                            if (histItem.isPromptSecret) { histItem.prompt = ''; histItem.context = ''; }
                                            setHistory(h => [histItem, ...h]);
                                            setSessionHistory(sh => [histItem, ...sh].slice(0, 24));
                                            if (supabaseEnabled) insertHistoryItem(histItem, currentUser.id).catch(console.error);
                                        }

                                    } catch (e) {
                                        newItems[index] = { ...item, status: 'error' };
                                    }
                                });

                                await Promise.all(promises);

                                const updatedNode = { ...currentNodeData, status: 'success', batchItems: newItems };
                                executionData.set(nodeId, updatedNode);
                                setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, ...updatedNode, width: undefined, height: undefined } : n));
                            }
                        }
                        window.dispatchEvent(new CustomEvent('credit-update'));

                    } else {
                        // Standard Node Logic (Text/Image)
                        const result = await runNode(
                            currentNodeData.instruction,
                            currentNodeData.type,
                            inputs,
                            currentNodeData.selectedModel,
                            apiKey || undefined,
                            {
                                aspectRatio: currentNodeData.aspectRatio,
                                resolution: currentNodeData.resolution,
                                googleSearch: currentNodeData.googleSearch
                            }
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
                                isPromptSecret: (
                                    (currentNodeData.sourceVisibility === 'private' && currentUser.role !== 'admin') ||
                                    (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
                                ),
                            };
                            // Force clear prompt and context if secret to prevent leakage
                            if (histItem.isPromptSecret) {
                                histItem.prompt = '';
                                histItem.context = '';
                            }
                            // Immediate Save
                            setHistory(h => [histItem, ...h]);
                            setSessionHistory(sh => [histItem, ...sh].slice(0, 24));
                            if (supabaseEnabled) {
                                insertHistoryItem(histItem, currentUser.id).catch(err => console.error("Supabase history insert failed:", err));
                            }
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
                        window.dispatchEvent(new CustomEvent('credit-update'));
                    }
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
                activeExecutions--;
                checkBatchCompletion();

                // Remove connections highlights (Subtractive)
                if (incomingConnIds.length > 0) {
                    setActiveConnectionIds(prev => {
                        const next = new Set(prev);
                        incomingConnIds.forEach(id => next.delete(id));
                        return next;
                    });
                }
            }
        };

        // 4. Start Execution for Roots (nodes with 0 in-degree within the group)
        // Note: Nodes with inputs from OUTSIDE the group will have in-degree 0 here, which is correct.
        const roots = allNodesInGroup.filter(n => inDegree.get(n.id) === 0);
        roots.forEach(n => triggerNode(n.id));
    };

    const handleRetryItem = async (nodeId: string, itemId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || !node.batchItems) return;

        const itemIndex = node.batchItems.findIndex(i => i.id === itemId);
        if (itemIndex === -1) return;

        // Reset item status
        const newItems = [...node.batchItems];
        newItems[itemIndex] = { ...newItems[itemIndex], status: 'running', result: undefined };
        updateNodeData(nodeId, { batchItems: newItems });

        try {
            // Re-run logic similar to executeNode but specific to this item
            // We need to gather inputs again.
            const incomingConns = connections.filter(c => c.to === nodeId);
            const inputNodes = incomingConns.map(c => nodes.find(n => n.id === c.from)).filter(n => n) as Node[];

            // Logic depends on mode
            const batchMode = node.batchMode || 'independent';
            let inputs: { type: NodeType, data: any }[] = [];

            if (batchMode === 'independent') {
                // Independent Mode: Inputs + This Item
                inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));
                inputs.push({ type: 'image', data: newItems[itemIndex].source });
            } else {
                // Merged Mode: Inputs + All Items (This is tricky for single retry, usually merged runs all)
                // If user retries a merged item, it implies re-running the WHOLE merge or just this item?
                // Merged mode produces ONE result from MANY inputs. Retrying one item doesn't make sense unless it's an input item?
                // But batchItems in merged mode are OUTPUTS (if generated) or INPUTS (if uploaded)?
                // Wait, in merged mode, batchItems are INPUTS usually.
                // But my executeNode logic for merged mode says:
                // "For merged mode, add the result as a new item" -> So batchItems are outputs?
                // No, "node.batchItems.forEach(item => inputs.push...)" -> They are inputs.
                // AND "updateNodeData... batchItems: [...currentItems, newItem]" -> They are also outputs?
                // This mixed usage is confusing.
                // Let's assume for now retry is mostly for Independent mode where each item is a generation.
                // For Merged mode, if it's a result item, maybe we just re-run the whole node?
                // Let's stick to Independent mode logic for now as that's the main use case for "Retry Image".

                // Fallback to independent logic for retry
                inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));
                inputs.push({ type: 'image', data: newItems[itemIndex].source });
            }

            const result = await runNode(
                node.instruction || '',
                node.type,
                inputs,
                node.selectedModel,
                apiKey,
                {
                    aspectRatio: node.aspectRatio,
                    resolution: node.resolution,
                    googleSearch: node.googleSearch
                }
            );

            // Update Item
            const updatedItems = [...(nodes.find(n => n.id === nodeId)?.batchItems || [])];
            const updatedIndex = updatedItems.findIndex(i => i.id === itemId);
            if (updatedIndex !== -1) {
                updatedItems[updatedIndex] = { ...updatedItems[updatedIndex], status: 'success', result: result.content };
                updateNodeData(nodeId, { batchItems: updatedItems });

                // Save History
                if (result.type === 'image') {
                    const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                    const histItem: HistoryItem = {
                        id: `hist-${Date.now()}-${nodeId}-${itemId}`,
                        timestamp: new Date(),
                        image: result.content,
                        prompt: node.instruction || '',
                        context,
                        nodeName: `${node.name} (Retry)`,
                        ownerId: currentUser.id,
                        isPromptSecret: false // Simplify for retry
                    };
                    setHistory(prev => [histItem, ...prev]);
                    setSessionHistory(prev => [histItem, ...prev].slice(0, 24));
                    if (supabaseEnabled) insertHistoryItem(histItem).catch(console.error);
                }
            }

        } catch (error) {
            const updatedItems = [...(nodes.find(n => n.id === nodeId)?.batchItems || [])];
            const updatedIndex = updatedItems.findIndex(i => i.id === itemId);
            if (updatedIndex !== -1) {
                updatedItems[updatedIndex] = { ...updatedItems[updatedIndex], status: 'error' };
                updateNodeData(nodeId, { batchItems: updatedItems });
            }
        }
    };

    const executeNode = async (nodeId: string, instruction?: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Update instruction if provided
        if (instruction !== undefined) {
            updateNodeData(nodeId, { instruction });
        }

        setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, status: 'running' } : n));

        // Highlight Connections
        const incomingConns = connections.filter(c => c.to === nodeId);
        const incomingIds = incomingConns.map(c => c.id);

        if (incomingIds.length > 0) {
            setActiveConnectionIds(prev => {
                const next = new Set(prev);
                incomingIds.forEach(id => next.add(id));
                return next;
            });
        }

        try {
            if (node.type === 'batch-image') {
                // Batch Logic
                const batchMode = node.batchMode || 'independent';
                const inputNodes = incomingConns.map(c => nodes.find(n => n.id === c.from)).filter(n => n) as Node[];

                if (batchMode === 'merged') {
                    const inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));
                    if (node.batchItems) {
                        node.batchItems.forEach(item => inputs.push({ type: 'image', data: item.source }));
                    }

                    const result = await runNode(node.instruction || '', node.type, inputs, node.selectedModel, apiKey);

                    // For merged mode, add the result as a new item
                    if (result.type === 'image') {
                        const newItem: BatchItem = {
                            id: `item-${Date.now()}-${Math.random()}`,
                            source: result.content,
                            status: 'success'
                        };
                        const currentItems = node.batchItems || [];
                        updateNodeData(nodeId, {
                            status: 'success',
                            batchItems: [...currentItems, newItem]
                        });

                        // Save History for Merged Batch
                        const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                        const histItem: HistoryItem = {
                            id: `hist-${Date.now()}-${nodeId}`,
                            timestamp: new Date(),
                            image: result.content,
                            prompt: node.instruction || '',
                            context,
                            nodeName: node.name,
                            ownerId: currentUser.id,
                            isPromptSecret: (
                                (node.sourceVisibility === 'private' && currentUser.role !== 'admin') ||
                                (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
                            ),
                        };
                        if (histItem.isPromptSecret) {
                            histItem.prompt = '';
                            histItem.context = '';
                        }
                        setHistory(prev => [histItem, ...prev]);
                        if (supabaseEnabled) {
                            insertHistoryItem(histItem).catch(console.error);
                        }
                        setSessionHistory(prev => [histItem, ...prev].slice(0, 24));

                    } else {
                        updateNodeData(nodeId, { status: 'success', content: result.content });
                    }
                } else {
                    // Independent Mode
                    if (!node.batchItems || node.batchItems.length === 0) {
                        updateNodeData(nodeId, { status: 'success' });
                        return;
                    }

                    const newItems = [...node.batchItems];

                    const promises = newItems.map(async (item, index) => {
                        // FORCE RE-RUN: Do not skip success items. User clicked Run, so we Run.
                        // if (item.status === 'success' && item.result) return; // Skip already done

                        // Update item status to running
                        newItems[index] = { ...item, status: 'running' };
                        updateNodeData(nodeId, { batchItems: [...newItems] });

                        try {
                            // FIX: Allow image inputs for independent mode (e.g. style reference)
                            const inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));
                            // Add THIS item as the MAIN image input (or additional input)
                            inputs.push({ type: 'image', data: item.source });

                            const result = await runNode(node.instruction || '', node.type, inputs, node.selectedModel, apiKey);
                            newItems[index] = { ...item, status: 'success', result: result.content };

                            // Save History for Independent Item
                            if (result.type === 'image') {
                                const context = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data).join('\n\n');
                                const histItem: HistoryItem = {
                                    id: `hist-${Date.now()}-${nodeId}-${index}`,
                                    timestamp: new Date(),
                                    image: result.content,
                                    prompt: node.instruction || '',
                                    context,
                                    nodeName: `${node.name} (Batch ${index + 1})`,
                                    ownerId: currentUser.id,
                                    isPromptSecret: (
                                        (node.sourceVisibility === 'private' && currentUser.role !== 'admin') ||
                                        (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
                                    ),
                                };
                                if (histItem.isPromptSecret) {
                                    histItem.prompt = '';
                                    histItem.context = '';
                                }
                                setHistory(prev => [histItem, ...prev]);
                                if (supabaseEnabled) {
                                    insertHistoryItem(histItem).catch(console.error);
                                }
                                setSessionHistory(prev => [histItem, ...prev].slice(0, 24));
                            }

                        } catch (e) {
                            newItems[index] = { ...item, status: 'error' };
                        }
                        // Update state incrementally
                        updateNodeData(nodeId, { batchItems: [...newItems] });
                    });

                    await Promise.all(promises);
                    updateNodeData(nodeId, { status: 'success' });
                }

            } else {
                // Normal Node Logic
                const inputNodes = incomingConns.map(c => nodes.find(n => n.id === c.from)).filter(n => n) as Node[];
                const inputs = inputNodes.map(n => ({ type: n.type, data: n.type === 'image' ? n.inputImage : n.content }));

                const result = await runNode(node.instruction || '', node.type, inputs, node.selectedModel, apiKey);

                if (result.type === 'image') {
                    updateNodeData(nodeId, { status: 'success', inputImage: result.content, content: 'Generated' });
                } else {
                    updateNodeData(nodeId, { status: 'success', content: result.content });
                }
            }
        } catch (error) {
            updateNodeData(nodeId, { status: 'error', content: error instanceof Error ? error.message : 'Error' });
        } finally {
            // Remove connection highlight
            if (incomingIds.length > 0) {
                // Keep it for a moment to show completion
                setTimeout(() => {
                    setActiveConnectionIds(prev => {
                        const next = new Set(prev);
                        incomingIds.forEach(id => next.delete(id));
                        return next;
                    });
                }, 500);
            }
        }
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
    }), []);

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

    // Clear canvas and history when user changes (e.g. logout/login)
    useEffect(() => {
        setNodes([]);
        setConnections([]);
        setGroups([]);
        setHistory([]);
        setSessionHistory([]);
        setAssets([]); // Clear assets too, they will be reloaded by loadAssetsAndHistory
    }, [currentUser.id]);

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

    // Fix for passive event listener error on zoom


    // Load auth state and authorized users (with Supabase fallback)


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

        // Security Check: Prevent saving shared private workflows
        const group = groups.find(g => g.id === groupToSave.id);
        if (group && group.visibility === 'private' && group.ownerId && group.ownerId !== currentUser.id && currentUser.role !== 'admin') {
            alert('私有共享工作流不可保存');
            return;
        }

        const groupNodeIds = new Set(groupToSave.nodeIds);
        const workflowNodes = nodes.filter(n => groupNodeIds.has(n.id));
        const workflowConnections = connections.filter(c => groupNodeIds.has(c.from) && groupNodeIds.has(c.to));

        if (workflowNodes.length === 0) return;

        // Name Collision Check for Public Workflows
        if (details.visibility === 'public') {
            const existingPublic = assets.find(a => a.visibility === 'public' && a.name === details.name);
            if (existingPublic) {
                alert('Public workflow with this name already exists. Please choose a different name.');
                return;
            }
        }

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
                inputImage: null, // Do not save images in workflow assets
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

    const handleDeleteAsset = async (assetId: string) => {
        const target = assets.find(a => a.id === assetId);
        if (target && target.visibility === 'private' && target.ownerId && currentUser.role !== 'admin' && target.ownerId !== currentUser.id) {
            alert('无权删除其他用户的私密工作流');
            return;
        }

        if (!confirm('确定要删除这个预设吗？')) return;

        setToast('正在删除...');

        // Optimistic update for UI
        const remaining = assets.filter(a => a.id !== assetId);
        saveAssets(remaining);

        if (supabaseEnabled) {
            try {
                await deleteAsset(assetId);
                setToast('预设已删除');
            } catch (err) {
                console.error("Supabase asset delete failed:", err);
                setToast('删除失败，请重试');
                // Revert state if needed, but for now we assume optimistic update is fine or user will refresh
            }
        } else {
            setToast('预设已删除');
        }
        setTimeout(() => setToast(null), 2000);
    };

    const addWorkflowToCanvas = (workflow: WorkflowAsset | { nodes: SerializedNode[], connections: SerializedConnection[], visibility?: 'public' | 'private', ownerId?: string }) => {
        // We don't strictly record history here as it's a big operation, 
        // but usually it's good to have an undo point.
        recordHistory();
        deselectAll();

        const visibility = (workflow as WorkflowAsset).visibility || 'public';
        const ownerId = (workflow as WorkflowAsset).ownerId;
        // const shouldLock = visibility === 'private' && ownerId && currentUser.role !== 'admin' && ownerId !== currentUser.id;
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
        const canvasRect = canvas?.getBoundingClientRect();
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
                ...nodeData,
                id: newId,
                status: 'idle',
                selected: false,
                // Ensure width and height are always numbers to prevent NaN/white screen issues
                width: Number(nodeData.width) || DEFAULT_NODE_WIDTH,
                height: Number(nodeData.height) || DEFAULT_NODE_HEIGHT,
                position: {
                    x: (Number(nodeData.position?.x) || 0) - minX + targetPos.x,
                    y: (Number(nodeData.position?.y) || 0) - minY + targetPos.y,
                },
                selectedModel: nodeData.selectedModel,
                ownerId: ownerId, // Track origin owner
                sourceVisibility: visibility, // Track origin visibility for security
                // locked: shouldLock, // Removed global lock
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
            const HEADER_SPACE = 40;
            const size = { width: bounds.right - bounds.left + GROUP_PADDING * 2, height: bounds.bottom - bounds.top + GROUP_PADDING * 2 + HEADER_SPACE };
            setGroups(g => [...g, {
                id: groupId,
                name: namesafe,
                nodeIds: loadedNodes.map(n => n.id),
                position: { x: bounds.left - GROUP_PADDING, y: bounds.top - GROUP_PADDING - HEADER_SPACE },
                size,
                selected: true,
                ownerId: ownerId,
                visibility: visibility,
            }]);
        }

        // Auto-center the view on the imported workflow
        if (loadedNodes.length > 0 && canvas) {
            const allX = loadedNodes.map(n => n.position.x);
            const allY = loadedNodes.map(n => n.position.y);
            const minX = Math.min(...allX);
            const maxX = Math.max(...loadedNodes.map(n => n.position.x + (n.width || DEFAULT_NODE_WIDTH)));
            const minY = Math.min(...allY);
            const maxY = Math.max(...loadedNodes.map(n => n.position.y + (n.height || DEFAULT_NODE_HEIGHT)));

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const rect = canvas.getBoundingClientRect();
            setPan({
                x: rect.width / 2 - centerX * zoom,
                y: rect.height / 2 - centerY * zoom
            });
        }
    };

    // --- Keyboard Shortcuts (Copy/Paste/Delete/Undo) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const targetElement = e.target as HTMLElement;
            const isTyping = ['INPUT', 'TEXTAREA'].includes(targetElement.tagName);

            // --- DELETE ---
            if (!isTyping && (e.key === 'Backspace' || e.key === 'Delete')) {
                const selectedNodeIds = new Set(nodesRef.current.filter(n => n.selected).map(n => n.id));

                if (selectedNodeIds.size > 0 || selectedGroups.length > 0 || selectedConnectionId) {
                    recordHistory();
                }

                selectedGroups.forEach(g => {
                    g.nodeIds.forEach(nid => selectedNodeIds.add(nid));
                });

                if (selectedNodeIds.size > 0) {
                    if (activeNodeId && selectedNodeIds.has(activeNodeId)) {
                        setActiveNodeId(null);
                    }
                    setNodes(ns => ns.filter(n => !selectedNodeIds.has(n.id)));
                    setConnections(cs => cs.filter(c => !selectedNodeIds.has(c.from) && !selectedNodeIds.has(c.to)));
                }
                if (selectedGroups.length > 0) {
                    ungroupSelectedNodes();
                }
                if (selectedConnectionId) {
                    setConnections(cs => cs.filter(c => c.id !== selectedConnectionId));
                    setSelectedConnectionId(null);
                }
            }

            // --- SAVE (Ctrl+S) ---
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                // Find if there's a selected group or active group to save
                const groupToSave = selectedGroups.length === 1 ? selectedGroups[0] : null;
                if (groupToSave) {
                    // Security Check
                    if (groupToSave.visibility === 'private' && groupToSave.ownerId && groupToSave.ownerId !== currentUser.id && currentUser.role !== 'admin') {
                        alert('私有共享工作流不可保存');
                        return;
                    }
                    setGroupToSave(groupToSave);
                    setIsSaveAssetModalOpen(true);
                }
            }

            // --- COPY (Ctrl+C) ---
            if (!isTyping && e.ctrlKey && e.key === 'c') {
                const selected = nodesRef.current.filter(n => n.selected);
                if (selected.length === 0) return;

                const nodesToCopy = selected;
                const nodeIds = new Set(nodesToCopy.map(n => n.id));
                const connectionsToCopy = connectionsRef.current.filter(c => nodeIds.has(c.from) && nodeIds.has(c.to));
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
                        groupId: undefined
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

                newGroups.forEach(ng => {
                    const groupNodeSet = new Set(ng.nodeIds);
                    newNodes.forEach(n => {
                        if (groupNodeSet.has(n.id)) {
                            n.groupId = ng.id;
                            n.selected = false;
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
            if (!isTyping && ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z'))) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedGroups, selectedConnectionId, ungroupSelectedNodes, activeNodeId, undo, redo, recordHistory, deselectAll, currentUser]);

    const toolbarPosition = useMemo(() => {
        if (!canvas || (selectedNodes.length === 0 && selectedGroups.length === 0)) return null;
        const selectedElements = [
            ...selectedNodes.map(n => document.getElementById(n.id)),
            ...selectedGroups.map(g => document.getElementById(`group-${g.id}`))
        ].filter(Boolean) as HTMLElement[];
        if (selectedElements.length === 0) return null;

        let top = Infinity, left = Infinity, right = -Infinity;
        selectedElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            top = Math.min(top, rect.top);
            left = Math.min(left, rect.left);
            right = Math.max(right, rect.right);
        });
        // Calculate offset to ensure button is centered on the Group border (dashed line).
        // Toolbar height is approx 44px. Half is 22px.
        // We want Toolbar Center = Group Border.
        // So Toolbar Top = Group Border - 22.

        // Group Border is at NodeTop - 100 * zoom.
        // So for Groups: top is Group Border. Offset = 22.
        // For Nodes: top is NodeTop. We want same visual position relative to content.
        // So Toolbar Top = (NodeTop - 100 * zoom) - 22.
        // Offset = 100 * zoom + 22.

        const isGroupSelection = selectionType === 'groups' || selectionType === 'mixed';
        const offset = isGroupSelection ? 22 : 22 + 100 * zoom;

        return { top: top - offset, left: left + (right - left) / 2 };
    }, [selectedNodes, selectedGroups, pan, zoom, selectionType]);

    const handleClearHistory = useCallback(() => {
        setHistory(h => h.filter(item => item.ownerId && item.ownerId !== currentUser.id && currentUser.role !== 'admin'));
        if (supabaseEnabled) {
            clearHistoryItems(currentUser.role === 'admin' ? undefined : currentUser.id).catch(err => console.error("Supabase clear history failed:", err));
        }
    }, [supabaseEnabled, currentUser]);

    const handleDeleteHistoryItem = useCallback(async (id: string) => {
        if (!confirm('确定要删除这条历史记录吗？')) return;

        // Optimistic update
        setHistory(h => h.filter(item => item.id !== id));
        setSessionHistory(h => h.filter(item => item.id !== id)); // Sync session history

        setSelectedHistoryItem(currentItem => {
            if (currentItem && currentItem.id === id) {
                return null;
            }
            return currentItem;
        });

        if (supabaseEnabled) {
            setToast('正在删除...');
            try {
                await removeHistoryItem(id, currentUser.role === 'admin' ? undefined : currentUser.id);
                setToast('历史记录已删除');
            } catch (err) {
                console.error("Supabase delete history failed:", err);
                setToast('删除失败，请重试');
            }
            setTimeout(() => setToast(null), 2000);
        }
    }, [supabaseEnabled, currentUser]);
    // API Key modal handlers
    const handleBulkDeleteHistory = useCallback(async (ids: string[]) => {
        if (!confirm(`确定要删除选中的 ${ids.length} 条记录吗？`)) return;

        // Optimistic update
        setHistory(h => h.filter(item => !ids.includes(item.id)));
        setSessionHistory(h => h.filter(item => !ids.includes(item.id))); // Sync session history
        setHistoryModalSelection(new Set());

        if (supabaseEnabled) {
            setToast('正在删除...');
            try {
                await Promise.all(ids.map(id => removeHistoryItem(id, currentUser.role === 'admin' ? undefined : currentUser.id)));
                setToast('选中记录已删除');
            } catch (err) {
                console.error("Supabase delete history failed:", err);
                setToast('删除失败，请重试');
            }
            setTimeout(() => setToast(null), 2000);
        }
    }, [supabaseEnabled, currentUser]);





    if (authLoading) {
        return (
            <div className="w-screen h-screen bg-[#0f1118] flex items-center justify-center text-slate-200">
                <div className="animate-spin h-10 w-10 border-2 border-neon-blue border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (currentUser.role === 'guest') {
        return <LoginPage onLogin={(email, password, isRegister) => {
            setLoginName(email);
            setLoginPassword(password);
            return handleLogin(isRegister, email, password);
        }} />;
    }

    return (
        <div
            ref={setContainerRef}
            className="w-screen h-screen overflow-hidden cursor-default text-slate-200 font-sans select-none"
            onContextMenu={handleCanvasContextMenu}
        >
            <div
                ref={setCanvasRef}
                data-id="canvas-bg"
                className="absolute top-0 left-0 w-full h-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleCanvasMouseDown}
                style={{
                    backgroundColor: '#0f1118',
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                }}
            />

            {
                toast && createPortal(
                    <div className="fixed top-8 left-1/2 -translate-x-1/2 glass-panel text-white px-6 py-3 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.3)] z-[10000] toast-animate border border-white/10 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-neon-blue animate-pulse"></div>
                        {toast}
                    </div>,
                    document.body
                )
            }

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
                    {previewConnection && (() => {
                        const dist = Math.abs(previewConnection.end.x - previewConnection.start.x);
                        const control = Math.max(dist * 0.4, 20);
                        return (
                            <path
                                d={`M ${previewConnection.start.x} ${previewConnection.start.y} C ${previewConnection.start.x + control} ${previewConnection.start.y}, ${previewConnection.end.x - control} ${previewConnection.end.y}, ${previewConnection.end.x} ${previewConnection.end.y}`}
                                className="stroke-neon-blue fill-none opacity-60" strokeWidth="2" strokeDasharray="5 5"
                            />
                        );
                    })()}
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
                        isSaveDisabled={group.visibility === 'private' && group.ownerId !== undefined && group.ownerId !== currentUser.id && currentUser.role !== 'admin'}
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
                        isBatchProcessing={isBatchProcessing}
                        isOwner={!node.ownerId || node.ownerId === currentUser.id || node.sourceVisibility === 'public'}
                        onRetryItem={handleRetryItem}
                    />
                ))}

                {activeNode && !isDraggingNode && (
                    <InstructionInput
                        node={activeNode}
                        onDataChange={updateNodeData}
                        onExecute={(nodeId, instruction) => executeNode(nodeId, instruction)}
                        isOwner={!activeNode.ownerId || activeNode.ownerId === currentUser.id || activeNode.sourceVisibility === 'public'}
                    />
                )}
            </div>

            {contextMenu && <ContextMenu {...contextMenu} onClose={closeContextMenu} />}

            {selectionBox && <div className="absolute border border-neon-blue/50 bg-neon-blue/10 pointer-events-none rounded-md backdrop-blur-[1px]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}

            {
                toolbarPosition && (selectedNodes.length > 1 || selectedGroups.length > 0) && (
                    <SelectionToolbar position={toolbarPosition} onGroup={groupSelectedNodes} onUngroup={ungroupSelectedNodes} selectionType={selectionType} />
                )
            }

            {viewerContent && <ViewerModal {...viewerContent} onClose={() => setViewerContent(null)} />}

            {
                isSaveAssetModalOpen && groupToSave && (
                    <SaveAssetModal groupName={groupToSave.name} defaultVisibility="public" onClose={() => setIsSaveAssetModalOpen(false)} onSave={handleSaveAsset} />
                )
            }

            {selectedHistoryItem && (() => {
                const currentIndex = history.findIndex(h => h.id === selectedHistoryItem.id);
                const hasPrev = currentIndex > 0;
                const hasNext = currentIndex < history.length - 1;
                return (
                    <HistoryDetailModal
                        item={selectedHistoryItem}
                        onClose={() => setSelectedHistoryItem(null)}
                        onPrev={() => hasPrev && setSelectedHistoryItem(history[currentIndex - 1])}
                        onNext={() => hasNext && setSelectedHistoryItem(history[currentIndex + 1])}
                        hasPrev={hasPrev}
                        hasNext={hasNext}
                    />
                );
            })()}

            {
                isHistoryModalOpen && (
                    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsHistoryModalOpen(false)}>
                        <div className="bg-[#111827] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[80vh] p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white">历史图库</h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            const displayed = history.slice(0, historyPage * 20);
                                            if (historyModalSelection.size === displayed.length) {
                                                setHistoryModalSelection(new Set());
                                            } else {
                                                setHistoryModalSelection(new Set(displayed.map(i => i.id)));
                                            }
                                        }}
                                        className="px-3 py-1 rounded text-sm bg-slate-600 text-white hover:bg-slate-500"
                                    >
                                        全选
                                    </button>
                                    <button
                                        disabled={historyModalSelection.size === 0}
                                        onClick={() => handleBulkDeleteHistory(Array.from(historyModalSelection))}
                                        className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-500'}`}
                                    >
                                        删除选中
                                    </button>
                                    <button
                                        onClick={() => setHistoryModalSelection(new Set())}
                                        disabled={historyModalSelection.size === 0}
                                        className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-600 text-white hover:bg-slate-500'}`}
                                    >
                                        清除选中
                                    </button>
                                    <button
                                        disabled={historyModalSelection.size === 0}
                                        onClick={async () => {
                                            const selectedItems = history.filter(h => historyModalSelection.has(h.id));
                                            for (const item of selectedItems) {
                                                const a = document.createElement('a');
                                                a.download = `${item.nodeName || 'history'}.png`;
                                                if (item.image.startsWith('http')) {
                                                    try {
                                                        const response = await fetch(item.image);
                                                        const blob = await response.blob();
                                                        const url = URL.createObjectURL(blob);
                                                        a.href = url;
                                                        a.click();
                                                        URL.revokeObjectURL(url);
                                                    } catch (e) {
                                                        console.error("Download failed", e);
                                                        window.open(item.image, '_blank');
                                                    }
                                                } else {
                                                    a.href = `data:image/png;base64,${item.image}`;
                                                    a.click();
                                                }
                                                await new Promise(r => setTimeout(r, 500));
                                            }
                                        }}
                                        className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-600 text-white hover:bg-slate-500'}`}
                                    >
                                        下载选中
                                    </button>
                                    <button
                                        disabled={historyModalSelection.size === 0}
                                        onClick={() => {
                                            const selectedItems = history.filter(h => historyModalSelection.has(h.id));
                                            const links = selectedItems.map(item => item.image).join('\n');
                                            navigator.clipboard.writeText(links).then(() => {
                                                alert(`已复制 ${selectedItems.length} 张图片的链接`);
                                            });
                                        }}
                                        className={`px-3 py-1 rounded text-sm ${historyModalSelection.size === 0 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-600 text-white hover:bg-slate-500'}`}
                                    >
                                        复制链接
                                    </button>
                                    <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-300 hover:text-white">&times;</button>
                                </div>
                            </div>
                            <div
                                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4"
                                onScroll={(e) => {
                                    const target = e.currentTarget;
                                    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50 && !historyLoading && hasMoreHistory) {
                                        loadHistoryItems(historyPage + 1);
                                    }
                                }}
                            >
                                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {history.map(item => (
                                        <div
                                            key={item.id}
                                            className={`relative bg-slate-800/70 border ${historyModalSelection.has(item.id) ? 'border-sky-500' : 'border-slate-700'} rounded-lg overflow-hidden cursor-pointer`}
                                            style={{ aspectRatio: '3/4' }}
                                            onClick={(e) => {
                                                if (e.ctrlKey || e.metaKey) {
                                                    e.preventDefault();
                                                    setHistoryModalSelection(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(item.id)) next.delete(item.id);
                                                        else next.add(item.id);
                                                        return next;
                                                    });
                                                } else if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
                                                    setSelectedHistoryItem(item);
                                                }
                                            }}
                                        >
                                            <div className="absolute top-2 left-2 z-10">
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
                                                    className="w-5 h-5 cursor-pointer"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <img src={item.image?.trim().startsWith('http') ? item.image : `data:image/png;base64,${item.image}`} alt={item.nodeName} className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                                {historyLoading && (
                                    <div className="text-center py-4 text-slate-400">加载中...</div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                isAssetLibraryOpen && (
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
                        currentUser={currentUser}
                    />
                )
            }

            {/* Portal overlay: toolbar, history tray, shortcuts */}
            <UIOverlay
                currentUser={currentUser}
                onLogout={handleLogout}
                onLoad={addWorkflowToCanvas}
                onOpenLibrary={() => setIsAssetLibraryOpen(true)}
                onOpenHistory={() => { setIsHistoryModalOpen(true); setHistoryModalSelection(new Set()); }}
                onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
                onOpenAuthModal={() => setIsAccountModalOpen(true)}
                onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
                history={sessionHistory}
                onSelectHistory={setSelectedHistoryItem}
                onClearHistory={() => setSessionHistory([])}
                onDeleteHistory={(id) => setSessionHistory(sh => sh.filter(item => item.id !== id))}
                zoom={zoom}
                onZoomChange={(z) => zoomAroundPoint(z)}
            />

            {
                isAdminDashboardOpen && currentUser.role === 'admin' && (
                    <AdminDashboard onClose={() => setIsAdminDashboardOpen(false)} currentUser={currentUser} />
                )
            }

            {
                isApiKeyModalOpen && currentUser.role === 'admin' && (
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
                )
            }

            {
                isAccountModalOpen && currentUser.role !== 'guest' && createPortal(
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

                                        {/* User List Section */}
                                        <div className="mt-6 border-t border-slate-700 pt-4">
                                            <h3 className="text-sm font-semibold text-slate-200 mb-3">已授权用户列表 ({authorizedUsers.length})</h3>
                                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                                {authorizedUsers.length === 0 ? (
                                                    <p className="text-xs text-slate-500 italic">暂无授权用户</p>
                                                ) : (
                                                    authorizedUsers.map((user, idx) => (
                                                        <div key={user.id || idx} className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 group hover:border-slate-600 transition-colors">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs text-slate-300 font-mono">{user.name}</span>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm(`确定要删除用户 ${user.name} 吗？`)) {
                                                                        handleRemoveAuthorizedUser(user.name);
                                                                    }
                                                                }}
                                                                className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-red-900/20 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                                                title="删除用户"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }

        </div >
    );
};

export default App;

