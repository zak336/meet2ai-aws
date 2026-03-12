import { useState, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are an AI teacher. 
Analyze the user's input (text and/or image).

DECISION LOGIC (CRITICAL):
1. IF the user provided an IMAGE:
   - MODE: whiteboard
   - CLEAR_BOARD: true
   - The image is ALREADY displayed on the board.
   - Your task is to EXPLAIN the image or SOLVE the problem shown in it.
   - Write your explanation/solution step-by-step on the whiteboard (it will appear below the image).

2. IF the user explicitly asked to "write", "draw", "show me on the board", "code this", or similar:
   - MODE: whiteboard (or code)
   - CLEAR_BOARD: true

3. IF the user asked a simple question AND did NOT ask to write/draw:
   - MODE: none
   - CLEAR_BOARD: false
   - Reply ONLY with a spoken explanation.
   - End your spoken response by asking: "Shall I write this on the whiteboard for you?"

Next, generate a "CHAT_ACTION" to reply to the user in the chat.
- "CHAT_ACTION: <action text>"

Next, decide the MODE: "whiteboard", "code", or "none".
- "MODE: <mode>"

Next, determine the programming language if applicable.
- "LANGUAGE: <language>" (or none)

Next, decide CLEAR_BOARD.
- "CLEAR_BOARD: <true/false>"

Tone: Patient, clear, and direct.

If MODE is "none":
- Just provide a "SPOKEN" block.
- Example:
  ===STEP===
  SPOKEN: Photosynthesis is how plants make food using sunlight. Shall I write the details on the whiteboard?
  WRITTEN: 
  ===STEP===

If MODE is "whiteboard":
  1. Step 1: Write the topic heading. Use HIGHLIGHT for the heading. Speak intro.
  2. Step 2: Write the content line-by-line. 
  
  CRITICAL: Break content into small, digestible lines.
  CRITICAL: Use ===STEP=== to separate each line of explanation.
`;

export interface AIStep {
  spokenText: string;
  whiteboardText: string;
  highlightText?: string;
  permanentHighlight?: string;
  drawings?: string;
}

export interface AIResponse {
  chatAction: string;
  mode: string;
  language?: string;
  clearBoard: boolean;
  steps: AIStep[];
  audioUrl?: string;
  fallback?: boolean;
}

function parseAIResponse(text: string): AIResponse {
  const actionMatch = text.match(/CHAT_ACTION:\s*(.*?)(?=\n|$)/i);
  const modeMatch = text.match(/MODE:\s*(whiteboard|code|none)/i);
  const langMatch = text.match(/LANGUAGE:\s*([a-zA-Z0-9_-]+)/i);
  const clearMatch = text.match(/CLEAR_BOARD:\s*(true|false)/i);

  const steps: AIStep[] = [];
  const stepBlocks = text.split('===STEP===');
  
  for (let i = 1; i < stepBlocks.length; i++) {
    const block = stepBlocks[i].trim();
    if (!block) continue;

    const spokenMatch = block.match(/SPOKEN:\s*(.*?)(?=WRITTEN:|DRAW:|HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
    const writtenMatch = block.match(/WRITTEN:\s*(.*?)(?=DRAW:|HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
    const drawMatch = block.match(/DRAW:\s*(.*?)(?=HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
    const highlightMatch = block.match(/HIGHLIGHT:\s*(.*?)(?=PERMANENT_HIGHLIGHT:|$)/s);
    const permHighlightMatch = block.match(/PERMANENT_HIGHLIGHT:\s*(.*?)$/s);

    if (spokenMatch) {
      steps.push({
        spokenText: spokenMatch[1].trim(),
        whiteboardText: writtenMatch ? writtenMatch[1].trim() : "",
        highlightText: highlightMatch ? highlightMatch[1].trim() : "",
        permanentHighlight: permHighlightMatch ? permHighlightMatch[1].trim() : "",
        drawings: drawMatch ? drawMatch[1].trim() : "[]"
      });
    }
  }

  return {
    chatAction: actionMatch ? actionMatch[1].trim() : "I'm ready to help!",
    mode: modeMatch ? modeMatch[1].toLowerCase() : "none",
    language: langMatch ? langMatch[1].toLowerCase() : "none",
    clearBoard: clearMatch ? clearMatch[1].toLowerCase() === 'true' : false,
    steps: steps
  };
}

export const useAIClassroom = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateResponse = useCallback(async (prompt: string, image: string | null = null): Promise<AIResponse | null> => {
    setLoading(true);
    setError(null);

    if (!GEMINI_API_KEY) {
      setError('Gemini API key not configured');
      setLoading(false);
      return null;
    }

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      
      // Smart model selection - using Gemini 2.5
      const complexKeywords = ["explain", "solve", "code", "draw", "diagram", "how", "why"];
      const isComplex = complexKeywords.some(k => prompt.toLowerCase().includes(k)) || (image && image.length > 0);
      const modelName = "gemini-2.5-flash";
      
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: SYSTEM_PROMPT
      });

      const parts: any[] = [{ text: prompt }];
      
      if (image) {
        const base64Data = image.includes(',') ? image.split(',')[1] : image;
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data
          }
        });
      }

      const result = await model.generateContent(parts);
      const response = await result.response;
      const text = response.text();
      
      const aiData = parseAIResponse(text);

      // Browser TTS for audio (no Polly needed)
      const fullSpokenText = aiData.steps.map(s => s.spokenText).join(" ").trim();
      if (fullSpokenText && 'speechSynthesis' in window) {
        // Audio will be handled by the component using Web Speech API
      }

      return aiData;
    } catch (err: any) {
      setError(err.message);
      console.error('Gemini request failed:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generateResponse, loading, error };
};
