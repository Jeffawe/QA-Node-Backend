import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";

export class GeminiService {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('API key is required');
        }
        this.genAi = new GoogleGenAI({ apiKey });
    }

    async uploadImage(filePath) {
        try {
            const file = await this.genAi.files.upload({
                file: filePath
            });

            if (!file?.uri) {
                throw new Error('Failed to upload image to Gemini');
            }

            const mimeType = path.extname(filePath).toLowerCase() === '.png'
                ? 'image/png'
                : 'image/jpeg';

            return {
                uri: file.uri,
                mimeType: file.mimeType || mimeType
            };
        } catch (error) {
            throw new Error(`Image upload failed: ${error.message}`);
        }
    }

    async generateMultimodalContent(prompt, imageUri, mimeType, systemInstruction) {
        try {
            const response = await this.genAi.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    createUserContent([
                        prompt,
                        createPartFromUri(imageUri, mimeType),
                    ]),
                ],
                config: {
                    systemInstruction: systemInstruction
                }
            });

            return response;
        } catch (error) {
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }
    async generateContent(
        prompt, systemInstruction
    ) {
        try {
            const response = await this.genAi.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ text: prompt }],
                config: {
                    systemInstruction
                }
            });

            return response;
        } catch (error) {
            throw new Error(`Text generation failed: ${error.message}`);
        }
    }
}