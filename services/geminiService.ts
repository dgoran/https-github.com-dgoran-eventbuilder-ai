import { GoogleGenAI, Type } from "@google/genai";
import { AIContentResponse } from "../types";

export const generateWebinarContent = async (topic: string, specificApiKey?: string): Promise<AIContentResponse> => {
  const apiKey = specificApiKey;
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Create a professional webinar event structure for the topic: "${topic}".
    I need a catchy title, a compelling description (approx 100 words), a 3-item agenda, and 2 fictitious expert speakers.
    For each speaker, provide a name, a professional role (e.g. Senior Director), and a short biography (approx 30-40 words).
    The agenda times should be relative (e.g., "00:00", "00:15").
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            agenda: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  title: { type: Type.STRING },
                  speaker: { type: Type.STRING }
                }
              }
            },
            suggestedSpeakers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  bio: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");

    // Robust JSON extraction: find the first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1) {
      text = text.substring(firstBrace, lastBrace + 1);
    } else {
      // Fallback cleaning if braces aren't clear (unlikely with valid JSON)
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    return JSON.parse(text) as AIContentResponse;
  } catch (error) {
    console.error("Error generating content:", error);
    // Fallback for demo purposes if API fails or quota exceeded
    return {
      title: `Webinar: ${topic}`,
      description: "Join us for an insightful session exploring the depths of this topic. Our experts will guide you through the latest trends and strategies.",
      agenda: [
        { time: "10:00 AM", title: "Introduction", speaker: "Host" },
        { time: "10:15 AM", title: "Deep Dive", speaker: "Expert Speaker" },
        { time: "10:45 AM", title: "Q&A", speaker: "All" }
      ],
      suggestedSpeakers: [
        { name: "Jane Doe", role: "Product Lead", bio: "Jane has over 10 years of experience in product management and has led multiple successful launches." },
        { name: "John Smith", role: "Tech Evangelist", bio: "John is a renowned speaker and author who specializes in emerging technologies and digital transformation." }
      ]
    };
  }
};

export const generateImagePromptSuggestions = async (topic: string, specificApiKey?: string): Promise<string[]> => {
  const apiKey = specificApiKey;
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Generate 3 distinct, detailed, and professional image generation prompts for a webinar cover image about "${topic}".
    The prompts should be descriptive, specifying style (e.g., photorealistic, abstract, 3D render), lighting, and composition.
    Return ONLY the prompts as a JSON array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    let text = response.text;
    if (!text) return [];

    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1) {
      text = text.substring(firstBracket, lastBracket + 1);
    } else {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    return JSON.parse(text) as string[];
  } catch (e) {
    console.error("Error generating image prompts:", e);
    // Fallback suggestions
    return [
      `Professional workspace background with a laptop displaying charts about ${topic}, soft lighting`,
      `Abstract digital art representing ${topic} with blue and orange gradient connections`,
      `Conference room setting with blurred people in background, focusing on ${topic} theme`
    ];
  }
};

export const generateCoverImage = async (prompt: string, specificApiKey?: string): Promise<string | null> => {
  const apiKey = specificApiKey;
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Using gemini-2.5-flash-image for general image generation tasks
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: `Generate a high-quality, professional 16:9 webinar cover image for: ${prompt}. The image should be suitable for a landing page background. No text overlays.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      // Iterate through parts to find the image
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error generating cover image:", error);
    throw error;
  }
};