import { useState, useCallback } from 'react';

const APPSYNC_URL = (import.meta as any).env.VITE_APPSYNC_GRAPHQL_URL || "https://uuli22skirgnva2tbufvnmdggy.appsync-api.eu-north-1.amazonaws.com/graphql";
const API_KEY = (import.meta as any).env.VITE_APPSYNC_API_KEY || "da2-6mjia2dmyzczd6vreueu6fgtq";

export interface AIStep {
  spokenText: string;
  whiteboardText: string;
  highlightText?: string;
  permanentHighlight?: string;
  drawings?: string; // JSON string from Lambda
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

export const useAIClassroom = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateResponse = useCallback(async (prompt: string, image: string | null = null): Promise<AIResponse | null> => {
    setLoading(true);
    setError(null);

    const query = `
      mutation GenerateAI($prompt: String!, $image: String) {
        generateAIResponse(prompt: $prompt, image: $image) {
          chatAction
          mode
          language
          clearBoard
          audioUrl
          fallback
          steps {
            spokenText
            whiteboardText
            highlightText
            permanentHighlight
            drawings
          }
        }
      }
    `;

    try {
      const response = await fetch(APPSYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          query,
          variables: { prompt, image },
        }),
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const aiData = result.data.generateAIResponse;

      if (aiData.fallback) {
        console.warn("Enterprise AI Busy - Using Local Fallback Architecture");
      }

      return aiData;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generateResponse, loading, error };
};
