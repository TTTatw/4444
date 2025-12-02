import React, { useState, useCallback } from 'react';
import { Node, Connection, Point, NodeType, ContextMenu as ContextMenuType } from '../types';
import { DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../constants';
import { TextIcon, ImageIcon } from '../components/Icons';

interface UseConnectionProps {
    nodes: Node[];
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    pan: Point;
    zoom: number;
    recordHistory: () => void;
    onCreateNode: (type: NodeType, position: Point, namePrefix: string) => Node;
    onOpenContextMenu: (menu: ContextMenuType) => void;
    onCloseContextMenu: () => void;
}

export const useConnection = ({
    nodes,
    connections,
    setConnections,
    pan,
    zoom,
    recordHistory,
    onCreateNode,
    onOpenContextMenu,
    onCloseContextMenu
}: UseConnectionProps) => {
    const [drawingConnection, setDrawingConnection] = useState<{ from?: string; to?: string } | null>(null);
    const [previewConnection, setPreviewConnection] = useState<{ start: Point; end: Point } | null>(null);

    const startConnection = useCallback((nodeId: string, type: 'input' | 'output', e: React.MouseEvent) => {
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
    }, [nodes]);

    const onConnectorMouseUp = useCallback((nodeId: string | null, type: 'input' | 'output') => {
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
    }, [drawingConnection, connections, setConnections, recordHistory]);

    const handleDragConnection = useCallback((e: globalThis.MouseEvent) => {
        if (!drawingConnection) return;

        const startNodeId = drawingConnection.from || drawingConnection.to;
        if (!startNodeId) return;
        const startNode = nodes.find(n => n.id === startNodeId);
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
    }, [drawingConnection, nodes, pan, zoom]);

    const cancelConnection = useCallback(() => {
        setDrawingConnection(null);
        setPreviewConnection(null);
    }, []);

    const onConnectionDrop = useCallback((e: globalThis.MouseEvent) => {
        if (!drawingConnection) return;

        const dropPos = {
            x: (e.clientX - pan.x) / zoom,
            y: (e.clientY - pan.y) / zoom
        };
        const connectionSource = { ...drawingConnection };

        onOpenContextMenu({
            position: { x: e.clientX, y: e.clientY },
            title: '创建节点',
            options: [
                {
                    label: '文本节点',
                    icon: React.createElement(TextIcon),
                    description: '处理文本输入',
                    action: () => {
                        const newNode = onCreateNode('text', dropPos, '文本节点');
                        if (connectionSource.from) {
                            setConnections(prev => [...prev, { id: `${connectionSource.from}-${newNode.id}`, from: connectionSource.from!, to: newNode.id }]);
                        } else if (connectionSource.to) {
                            setConnections(prev => [...prev, { id: `${newNode.id}-${connectionSource.to}`, from: newNode.id, to: connectionSource.to! }]);
                        }
                        onCloseContextMenu();
                    }
                },
                {
                    label: '图片节点',
                    icon: <ImageIcon />,
                    description: '生成或显示图片',
                    action: () => {
                        const newNode = onCreateNode('image', dropPos, '图片节点');
                        if (connectionSource.from) {
                            setConnections(prev => [...prev, { id: `${connectionSource.from}-${newNode.id}`, from: connectionSource.from!, to: newNode.id }]);
                        } else if (connectionSource.to) {
                            setConnections(prev => [...prev, { id: `${newNode.id}-${connectionSource.to}`, from: newNode.id, to: connectionSource.to! }]);
                        }
                        onCloseContextMenu();
                    }
                }
            ]
        });
    }, [drawingConnection, pan, zoom, onCreateNode, onOpenContextMenu, onCloseContextMenu, setConnections]);

    return {
        drawingConnection,
        previewConnection,
        startConnection,
        onConnectorMouseUp,
        handleDragConnection,
        cancelConnection,
        onConnectionDrop,
        setDrawingConnection,
        setPreviewConnection
    };
};
