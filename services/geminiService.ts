import { Part, GenerateContentParameters, HarmProbability, FinishReason } from '@google/genai';
import type { NodeType } from '../types';
import { supabaseAuth } from './storageService';

// Helper to build parts (kept for compatibility with existing logic)
const buildParts = async (inputs: Input[], instruction: string): Promise<Part[]> => {
    const parts: Part[] = [];
    // Add all inputs first (text and images)
    for (const input of inputs) {
        if (input.data) {
            if (input.type === 'image') {
                let base64Data = input.data;
                let mimeType = 'image/png';
                // If input is a URL (from Supabase Storage), fetch and convert to base64
                if (input.data.startsWith('http')) {
                    try {
                        const response = await fetch(input.data);
                        const blob = await response.blob();
                        mimeType = blob.type || 'image/png';
                        base64Data = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const base64 = (reader.result as string).split(',')[1];
                                resolve(base64);
                            };
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        console.error("Failed to fetch image from URL:", input.data, e);
                        // Skip this image or handle error? For now, we skip.
                        continue;
                    }
                } else if (input.data.startsWith('data:')) {
                    // If input is a Data URI, extract mimeType and base64
                    const matches = input.data.match(/^data:(.+);base64,(.+)$/);
                    if (matches) {
                        mimeType = matches[1];
                        base64Data = matches[2];
                    } else if (input.data.includes(',')) {
                        // Fallback for simple split
                        base64Data = input.data.split(',')[1];
                    }
                }

                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data,
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
    apiKeyOverride?: string,
    options?: { aspectRatio?: string; resolution?: string; googleSearch?: boolean }
): Promise<NodeResult> => {
    try {
        // 1. Get Auth Token
        const session = await supabaseAuth()?.getSession();
        const token = session?.data.session?.access_token;

        if (!token) {
            throw new Error("未登录。请先登录以使用 AI 生成功能。");
        }

        // 2. Prepare Payload
        const parts = await buildParts(inputs, instruction);
        if (parts.length === 0) {
            throw new Error("错误：无法生成。节点需要指令或上游输入才能运行。");
        }

        const textPrompt = parts.filter(p => p.text).map(p => p.text).join('\n\n');
        const imageParts = parts.filter(p => p.inlineData);

        // Default models
        let selectedModel = model;
        if (!selectedModel) {
            selectedModel = nodeType === 'image' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-preview';
        }

        // Force localhost in development mode to avoid using production URL from .env files
        const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : (import.meta.env.VITE_API_URL || 'https://4444-production.up.railway.app');

        // Construct payload
        const payload: any = {
            model: selectedModel,
            prompt: textPrompt,
            images: imageParts,
            systemInstruction: "You are a helpful AI assistant.",
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
        };

        // Add Image Config & Response Modalities
        if (nodeType === 'image' || options?.aspectRatio || options?.resolution) {
            // Force image modality for image nodes
            if (nodeType === 'image') {
                payload.response_modalities = ['Image'];
                delete payload.systemInstruction;
            }

            if (options?.aspectRatio || options?.resolution) {
                payload.image_config = {};

                if (options?.aspectRatio) {
                    payload.image_config.aspectRatio = options.aspectRatio;
                }

                if (options?.resolution) {
                    payload.image_config.imageSize = options.resolution;
                }

                payload.image_config.sampleCount = 1;
            }
        }

        // Add Tools (Google Search)
        if (options?.googleSearch) {
            payload.tools = [{ google_search: {} }];
        }

        // 3. Call Backend Proxy
        const response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
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
        if (nodeType === 'image') {
            if (data.image) {
                return { type: 'image', content: data.image };
            }
            if (data.text) {
                throw new Error(`生成失败 (模型返回了文本而非图片): ${data.text}`);
            }
            throw new Error("生成失败: 未收到图片数据。");
        }

        if (data.text) {
            return { type: 'text', content: data.text };
        }
        if (data.image) {
            throw new Error("生成失败: 文本节点收到了图片数据。");
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
