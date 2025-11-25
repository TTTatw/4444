
import { GoogleGenAI, Modality, Part, GenerateContentParameters, HarmProbability, FinishReason } from '@google/genai';
import type { ModelType, NodeType } from '../types';

// Initialize the Gemini AI client at the module level.
const apiKey = process.env.API_KEY;
if (!apiKey || apiKey === 'dummy_key_for_ui_dev') {
    console.warn('⚠️ Gemini API Key is not configured. Please add GEMINI_API_KEY to your .env file.');
}
const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy_key_for_ui_dev' });

type Input = {
    type: NodeType;
    data: string | null;
};

export type NodeResult = {
    type: 'text' | 'image';
    content: string;
};

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

const getFullPrompt = (inputs: Input[], instruction: string): string => {
    const textPromptParts = inputs.filter(i => i.type === 'text' && i.data).map(i => i.data || '');
    if (instruction.trim()) {
        textPromptParts.push(instruction.trim());
    }
    return textPromptParts.join('\n\n');
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


export const runNode = async (instruction: string, nodeType: NodeType, inputs: Input[], model?: string): Promise<NodeResult> => {
    try {
        const fullPrompt = getFullPrompt(inputs, instruction);

        // CASE 1: Text Generation
        if (nodeType === 'text') {
            const parts = buildParts(inputs, instruction);
            if (parts.length === 0) {
                throw new Error("错误：无法生成。节点需要指令或上游输入才能运行。");
            }

            // Default to Gemini 3.0 Pro if no model is specified
            const selectedModel = model || 'gemini-3-pro-preview';

            const request: GenerateContentParameters = {
                model: selectedModel,
                contents: { parts },
                // Note: responseMimeType is not allowed for some search tools, so we don't set it by default here.
            };

            const response = await ai.models.generateContent(request);
            const textResult = response.text;
            if (textResult && textResult.trim()) {
                return { type: 'text', content: textResult.trim() };
            }
            throw new Error(handleApiError(response));
        }

        // CASE 2: Image Node Operations
        if (nodeType === 'image') {
            if (!fullPrompt.trim()) {
                throw new Error("错误：图片生成或编辑需要一个文本指令。请为节点添加指令或连接一个文本节点。");
            }
            
            // Default to Nano Banana (Flash Image) instead of Pro Preview to avoid permission errors for general keys
            const selectedModel = model || 'gemini-2.5-flash-image';

            const parts = buildParts(inputs, instruction);
            
            const request: GenerateContentParameters = {
                model: selectedModel,
                contents: { parts },
                // Note: responseMimeType is not allowed for these models.
                // imageConfig can be added for aspect ratio / size, but defaults are fine for now.
            };

            // Both gemini-3-pro-image-preview and gemini-2.5-flash-image use generateContent
            const response = await ai.models.generateContent(request);
            
            // Find image part in the response
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return { type: 'image', content: part.inlineData.data };
                }
            }
            
            // Check if it returned text instead (e.g. refusal or explanation)
            const textResult = response.text;
            if (textResult && textResult.trim()) {
                return { type: 'text', content: textResult.trim() };
            }

            throw new Error(handleApiError(response));
        }

        // Fallback for any unhandled case
        throw new Error("Invalid node configuration or unsupported operation.");

    } catch (error) {
        console.error("Gemini API Error:", error);
        if (error instanceof Error) {
            if (error.message.includes('SAFETY')) {
                throw new Error("生成请求因安全原因被阻止。请修改您的提示词。");
            }
            if (error.message.includes('API_KEY')) {
                throw new Error("API 密钥无效或缺失。请检查您的配置。");
            }
            if (error.message.includes('403') || error.message.includes('PERMISSION_DENIED')) {
                throw new Error("权限不足：当前 API Key 无法访问选定的模型 (可能是 Pro 版)。请尝试切换回基础版本 (Flash / Nano Banana) 模型。");
            }
        }
        throw error instanceof Error ? error : new Error("An unknown error occurred with the Gemini API.");
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