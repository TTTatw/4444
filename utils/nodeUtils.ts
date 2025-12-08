import { Node } from '../types';

/**
 * Sorts nodes spatially based on their position.
 * Primary sorting criteria: Y coordinate (Top to Bottom).
 * Secondary sorting criteria: X coordinate (Left to Right).
 * 
 * Used for determining input order when multiple nodes connect to a single input.
 */
export const sortNodesSpatially = (nodes: Node[]): Node[] => {
    return [...nodes].sort((a, b) => {
        // Threshold for loose row alignment (optional, currently strictly Y)
        // If sorting strictly by reading order:
        if (Math.abs(a.position.y - b.position.y) > 0) {
            return a.position.y - b.position.y;
        }
        return a.position.x - b.position.x;
    });
};
