import { GoogleGenAI } from "@google/genai";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const pollyClient = new PollyClient({});
const s3Client = new S3Client({});

const TABLE_NAME = process.env.CACHE_TABLE_NAME || "ai-cache";
const BUCKET_NAME = process.env.BUCKET_NAME || "meet2-ai-audio";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

// Exponential Backoff Utility
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const status = error.status || (error.response && error.response.status);
      const isRetryable = status === 429 || status === 500 || !status; // Retry on rate limit, server error, or network issues
      
      if (i === maxRetries || !isRetryable) {
        console.error(`Final failure after ${i} retries:`, error);
        throw error;
      }
      
      const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
      console.warn(`Retry ${i + 1}/${maxRetries} after ${Math.round(delay)}ms due to: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export const handler = async (event) => {
  const { fieldName, arguments: args } = event.info;
  const { prompt, image } = args;

  if (fieldName !== "generateAIResponse" && fieldName !== "getAIResponse") {
    throw new Error(`Unknown field: ${fieldName}`);
  }

  // 1. Hash Prompt for Caching
  const hash = crypto.createHash("sha256").update(prompt + (image || "")).digest("hex");

  // 2. Check DynamoDB Cache
  try {
    const cacheResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { promptHash: hash }
    }));

    if (cacheResult.Item && cacheResult.Item.ttl > Math.floor(Date.now() / 1000)) {
      console.log("Cache Hit!");
      return cacheResult.Item.response;
    }
  } catch (err) {
    console.error("Cache Check Error:", err);
  }

  // 3. Call Gemini with Exponential Backoff
  let aiResponse;
  try {
    aiResponse = await withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      
      // Smart Model Selection in Lambda
      const complexKeywords = ["explain", "solve", "code", "draw", "diagram", "how", "why"];
      const isComplex = complexKeywords.some(k => prompt.toLowerCase().includes(k)) || (image && image.length > 0);
      const modelName = isComplex ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
      
      console.log(`Lambda using model: ${modelName}`);
      
      const contents = [];
      if (image) {
        const base64Data = image.includes(',') ? image.split(',')[1] : image;
        contents.push({
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
          ]
        });
      } else {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT
        }
      });
      
      return parseAIResponse(response.text);
    });
  } catch (err) {
    console.error("Gemini Failure:", err);
    return {
      chatAction: "The AI is currently busy. Switching to local fallback mode.",
      mode: "whiteboard",
      clearBoard: false,
      steps: [],
      fallback: true
    };
  }

  // 4. Amazon Polly TTS with S3 Caching
  try {
    const fullSpokenText = aiResponse.steps.map(s => s.spokenText).join(" ").trim();
    if (fullSpokenText) {
      // Hash the spoken text to use as a cache key
      const spokenHash = crypto.createHash("md5").update(fullSpokenText).digest("hex");
      const audioKey = `audio/${spokenHash}.mp3`;

      let audioExists = false;
      try {
        await s3Client.send(new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: audioKey
        }));
        audioExists = true;
        console.log(`Audio cache hit for hash: ${spokenHash}`);
      } catch (e) {
        // Audio doesn't exist or error checking
        console.log(`Audio cache miss for hash: ${spokenHash}`);
      }

      if (!audioExists) {
        console.log("Generating new audio with Polly...");
        const pollyResponse = await pollyClient.send(new SynthesizeSpeechCommand({
          Text: fullSpokenText,
          OutputFormat: "mp3",
          VoiceId: "Joanna",
          Engine: "neural"
        }));

        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: audioKey,
          Body: await pollyResponse.AudioStream.transformToByteArray(),
          ContentType: "audio/mpeg"
        }));
      }

      // Generate a signed URL for the S3 object
      aiResponse.audioUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: audioKey
      }), { expiresIn: 3600 });
    }
  } catch (err) {
    console.warn("Polly/S3 Error (falling back to browser TTS):", err);
  }

  // 5. Save to Cache with 7-day TTL
  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        promptHash: hash,
        response: aiResponse,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      }
    }));
  } catch (err) {
    console.error("Cache Save Error:", err);
  }

  return aiResponse;
};

// Helper to parse the structured response from Gemini text
function parseAIResponse(text) {
  const actionMatch = text.match(/CHAT_ACTION:\s*(.*?)(?=\n|$)/i);
  const modeMatch = text.match(/MODE:\s*(whiteboard|code|none)/i);
  const langMatch = text.match(/LANGUAGE:\s*([a-zA-Z0-9_-]+)/i);
  const clearMatch = text.match(/CLEAR_BOARD:\s*(true|false)/i);

  const steps = [];
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
