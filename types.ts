
// FIX: Add React import to use React.ReactNode type.
import React from 'react';

export type NodeType = 'text' | 'image';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';
export type ModelType = 'gemini-2.5-flash' | 'gemini-2.5-flash-image' | 'imagen-4.0-generate-001' | 'gemini-3-pro-image-preview';

export interface Point {
  x: number;
  y: number;
}

export interface Node {
  id: string;
  name: string;
  type: NodeType;
  position: Point;
  content: string;
  instruction: string;
  status: NodeStatus;
  selected: boolean;
  inputImage: string | null; // base64 string
  groupId?: string;
  width?: number;
  height?: number;
  selectedModel?: string;
  locked?: boolean; // read-only if true (for private workflows not owned)
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface Group {
    id: string;
    name: string;
    nodeIds: string[];
    position: Point;
    size: { width: number; height: number };
    selected?: boolean;
}

export interface ContextMenu {
  position: Point;
  options: ContextMenuOption[];
  title?: string;
}

export interface ContextMenuOption {
  label: string;
  action: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  description?: string;
}

export interface HistoryItem {
  id: string;
  timestamp: Date;
  image: string; // base64
  prompt: string;
  context: string;
  nodeName: string;
  ownerId?: string;
}

// Specific types for serialized (saved) workflow data
export interface SerializedNode {
  id: string;
  name: string;
  type: NodeType;
  position: Point;
  content: string;
  instruction: string;
  inputImage: string | null;
  width?: number;
  height?: number;
  selectedModel?: string;
}

export interface SerializedConnection {
  fromNode: string;
  toNode: string;
}

export interface WorkflowAsset {
    id: string;
    name: string;
    tags: string[];
    notes: string;
    nodes: SerializedNode[]; 
    connections: SerializedConnection[];
    visibility?: 'public' | 'private';
    ownerId?: string;
}
