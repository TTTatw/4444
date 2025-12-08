import React from 'react';
import { fileToBase64 } from '../services/geminiService';

export interface PasteResult {
    type: 'image' | 'text' | 'file';
    content: string; // Base64 for images/files, text for text
    filename?: string;
    source?: File;
}

/**
 * Handles paste events to extract images or text.
 * Prioritizes images/files over text.
 * Uses robust logic: Check files first, then items (with explicit casting).
 */
export const handleClipboardPaste = async (e: React.ClipboardEvent): Promise<PasteResult[]> => {
    const results: PasteResult[] = [];
    let handled = false;

    // Priority 1: Check for Files (better for multi-select copy/paste)
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        const files = Array.from(e.clipboardData.files) as File[];
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const base64 = await fileToBase64(file);
                results.push({ type: 'image', content: base64, filename: file.name, source: file });
                handled = true;
            }
        }
    }

    // Priority 2: Check for Items
    if (!handled || results.length === 0) {
        // Fallback or additional check for items
        const items = Array.from(e.clipboardData.items) as DataTransferItem[];
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const base64 = await fileToBase64(file);
                    results.push({ type: 'image', content: base64, filename: file.name, source: file });
                    handled = true;
                }
            }
        }
    }

    // Priority 3: Check for Text (URL or Data URI) if no images handled
    // Note: Caller can decide whether to accept text if images were found or not.
    // Here we append text ONLY if no images found to avoid clutter, 
    // OR we can return mixed content?
    // User logic in NodeComponent only checked text if !handled. We stick to that pattern.
    if (!handled) {
        const text = e.clipboardData.getData('text');
        if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
            results.push({ type: 'text', content: text });
        }
    }

    return results;
};
