import React from 'react';
import type { Node } from '../types';
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '../constants';

interface ConnectionProps {
    id: string;
    from: string;
    to: string;
    nodes: Node[];
    isSelected: boolean;
    isActive: boolean;
    onClick: (id: string) => void;
}

export const Connection: React.FC<ConnectionProps> = ({ id, from, to, nodes, isSelected, isActive, onClick }) => {
    const fromNode = nodes.find(n => n.id === from);
    const toNode = nodes.find(n => n.id === to);

    if (!fromNode || !toNode) {
        return null;
    }

    const fromWidth = fromNode.width || DEFAULT_NODE_WIDTH;
    const fromHeight = fromNode.height || DEFAULT_NODE_HEIGHT;
    const toHeight = toNode.height || DEFAULT_NODE_HEIGHT;

    // Calculate start and end points with offsets for visual connectors
    // Output connector at right edge
    const startX = fromNode.position.x + fromWidth;
    const startY = fromNode.position.y + fromHeight / 2;

    // Input connector at left edge
    const endX = toNode.position.x;
    const endY = toNode.position.y + toHeight / 2;

    const curveFactor = 0.5;
    const minControl = 50;
    const dist = Math.abs(endX - startX);
    const controlDist = Math.max(dist * curveFactor, minControl);

    const c1X = startX + controlDist;
    const c1Y = startY;
    const c2X = endX - controlDist;
    const c2Y = endY;

    const pathData = `M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`;

    // Define gradient ID based on connection ID to ensure uniqueness
    const gradientId = `gradient-${id}`;

    return (
        <g
            className="pointer-events-auto cursor-pointer group/connection"
            onClick={(e) => { e.stopPropagation(); onClick(id); }}
        >
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
                    <stop offset="0%" stopColor="#00f3ff" />
                    <stop offset="100%" stopColor="#bc13fe" />
                </linearGradient>
            </defs>

            {/* Wider, invisible path for easier clicking */}
            <path d={pathData} className="stroke-transparent fill-none" strokeWidth="20" />

            {/* Base path */}
            <path
                d={pathData}
                className={`${isSelected ? 'stroke-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'stroke-slate-600/50 group-hover/connection:stroke-slate-500'}`}
                fill="none"
                strokeWidth={isSelected ? 3 : 2}
                strokeLinecap="round"
            />

            {/* Active/Gradient path */}
            {(isActive || isSelected) && (
                <path
                    d={pathData}
                    stroke={`url(#${gradientId})`}
                    className={`fill-none ${isActive ? 'connection-flow' : ''}`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(0, 243, 255, 0.3))' }}
                />
            )}
        </g>
    );
};
