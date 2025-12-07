
// FIX: Add React import to use React.ReactNode type.
import React from 'react';

export type NodeType = 'text' | 'image' | 'batch-image';
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';
export type ModelType = 'gemini-2.5-flash' | 'gemini-2.5-flash-image' | 'imagen-4.0-generate-001' | 'gemini-3-pro-image-preview';

export interface Point {
  x: number;
  y: number;
}

export type BatchMode = 'independent' | 'merged';

export interface BatchItem {
  id: string;
  source: string; // base64
  result?: string; // base64
  status: NodeStatus;
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
  inputImage: string | null; // base64 string (user upload or upstream input)
  outputImage?: string | null; // base64 string (generated result)
  groupId?: string;
  width?: number;
  height?: number;
  selectedModel?: string;
  locked?: boolean; // read-only if true (for private workflows not owned)
  aspectRatio?: string;
  resolution?: string;
  googleSearch?: boolean;
  ownerId?: string;
  sourceVisibility?: 'public' | 'private';

  // Batch Node specific
  batchMode?: BatchMode;
  batchItems?: BatchItem[];
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
  ownerId?: string;
  visibility?: 'public' | 'private';
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
  isPromptSecret?: boolean;
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
  outputImage?: string | null; // Add outputImage to serialization
  width?: number;
  height?: number;
  selectedModel?: string;
  aspectRatio?: string;
  resolution?: string;
  googleSearch?: boolean;
  batchMode?: BatchMode;
  batchItems?: BatchItem[];
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

export type Role = 'admin' | 'user' | 'guest';

export interface User {
  id: string;
  name: string;
  role: Role;
  password?: string; // For authorized users list
  email?: string;
}
