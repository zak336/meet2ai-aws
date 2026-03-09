import { useState, useCallback } from 'react';

const APPSYNC_URL = process.env.VITE_APPSYNC_GRAPHQL_URL || "https://uuli22skirgnva2tbufvnmdggy.appsync-api.eu-north-1.amazonaws.com/graphql";
const API_KEY = process.env.VITE_APPSYNC_API_KEY || "da2-6mjia2dmyzczd6vreueu6fgtq";

export const useAIClassroom = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateResponse = useCallback(async (prompt, image = null) => {
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

      // Handle Enterprise Fallback Logic
      if (aiData.fallback) {
        console.warn("Enterprise AI Busy - Using Local Fallback Architecture");
        // Trigger your local Gemini logic here if needed
      }

      return aiData;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generateResponse, loading, error };
};

// Example usage in component:
/*
const { generateResponse, loading } = useAIClassroom();
const handleSend = async (text) => {
  const data = await generateResponse(text);
  if (data) {
    // Update your app state with data.steps, etc.
    if (data.audioUrl) {
      const audio = new Audio(data.audioUrl);
      audio.play().catch(() => {
        // Fallback to browser TTS if audio playback fails
        speakWithBrowser(data.steps);
      });
    }
  }
};
*/
