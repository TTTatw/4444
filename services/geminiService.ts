import { Part, GenerateContentParameters, HarmProbability, FinishReason } from '@google/genai';
import type { NodeType } from '../types';
import { supabaseAuth } from './storageService';

// Helper to build parts (kept for compatibility with existing logic)
const buildParts = (inputs: Input[], instruction: string): Part[] => {
    const parts: Part[] = [];
    // Add all inputs first (text and images)
    for (const input of inputs) {
        if (input.data) {
            if (input.type === 'image') {
                parts.push({
                    inlineData: {
                        mimeType: 'image/png', // Assuming png for simplicity
                        data: input.data,
                    },
                });
            } else {
                parts.push({ text: input.data });
            }
        }
    }
    // Add the final instruction text last
    if (instruction) {
        parts.push({ text: instruction });
    }
    return parts;
};

type Input = {
    type: NodeType;
    data: string | null;
};

export type NodeResult = {
    type: 'text' | 'image';
    content: string;
};



const handleApiError = (response: any): string => {
    let errorMessage = "API call returned no content.";
    if (response.text) {
        return response.text;
    }
    const { promptFeedback } = response;
    if (promptFeedback?.blockReason) {
        errorMessage = `Request was blocked.Reason: ${promptFeedback.blockReason}.`;
        const blockedRating = promptFeedback.safetyRatings?.find(r => r.probability !== HarmProbability.NEGLIGIBLE && r.probability !== HarmProbability.LOW && r.probability !== HarmProbability.HARM_PROBABILITY_UNSPECIFIED);
        if (blockedRating) {
            errorMessage += ` This may be due to content related to ${blockedRating.category}.`;
        }
    } else if (response.candidates?.[0]?.finishReason && response.candidates?.[0]?.finishReason !== FinishReason.STOP && response.candidates?.[0]?.finishReason !== FinishReason.FINISH_REASON_UNSPECIFIED) {
        errorMessage = `Generation stopped.Reason: ${response.candidates?.[0]?.finishReason}.`;
    }
    return errorMessage;
};


export const runNode = async (
    instruction: string,
    nodeType: NodeType,
    inputs: Input[],
    model?: string,
    apiKeyOverride?: string
): Promise<NodeResult> => {
    try {
        // 1. Get Auth Token
        const session = await supabaseAuth()?.getSession();
        const token = session?.data.session?.access_token;

        if (!token) {
            throw new Error("未登录。请先登录以使用 AI 生成功能。");
        }

        // 2. Prepare Payload
        const parts = buildParts(inputs, instruction);
        if (parts.length === 0) {
            throw new Error("错误：无法生成。节点需要指令或上游输入才能运行。");
        }

        const textPrompt = parts.filter(p => p.text).map(p => p.text).join('\n\n');
        const imagePart = parts.find(p => p.inlineData); // Currently backend handles one image well

        // Default models
        let selectedModel = model;
        if (!selectedModel) {
            selectedModel = nodeType === 'image' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview';
        }

        const API_BASE = import.meta.env.VITE_API_URL || 'https://4444-production.up.railway.app';

        // 3. Call Backend Proxy
        const response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: selectedModel,
                prompt: textPrompt,
                image: imagePart, // Send the Part object directly
                systemInstruction: "You are a helpful AI assistant."
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 402) {
                throw new Error("余额不足。请联系管理员充值。");
            }
            if (response.status === 403) {
                throw new Error(errorData.error || "权限不足或账户异常。");
            }
            throw new Error(errorData.error || `请求失败 (${response.status})`);
        }

        const data = await response.json();

        // 4. Handle Response
        if (data.image) {
            return { type: 'image', content: data.image };
        }

        if (data.text) {
            return { type: 'text', content: data.text };
        }

        throw new Error("后端返回了无法识别的数据格式。");

    } catch (error) {
        console.error("Proxy Generation Error:", error);
        throw error;
    }
};

export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            // result is a data URL (e.g., "data:image/png;base64,iVBORw0KGgo...")
            // We only need the base64 part.
            const base64String = result.split(',')[1];
            if (base64String) {
                resolve(base64String);
            } else {
                reject(new Error("Could not extract base64 string from file."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};
