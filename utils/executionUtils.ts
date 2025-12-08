
import { Node, BatchItem, HistoryItem, User, Group, ModelType } from '../types';
import { runNode } from '../services/geminiService';

export interface Input {
    type: 'text' | 'image';
    data: string | null;
}

/**
 * Collects and sorts inputs for a node execution.
 * 
 * Logic:
 * 1. Sorts incoming nodes spatially (using provided sortFn).
 * 2. Maps nodes to inputs, prioritizing outputImage (Result) over inputImage (Source) for images.
 * 3. Handles self-input logic: If no upstream inputs and node has own image, use it (unless handled differently).
 */
export const collectSortedInputs = (
    incomingNodes: Node[],
    currentNode: Node,
    sortFn: (nodes: Node[]) => Node[]
): Input[] => {
    // 1. Sort inputs
    const sortedNodes = sortFn(incomingNodes);

    // 2. Map to inputs
    const inputs: Input[] = sortedNodes.map(n => ({
        type: n.type as 'text' | 'image', // explicit cast for safety, assuming types align
        // Downstream: Prefer outputImage (result) if available, otherwise inputImage (source)
        data: n.type === 'image' || n.type === 'batch-image'
            ? (n.outputImage || n.inputImage || null)
            : n.content
    }));

    // 3. Self-image input logic
    // Rule: "If dependency inputs... definitely reference upstream instead of self".
    if (inputs.length === 0 && currentNode.inputImage) {
        inputs.push({ type: 'image', data: currentNode.inputImage });
    }

    return inputs;
};

/**
 * Creates a HistoryItem object with centralized privacy logic.
 */
export const createHistoryItem = (
    nodeId: string,
    nodeName: string,
    prompt: string,
    inputs: Input[],
    resultContent: string,
    currentUser: User,
    groups: Group[],
    sourceVisibility?: 'public' | 'private'
): HistoryItem => {
    // Context logic: merge all text inputs
    const context = inputs
        .filter(i => i.type === 'text' && i.data)
        .map(i => i.data)
        .join('\n\n');

    const isPromptSecret = (
        (sourceVisibility === 'private' && currentUser.role !== 'admin') ||
        (groups.find(g => g.nodeIds.includes(nodeId))?.visibility === 'private' && currentUser.role !== 'admin')
    );

    const histItem: HistoryItem = {
        id: `hist-${Date.now()}-${nodeId}`,
        timestamp: new Date(),
        image: resultContent,
        prompt: prompt || '',
        context,
        nodeName: nodeName,
        ownerId: currentUser.id,
        isPromptSecret,
    };

    // Privacy mask
    if (histItem.isPromptSecret) {
        histItem.prompt = '';
        histItem.context = '';
    }

    return histItem;
};

/**
 * Executes a single batch item.
 * Encapsulates the core logic inside the loop, but leaves loop control to App.tsx.
 */
export const runSingleBatchItem = async (
    item: BatchItem,
    baseInputs: Input[],
    nodeInstructions: string,
    nodeType: 'image' | 'batch-image', // batch nodes usually act as image generators
    selectedModel: string | undefined, // Type from Node.selectedModel (string | undefined)
    apiKey: string | undefined,
    nodeSettings: { aspectRatio?: string; resolution?: string; googleSearch?: boolean }
): Promise<{ status: 'success' | 'error', result?: string }> => {
    try {
        const itemInputs = [...baseInputs, { type: 'image' as const, data: item.source }];

        const result = await runNode(
            nodeInstructions,
            nodeType,
            itemInputs,
            selectedModel as ModelType, // Cast assuming valid model string
            apiKey,
            nodeSettings
        );

        if (result.type === 'image') {
            return { status: 'success', result: result.content };
        } else {
            // Should not happen for batch image node usually, but handle just in case
            return { status: 'error' };
        }

    } catch (error) {
        console.error("Batch Item Execution Failed:", error);
        return { status: 'error' };
    }
};
