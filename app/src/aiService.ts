import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Analyzes an image and returns a list of relevant collection tags.
 * 
 * @param apiKey The Gemini API Key
 * @param customModel Optional custom model name to use instead of auto-detecting
 * @returns Array of tags formatted as 'ai:tag_name'
 */
export async function analyzeImageWithGemini(apiKey: string, imageBlob: Blob, customModel?: string): Promise<string[]> {
    if (!apiKey) {
        console.warn('Gemini API key is not set. Skipping AI analysis.');
        return [];
    }

    try {
        let targetModel = customModel || "gemini-1.5-flash";
        
        if (!customModel) {
            // Fetch available models to find a working one for this API key
            try {
                const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                if (modelsRes.ok) {
                    const data = await modelsRes.json();
                    const availableModels = data.models || [];
                    console.log("Available Gemini Models:", availableModels.map((m: any) => m.name));
                    
                    // Find a flash or pro model that supports generateContent
                    const validModel = availableModels.find((m: any) => 
                        m.supportedGenerationMethods?.includes("generateContent") && 
                        (m.name.includes("gemini-1.5-flash") || m.name.includes("gemini-1.5-pro") || m.name.includes("gemini-2.0-flash") || m.name.includes("gemini-pro-vision"))
                    );
                    
                    if (validModel) {
                        targetModel = validModel.name.replace("models/", "");
                        console.log("Auto-selected model:", targetModel);
                    }
                }
            } catch (e) {
                console.warn("Failed to list models, falling back to default.", e);
            }
        } else {
            console.log("Using custom Gemini model:", targetModel);
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: targetModel });

        // Convert Blob to Base64
        const base64Data = await blobToBase64(imageBlob);
        
        const prompt = `Analyze this image and provide 2 to 5 highly relevant category tags to organize it in a photo gallery or file drive.
Rules:
1. Return ONLY a comma-separated list of tags. No explanations.
2. Use title case for tags (e.g., 'Nature', 'Receipts', 'Selfies', 'Screenshots', 'Documents').
3. Keep tags concise (1-2 words).
4. If it's a screenshot or document, specifically tag it as such.`;

        const imagePart = {
            inlineData: {
                data: base64Data.split(',')[1],
                mimeType: imageBlob.type || 'image/jpeg'
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text().trim();
        
        if (!text) return [];

        const tags = text.split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0)
            .map(tag => `ai:${tag}`);

        return tags;
    } catch (error) {
        console.error('Gemini API Error:', error);
        throw error;
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
