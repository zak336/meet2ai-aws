import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, ClosedCaption, Hand, MonitorUp, MoreVertical, PhoneOff, MessageSquare, Users, Shapes, Lock, Info, Download, Cloud, CloudOff, Brain } from 'lucide-react';
import Whiteboard, { Drawing } from './Whiteboard';
import CodeBoard from './CodeBoard';
import ChatPanel from './ChatPanel';
import AudioVisualizer from './AudioVisualizer';
import { useAIClassroom } from '../hooks/useAIClassroom';

// Speech Recognition Types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

let globalUtterance: SpeechSynthesisUtterance | null = null;

const SYSTEM_PROMPT = `You are an AI teacher. 
Analyze the user's input (text and/or image) in the context of the Conversation History.

DECISION LOGIC (CRITICAL):
1. IF the user provided an IMAGE:
   - MODE: whiteboard
   - CLEAR_BOARD: true
   - The image is ALREADY displayed on the board.
   - Your task is to EXPLAIN the image or SOLVE the problem shown in it.
   - Write your explanation/solution step-by-step on the whiteboard (it will appear below the image).
   - If it's a math/physics problem, use the "Physics/Math Structure" defined below.
   - If it's a theorem or text, write the wording and use HIGHLIGHT to emphasize key points while explaining.

2. IF the user explicitly asked to "write", "draw", "show me on the board", "code this", "explain", "brief", or similar:
   - MODE: whiteboard (or code)
   - CLEAR_BOARD: true (usually, unless follow-up)

3. IF the user says "Yes", "Please do", "Write it", "Go ahead", "Sure", "Okay" (especially if the previous AI message asked "Shall I write this...?"):
   - MODE: whiteboard
   - CLEAR_BOARD: true
   - Look at the PREVIOUS AI message in the history to know WHAT to write.
   - Write the full explanation of the topic discussed in the previous turn.

4. IF the user asked a simple question (e.g., "What is photosynthesis?", "Who is Newton?") AND did NOT ask to write/draw/explain/brief:
   - MODE: none
   - CLEAR_BOARD: false
   - Reply ONLY with a spoken explanation.
   - Keep it short, easy, and conversational.
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
  SPOKEN: Photosynthesis is how plants make food using sunlight. They turn carbon dioxide and water into glucose and oxygen. Shall I write the details and draw the process on the whiteboard?
  WRITTEN: 
  ===STEP===

If MODE is "whiteboard" (and CLEAR_BOARD is true):
  1. Step 1: Write the topic heading. Use HIGHLIGHT for the heading. Speak intro.
  2. Step 2: Write the content line-by-line following this EXACT structure for general topics:
     - A. General Statement / Definition: Introduce what it is simply.
     - B. Process / Working: Explain how it works step-by-step.
     - C. Diagram (if needed): Use DRAW to create a HIGH-QUALITY, ACCURATE, and LABELLED diagram to illustrate the process or concept. Use standard SVG paths and shapes. Diagrams MUST be real, standard, and scientifically/technically accurate. DO NOT invent imaginary, abstract, or nonsensical shapes. Use precise SVG coordinates to draw recognizable, real-world representations (e.g., actual anatomical shapes, standard circuit symbols, realistic mechanical parts).
     - D. Example: Provide a clear, real-world example.
     - CRITICAL: Break content into small, digestible lines. Do NOT write "Definition:" or "Example:". Just write the content naturally.
     - Spoken text can be slightly different (more conversational) than written text, but keep the core message aligned.
     - CRITICAL: Do NOT move to the next line until the writing AND speaking for the current line are finished.
  
  CRITICAL FOR PHYSICS PROBLEMS:
  Follow "The Physics Structure":
  I. Setup (The Model)
     - Givens & Goal: List known variables (v, m, theta) and what you need to find.
     - Diagram: Draw a Free Body Diagram (FBD) or circuit schematic using DRAW (standard SVG paths/shapes).
     - Assumptions: State constraints (e.g., "Vacuum," "Frictionless," "Point mass").
  II. The Law (The Weapon)
     - Principle: State the governing law (e.g., Newton's 2nd Law, Conservation of Energy).
     - Equation: Write down the base formula using simple text (pen). NEVER use SVG for equations.
  III. Execution (The Solve)
     - Symbolic First: Isolate the target variable using algebra before plugging in any numbers.
     - Substitute: Insert values only at the very end.
  IV. Sanity Check
     - Units: Do the dimensions match on both sides?
     - Limits: Does the result make sense if mass = 0 or time -> infinity?
  V. Result
     - Answer: State the value with correct significant figures and units.
     - Meaning: Interpret the physical sign (+/-) or magnitude.

  CRITICAL FOR MATH PROBLEMS:
  Follow "The Math Structure":
  I. Setup (The Premise)
     - Given & Goal: Define the starting conditions and what to prove or find.
     - Visual: Sketch the graph, geometric figure, or define the domain using DRAW (standard SVG paths/shapes).
  II. The Strategy (The Tool)
     - Method: Select the specific Theorem or Technique (e.g., "Pythagorean Theorem," "Integration by Parts," "Induction").
  III. Execution (The Logic)
     - Step-by-Step: Apply logical operators ("Since," "Therefore," "Implies").
     - Calculation: Perform the algebraic or calculus operations clearly.
  IV. Verification
     - Constraints: Check for undefined values (e.g., division by zero, negative roots).
     - Edge Cases: Does the solution hold for x=0, x=1, or boundary conditions?
  V. Result
     - Conclusion: Box the final answer clearly.
     - Q.E.D.: Mark the proof complete.

  3. Step 3: Write the formula or key code example (if applicable). Speak an explanation while writing it.
  4. Step 4: Ask if they have questions. ONLY speak this. DO NOT write anything.
  5. HIGHLIGHTING: 
     - Use the HIGHLIGHT field to emphasize key terms TEMPORARILY as you explain them.
     - Use the PERMANENT_HIGHLIGHT field to PERMANENTLY highlight key terms.
     - Use HIGHLIGHT for topic headlines instead of underlining.
  6. DRAWING:
     - Use the DRAW field to create diagrams.
     - CRITICAL: Output a JSON array of drawing objects.
     - Supported types: "rect", "circle", "ellipse", "line", "arrow", "text", "path".
     - Format examples:
       - Rect: {"type": "rect", "x": 10, "y": 10, "width": 100, "height": 50, "stroke": "black", "fill": "red"}
       - Circle: {"type": "circle", "x": 50, "y": 50, "width": 40} (width is diameter)
       - Line: {"type": "line", "x": 10, "y": 10, "x2": 100, "y2": 100}
       - Arrow: {"type": "arrow", "x": 10, "y": 10, "x2": 100, "y2": 100}
       - Text: {"type": "text", "x": 10, "y": 20, "text": "Label", "fontSize": 20}
       - Path: {"d": "M10 10 ..."} (for complex custom shapes)
     - Coordinates are relative to a 800x600 canvas.
     - ALWAYS use diagrams for Physics, Math, and Geometry. Use standard SVG paths or shapes for all diagrams.
     - NEVER use SVG for math equations. Use simple text (pen).
     
     ELECTRONIC COMPONENTS (Circuit Diagrams):
     - Use "path" type for components.
     - Resistor (Zig-zag): "M0 0 L10 -10 L20 10 L30 -10 L40 10 L50 0" (Scale/Translate as needed)
     - Capacitor (Parallel plates): "M0 -15 L0 15 M10 -15 L10 15" (Gap 10)
     - Battery (DC Source): "M0 -15 L0 15 M10 -7 L10 7" (Long bar +, Short bar -)
     - Inductor (Loops): "M0 0 Q10 -20 20 0 Q30 -20 40 0 Q50 -20 60 0"
     - Switch: "M0 0 L20 -10" (Open)
     - Ground: "M0 0 L30 0 M5 5 L25 5 M10 10 L20 10"
     - Connect components with "line" type.
     - Label components (R1, C1, V1) using "text" type.
  
  Example:
  ===STEP===
  SPOKEN: Let's look at a triangle.
  WRITTEN: Triangle Properties
  DRAW: [{"type": "line", "x": 50, "y": 150, "x2": 150, "y2": 150}, {"type": "line", "x": 150, "y": 150, "x2": 100, "y2": 50}, {"type": "line", "x": 100, "y": 50, "x2": 50, "y2": 150}, {"type": "text", "x": 90, "y": 160, "text": "Base"}]
  HIGHLIGHT: Triangle Properties
  PERMANENT_HIGHLIGHT: 
  ===STEP===

- If MODE is code, follow this Methodology:
  
  CRITICAL FOR CODING:
  - For SIMPLE coding tasks (e.g. "print hello world", "add two numbers"):
    - Go directly to MODE: code.
    - Follow the "Live Coding Flow" below.
 
  - For COMPLEX coding tasks (e.g. "fibonacci sequence", "sort an array", "create a game", "solve leetcode", "linked list"):
    - PHASE 1: ALGORITHM (Current Turn)
      - MODE: whiteboard
      - CLEAR_BOARD: true
      - Write the "Algorithm Plan" or "Logic Flow" on the whiteboard.
      - FOLLOW THE STANDARD ALGORITHM TEMPLATE:
        1. Start
        2. Declare variables (storage for your data).
        3. Input the data.
        4. Process (using Sequence, Selection, or Iteration). Process must be in steps.
        5. Output the result.
        6. Stop
      - Use DRAW to create flowcharts or diagrams if helpful.
      - NEVER use SVG for math equations. Use simple text and write using pen.
      - Use standard SVG shapes (rect, circle, arrow, etc.) or paths for mathematical patterns and diagrams.
      - Explain the logic step-by-step.
      - End by asking: "Ready to write the code?"
    
    - PHASE 2: IMPLEMENTATION (Next Turn - wait for user "Yes")
      - MODE: code
      - CLEAR_BOARD: true
      - Follow the "Live Coding Flow" below.

  Live Coding Flow (for MODE: code):
  1. Keep it Simple: Do not over-explain simple concepts. Keep explanations brief and to the point.
  2. Objective First: Start with a step where you write the aim/question as a comment at the top of the board. Speak the aim clearly while writing it.
  3. Introduce code line-by-line.
     For EVERY SINGLE LINE or logical chunk, follow this sequence:
     - STEP A (Comment): Write the comment explaining the goal of the next line.
     - STEP B (Code): Write the actual code line.
     - STEP C... (Post-Line Explanations): IMMEDIATELY after writing the line, generate separate steps to highlight and explain specific parts of THAT line.
       - Leave WRITTEN empty for these steps (so the board doesn't change).
       - Use HIGHLIGHT to select specific functions, variables, or operators (e.g. "input", "print", "=", "a").
       - Speak a specific explanation for that highlighted part.
     
     Repeat this sequence for every line.
     CRITICAL: Do not move to the next line until the typing and speaking for the current step are finished. The system handles this, but you must provide the steps in the correct order.
  4. Sequential Logic: Always follow the Input -> Processing -> Output flow.
  5. The "Pitfall & Pivot": Identify common beginner mistakes briefly. Do this as a spoken-only step (leave WRITTEN empty) before writing the tricky code.
  6. Verification: Conclude the lesson by showing a dry run or example of the code in action with sample numbers. This should be a spoken-only step (leave WRITTEN empty).

If CLEAR_BOARD is false (follow-up question):
- Do NOT rewrite the existing code.
- Provide the explanation in spokenText.
- Leave whiteboardText EMPTY unless you are adding new code.
- Use the HIGHLIGHT field to select the exact existing text/code you are explaining. This is CRITICAL for follow-up questions.
- Use PERMANENT_HIGHLIGHT if the user asks to re-explain a point or emphasizes something.

Format your response EXACTLY like this example:
CHAT_ACTION: Good
MODE: code
LANGUAGE: python
CLEAR_BOARD: true
===STEP===
SPOKEN: Our aim is to add two numbers.
WRITTEN: # Aim: Add two numbers
DRAW: 
HIGHLIGHT: 
PERMANENT_HIGHLIGHT: 
===STEP===
...
`;

interface ClassroomProps {
  isActive: boolean;
  onEndSession: () => void;
}

export default function Classroom({ isActive, onEndSession }: ClassroomProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [useAWS, setUseAWS] = useState(true);
  const { generateResponse: generateAWSResponse, loading: awsLoading } = useAIClassroom();
  const [presentationMode, setPresentationMode] = useState<'none' | 'whiteboard' | 'code'>('none');
  const [codeLanguage, setCodeLanguage] = useState('typescript');
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'error' | 'reconnecting'>('idle');
  const [ccOn, setCcOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Chat & Voice State
  const [messages, setMessages] = useState<{role: 'user'|'ai', text: string, image?: string}[]>([]);
  const [sessionHistory, setSessionHistory] = useState<{timestamp: string, query: string, response: string}[]>([]);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const consecutiveNetworkErrorsRef = useRef(0);
  const restartTimeoutRef = useRef<any>(null);
  
  // Use a ref to always access the latest handleSendMessage function
  const handleSendMessageRef = useRef<any>(null);

  useEffect(() => {
    if (!isActive) return;

    // Fetch history from backend
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        setSessionHistory(data.map((item: any) => ({
          timestamp: item.timestamp,
          query: item.query,
          response: item.response
        })));
      })
      .catch(err => console.error("Error fetching history:", err));

    // Initialize Speech Recognition
    const initSpeechRecognition = () => {
      if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setVoiceStatus('listening');
        consecutiveNetworkErrorsRef.current = 0;
      };

      recognition.onresult = (event: any) => {
        consecutiveNetworkErrorsRef.current = 0; // Reset on success
        setVoiceStatus('listening');
        const transcript = event.results[0][0].transcript;
        console.log('Voice command:', transcript);
        if (handleSendMessageRef.current) {
          handleSendMessageRef.current(transcript);
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          setVoiceStatus('reconnecting');
          const delay = Math.min(500 * Math.pow(2, consecutiveNetworkErrorsRef.current), 10000);
          
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          
          restartTimeoutRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              try {
                if (!recognitionRef.current) initSpeechRecognition();
                recognitionRef.current.start();
              } catch (e) {
                console.warn("Restart failed, re-initializing...");
                initSpeechRecognition();
                try { recognitionRef.current.start(); } catch(err) {
                  console.error("Critical voice restart failure:", err);
                }
              }
            } else {
              setVoiceStatus('idle');
            }
          }, delay);
        } else {
          setVoiceStatus('idle');
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'not-allowed') {
           setMicOn(false);
           isListeningRef.current = false;
           setVoiceStatus('error');
           alert("Microphone access was denied. Please check your browser permissions.");
        } else if (event.error === 'network') {
           consecutiveNetworkErrorsRef.current += 1;
           setVoiceStatus('reconnecting');
           console.warn(`Speech recognition network error (${consecutiveNetworkErrorsRef.current}).`);
           
           if (consecutiveNetworkErrorsRef.current >= 8) { 
             console.error("Too many consecutive network errors. Stopping speech recognition.");
             setMicOn(false);
             isListeningRef.current = false;
             setVoiceStatus('error');
             alert("Speech recognition is having persistent network issues. Please check your internet connection or try again later.");
           }
        } else if (event.error === 'no-speech') {
           // Normal
        } else if (event.error === 'aborted') {
           // Normal
        } else {
           console.error("Speech recognition error:", event.error);
           setVoiceStatus('error');
        }
      };

      recognitionRef.current = recognition;
    };

    initSpeechRecognition();

    if (window.innerWidth >= 768) {
      setIsChatOpen(true);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
    };
  }, [isActive]);

  const toggleMic = async () => {
    if (micOn) {
      stream?.getAudioTracks().forEach(track => track.stop());
      setMicOn(false);
      isListeningRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (stream && stream.getVideoTracks().length === 0) {
        setStream(null);
      }
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoOn });
        setStream(newStream);
        if (videoRef.current && videoOn) videoRef.current.srcObject = newStream;
        setMicOn(true);
        
        if (recognitionRef.current) {
          isListeningRef.current = true;
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.error("Error starting speech recognition:", e);
          }
        } else {
          alert("Voice control is not supported in this browser. Please use Chrome, Edge, or Safari.");
        }
      } catch (e: any) {
        console.error("Mic error:", e);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDismissedError' || e.message.includes('Permission dismissed')) {
          alert("Microphone access was denied or dismissed. Please allow microphone access in your browser settings to use this feature.");
        } else {
          alert("Could not access microphone. Please check your device.");
        }
      }
    }
  };

  const toggleVideo = async () => {
    if (videoOn) {
      stream?.getVideoTracks().forEach(track => track.stop());
      setVideoOn(false);
      if (stream && stream.getAudioTracks().length === 0) {
        setStream(null);
      }
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: micOn });
        setStream(newStream);
        if (videoRef.current) videoRef.current.srcObject = newStream;
        setVideoOn(true);
      } catch (e: any) {
        console.error("Video error:", e);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDismissedError' || e.message.includes('Permission dismissed')) {
          alert("Camera access was denied or dismissed. Please allow camera access in your browser settings to use this feature.");
        } else {
          alert("Could not access camera. Please check your device.");
        }
      }
    }
  };
  
  const [whiteboardText, setWhiteboardText] = useState("Welcome to the AI Classroom!\n\nAsk me anything in the chat, and I'll explain it here on the whiteboard.");
  const [isWriting, setIsWriting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(50);
  const [expectedDuration, setExpectedDuration] = useState(2000);
  const [usePolly, setUsePolly] = useState(false);
  const [pollyAudioUrl, setPollyAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [steps, setSteps] = useState<{spokenText: string, whiteboardText: string, highlightText?: string, permanentHighlight?: string, drawings?: Drawing[]}[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [startedStepIndex, setStartedStepIndex] = useState(-1);
  const [stepWritingComplete, setStepWritingComplete] = useState(false);
  const [stepSpeakingComplete, setStepSpeakingComplete] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState("");
  const [permanentHighlights, setPermanentHighlights] = useState<string[]>([]);
  const [currentDrawings, setCurrentDrawings] = useState<Drawing[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const clearBoardRef = useRef(true);
  const keepImageRef = useRef(false);
  const executingStepRef = useRef(-1);
  const greetedRef = useRef(false);

  // Greeting Effect
  useEffect(() => {
    if (!isActive) return;
    if (greetedRef.current) return;

    const performGreeting = async () => {
      if (greetedRef.current) return;
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      if (useAWS) {
        try {
          const response = await generateAWSResponse("Welcome the student to the AI Classroom. Introduce yourself as their AI teacher and ask what they want to learn today. Keep it very brief.");
          if (response && !response.fallback) {
            greetedRef.current = true;
            
            if (response.audioUrl) {
              setUsePolly(true);
              setPollyAudioUrl(response.audioUrl);
              
              const audio = new Audio(response.audioUrl);
              audioRef.current = audio;
              audio.play().catch(err => {
                console.warn("Autoplay blocked Polly greeting, will try again on interaction", err);
                greetedRef.current = false;
              });
            }

            setMessages(prev => [...prev, { role: 'ai', text: response.chatAction }]);
            
            const processedSteps = response.steps.map(step => ({
              ...step,
              drawings: typeof step.drawings === 'string' ? JSON.parse(step.drawings) : step.drawings
            }));
            setSteps(processedSteps);
          } else {
            fallbackGreeting();
          }
        } catch (err) {
          console.error("AWS Greeting failed, falling back to browser TTS", err);
          fallbackGreeting();
        }
      } else {
        fallbackGreeting();
      }
    };

    const fallbackGreeting = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance("Welcome to the AI Classroom! I'm your AI teacher. What would you like to learn today?");
        
        const speak = () => {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {
              window.speechSynthesis.onvoiceschanged = null;
              speak();
            };
            return;
          }
          
          const englishVoice = voices.find(v => v.lang.startsWith('en-') && !v.localService) || 
                               voices.find(v => v.lang.startsWith('en-')) || 
                               voices[0];
          if (englishVoice) utterance.voice = englishVoice;
          
          utterance.onstart = () => { greetedRef.current = true; };
          utterance.onerror = () => { greetedRef.current = false; };
          
          window.speechSynthesis.speak(utterance);
        };
        
        speak();
      }
    };

    const timer = setTimeout(performGreeting, 1000);
    
    const handleFirstInteraction = () => {
      if (!greetedRef.current) {
        performGreeting();
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [useAWS, generateAWSResponse, isActive]);

  useEffect(() => {
    if (steps.length > 0 && currentStepIndex === -1) {
      setCurrentStepIndex(0);
    }
  }, [steps.length, currentStepIndex]);

  useEffect(() => {
    if (currentStepIndex >= 0 && currentStepIndex < steps.length) {
      if (stepWritingComplete && stepSpeakingComplete && currentStepIndex === executingStepRef.current) {
        if (currentStepIndex < steps.length - 1) {
          setStepWritingComplete(false);
          setStepSpeakingComplete(false);
          setCurrentStepIndex(currentStepIndex + 1);
        } else if (!isProcessing) {
          setIsWriting(false);
        }
      }
    }
  }, [stepWritingComplete, stepSpeakingComplete, currentStepIndex, steps.length, isProcessing]);

  useEffect(() => {
    if (currentStepIndex >= 0 && currentStepIndex < steps.length && currentStepIndex !== executingStepRef.current) {
      executingStepRef.current = currentStepIndex;
      setStartedStepIndex(currentStepIndex);
      const step = steps[currentStepIndex];
      setStepWritingComplete(false);
      setStepSpeakingComplete(false);
      
      if (step.whiteboardText || (step.drawings && step.drawings.length > 0)) {
        if (currentStepIndex === 0 && clearBoardRef.current) {
          setWhiteboardText(step.whiteboardText || "");
          setPermanentHighlights([]);
          setCurrentDrawings([]);
          
          if (!keepImageRef.current) {
            setCurrentImage(null);
          }
          keepImageRef.current = false;
        } else {
          if (step.whiteboardText) {
            setWhiteboardText(prev => prev + (prev && step.whiteboardText ? "\n" : "") + step.whiteboardText);
          }
        }
        setIsWriting(true);
      } else {
        if (currentStepIndex === 0 && clearBoardRef.current) {
          setWhiteboardText("");
          setPermanentHighlights([]);
          setCurrentDrawings([]);
          
          if (!keepImageRef.current) {
            setCurrentImage(null);
          }
          keepImageRef.current = false;
        }
        setIsWriting(false);
        setStepWritingComplete(true);
      }
      
      setCurrentHighlight(step.highlightText || "");
      
      if (step.highlightText) {
        setTimeout(() => {
          setCurrentHighlight("");
        }, 2000);
      }
      
      if (step.permanentHighlight) {
        const newHighlights = step.permanentHighlight.split(',').map(s => s.trim()).filter(Boolean);
        setPermanentHighlights(prev => [...prev, ...newHighlights]);
      }
      
      if (step.drawings && step.drawings.length > 0) {
        setCurrentDrawings(prev => [...prev, ...step.drawings!]);
      }
      
      const cleanSpokenText = step.spokenText ? step.spokenText.replace(/^[\/\/#*]+\s*/, '').trim() : '';
      
      if (usePolly && audioRef.current && cleanSpokenText !== '') {
        setStepSpeakingComplete(false);
        const textToType = step.whiteboardText || "";
        
        if (pollyAudioUrl && audioRef.current.src !== pollyAudioUrl) {
          audioRef.current.src = pollyAudioUrl;
        }

        const wordCount = cleanSpokenText.split(' ').length;
        const estimatedDurationMs = (wordCount / 2.5) * 1000;
        setExpectedDuration(estimatedDurationMs);
        
        const charsToWrite = Math.max(1, textToType.length);
        const calculatedSpeed = (estimatedDurationMs * 0.95) / charsToWrite;
        const speed = Math.min(150, Math.max(30, calculatedSpeed * 0.8));
        setTypingSpeed(speed);
        
        setTimeout(() => {
          setStepSpeakingComplete(true);
        }, estimatedDurationMs);
        
        return;
      }

      if ('speechSynthesis' in window && cleanSpokenText !== '') {
        const utterance = new SpeechSynthesisUtterance(cleanSpokenText);
        globalUtterance = utterance;
        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang.startsWith('en-') && !v.localService) || 
                             voices.find(v => v.lang.startsWith('en-')) || 
                             voices[0];
        if (englishVoice) utterance.voice = englishVoice;
        
        utterance.onend = () => setStepSpeakingComplete(true);
        utterance.onerror = () => setStepSpeakingComplete(true);
        
        const wordCount = cleanSpokenText.split(' ').length;
        const estimatedDurationMs = (wordCount / 2.5) * 1000;
        setExpectedDuration(estimatedDurationMs);
        
        const charsToWrite = Math.max(1, step.whiteboardText.length);
        const calculatedSpeed = (estimatedDurationMs * 0.95) / charsToWrite;
        const adjustedSpeed = calculatedSpeed * 0.8;
        const speed = Math.min(150, Math.max(30, adjustedSpeed));
        setTypingSpeed(speed);
        
        window.speechSynthesis.speak(utterance);
      } else {
        setStepSpeakingComplete(true);
        setTypingSpeed(10);
        setExpectedDuration(100);
      }
    }
  }, [currentStepIndex, steps, startedStepIndex]);

  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSendMessage = async (query: string, image?: string) => {
    if (!query.trim() && !image) return;
    
    const lowerQuery = query.toLowerCase().trim();
    if (lowerQuery === 'stop' || lowerQuery === 'cancel' || lowerQuery === 'stop talking') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setStepSpeakingComplete(true);
      setStepWritingComplete(true);
      setIsProcessing(false);
      setIsWriting(false);
      setSteps([]);
      return;
    }
    
    setMessages(prev => [...prev, { role: 'user', text: query, image }]);
    
    setIsProcessing(true);
    setIsWriting(false);
    setSteps([]);
    setCurrentStepIndex(-1);
    setStartedStepIndex(-1);
    executingStepRef.current = -1;
    setCurrentHighlight("");
    
    // Play a "thinking" voice instead of showing a loading screen
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const thinkingPhrases = [
        "Hmm, let me think about that...",
        "Give me a moment to prepare the board...",
        "Let me pull up that information for you...",
        "I'm processing your request, just a second...",
        "Let me analyze that...",
        "Wait a sec, I'm looking into it...",
        "Just a moment while I figure this out..."
      ];
      const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
      const utterance = new SpeechSynthesisUtterance(phrase);
      
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
      if (preferredVoice) utterance.voice = preferredVoice;
      
      window.speechSynthesis.speak(utterance);
    }
    
    if (image) {
      setCurrentImage(image);
      keepImageRef.current = true;
    } else {
      keepImageRef.current = false;
    }
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (useAWS) {
      try {
        const enhancedQuery = query + "\n\n(System Instruction: If the user asks to 'explain' or 'brief' a topic, you MUST use the whiteboard mode and write the explanation on the board. Do NOT just speak the answer.)";
        const awsData = await generateAWSResponse(enhancedQuery, image || null);
        
        if (awsData && !awsData.fallback) {
          setMessages(prev => [...prev, { role: 'ai', text: awsData.chatAction }]);
          setPresentationMode(awsData.mode as any);
          if (awsData.language && awsData.language !== 'none') {
            setCodeLanguage(awsData.language);
          }
          clearBoardRef.current = awsData.clearBoard;
          
          const processedSteps = awsData.steps.map(step => ({
            ...step,
            drawings: typeof step.drawings === 'string' ? JSON.parse(step.drawings) : step.drawings
          }));

          setSteps(processedSteps);

          if (awsData.audioUrl) {
            setUsePolly(true);
            setPollyAudioUrl(awsData.audioUrl);
            
            const audio = new Audio(awsData.audioUrl);
            audioRef.current = audio;
            
            audio.onended = () => {
              setUsePolly(false);
            };

            audio.play().catch(err => {
              console.error("Polly Playback Error:", err);
              setUsePolly(false);
            });
          } else {
            setUsePolly(false);
          }

          const responseSummary = awsData.steps.map(s => s.spokenText).join(' ');
          const historyItem = {
            timestamp: new Date().toLocaleTimeString(),
            query: query,
            response: responseSummary.substring(0, 100) + (responseSummary.length > 100 ? '...' : '')
          };
          setSessionHistory(prev => [...prev, historyItem]);
          
          fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyItem)
          }).catch(err => console.error("Error saving history:", err));

          setIsProcessing(false);
          return;
        }
      } catch (err) {
        console.error("AWS Enterprise Error, falling back to local Gemini:", err);
      }
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let selectedModel = "gemini-2.5-flash"; // Default for lesson contents
      
      const confirmationKeywords = ["yes", "yeah", "sure", "okay", "go ahead", "please", "do it", "write", "draw", "code"];
      const isConfirmation = confirmationKeywords.some(k => query.toLowerCase().includes(k));
      
      const diagramKeywords = ["explain", "how", "why", "what is", "solve", "code", "program", "draw", "diagram", "sketch", "graph", "figure", "visual", "board", "whiteboard"];
      const needsDiagram = diagramKeywords.some(k => query.toLowerCase().includes(k));

      if (needsDiagram || image || (awaitingConfirmation && isConfirmation)) {
         selectedModel = "gemini-3-flash-preview"; // Use for diagrams
      }
      
      console.log(`Using model: ${selectedModel}`);
      
      const parts: any[] = [
        {
          text: `Current text on the board:
\`\`\`
${whiteboardText}
\`\`\`

Conversation History:
${messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n')}

The user asks: "${query}". 
${image ? "The user has also uploaded an image which is now displayed on the whiteboard." : ""}`
        }
      ];

      if (image) {
        const base64Data = image.split(',')[1];
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data
          }
        });
      }

      const config: any = {
        systemInstruction: SYSTEM_PROMPT,
      };

      if (selectedModel.includes("gemini-3")) {
        config.thinkingConfig = {
          thinkingLevel: selectedModel.includes("pro") ? ThinkingLevel.HIGH : ThinkingLevel.LOW
        };
      }

      const responseStream = await ai.models.generateContentStream({
        model: selectedModel,
        contents: [{ role: 'user', parts: parts }],
        config: config
      });
      
      let fullText = "";
      let chatActionParsed = false;
      let modeParsed = false;
      let languageParsed = false;
      let clearBoardParsed = false;
      
      setAwaitingConfirmation(false);
      
      const parseStep = (block: string) => {
        const spokenMatch = block.match(/SPOKEN:[ \t]*\n?(.*?)(?=WRITTEN:|DRAW:|HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
        const writtenMatch = block.match(/WRITTEN:[ \t]*\n?(.*?)(?=DRAW:|HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
        const drawMatch = block.match(/DRAW:[ \t]*\n?(.*?)(?=HIGHLIGHT:|PERMANENT_HIGHLIGHT:|$)/s);
        const highlightMatch = block.match(/HIGHLIGHT:[ \t]*\n?(.*?)(?=PERMANENT_HIGHLIGHT:|$)/s);
        const permHighlightMatch = block.match(/PERMANENT_HIGHLIGHT:[ \t]*\n?(.*?)$/s);
        
        if (!spokenMatch) return null;

        let drawings: Drawing[] = [];
        if (drawMatch && drawMatch[1].trim()) {
          try {
            drawings = JSON.parse(drawMatch[1].trim());
          } catch (e) {}
        }

        return {
          spokenText: spokenMatch[1].trim(),
          whiteboardText: writtenMatch ? writtenMatch[1].replace(/\s+$/, '') : "",
          highlightText: highlightMatch ? highlightMatch[1].trim() : "",
          permanentHighlight: permHighlightMatch ? permHighlightMatch[1].trim() : "",
          drawings
        };
      };

      for await (const chunk of responseStream) {
        fullText += chunk.text;
        
        if (!chatActionParsed) {
          const actionMatch = fullText.match(/CHAT_ACTION:\s*(.*?)(?=\n|$)/i);
          if (actionMatch) {
            const action = actionMatch[1].trim();
            setMessages(prev => [...prev, { role: 'ai', text: action }]);
            chatActionParsed = true;
          }
        }

        if (!modeParsed) {
          const modeMatch = fullText.match(/MODE:\s*(whiteboard|code)/i);
          if (modeMatch) {
            setPresentationMode(modeMatch[1].toLowerCase() as 'whiteboard' | 'code');
            modeParsed = true;
          }
        }

        if (!languageParsed) {
          const langMatch = fullText.match(/LANGUAGE:\s*([a-zA-Z0-9_-]+)/i);
          if (langMatch) {
            const lang = langMatch[1].toLowerCase();
            if (lang !== 'none') {
              setCodeLanguage(lang);
            }
            languageParsed = true;
          }
        }

        if (!clearBoardParsed) {
          const clearMatch = fullText.match(/CLEAR_BOARD:\s*(true|false)/i);
          if (clearMatch) {
            clearBoardRef.current = clearMatch[1].toLowerCase() === 'true';
            clearBoardParsed = true;
          }
        }
        
        const stepBlocks = fullText.split('===STEP===');
        if (stepBlocks.length > 1) {
          const completeSteps: any[] = [];
          for (let i = 1; i < stepBlocks.length - 1; i++) {
            const step = parseStep(stepBlocks[i].trim());
            if (step) completeSteps.push(step);
          }
          
          if (completeSteps.length > 0) {
            setSteps(completeSteps);
            setIsProcessing(false);
          }
        }
      }
      
      const finalStepBlocks = fullText.split('===STEP===');
      const finalSteps: any[] = [];
      for (let i = 1; i < finalStepBlocks.length; i++) {
        const step = parseStep(finalStepBlocks[i].trim());
        if (step) finalSteps.push(step);
      }
      
      if (finalSteps.length > 0) {
        setSteps(finalSteps);
        const lastStep = finalSteps[finalSteps.length - 1];
        if (lastStep.spokenText && (lastStep.spokenText.toLowerCase().includes("shall i write") || lastStep.spokenText.toLowerCase().includes("whiteboard"))) {
          setAwaitingConfirmation(true);
        }
        
        const responseSummary = finalSteps.map(s => s.spokenText).join(' ');
        const historyItem = {
          timestamp: new Date().toLocaleTimeString(),
          query: query,
          response: responseSummary.substring(0, 100) + (responseSummary.length > 100 ? '...' : '')
        };
        
        setSessionHistory(prev => [...prev, historyItem]);

        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyItem)
        }).catch(err => console.error("Error saving history:", err));
      }
      
      setIsProcessing(false);
      
    } catch (error) {
      console.error("Error generating response:", error);
      setSteps([{
        spokenText: "Sorry, an error occurred while processing your request.",
        whiteboardText: "Error."
      }]);
      setIsProcessing(false);
    }
  };

  handleSendMessageRef.current = handleSendMessage;

  const handleWritingComplete = () => {
    setStepWritingComplete(true);
  };

  const handleEndCall = async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      // Play ending voice message
      const utterance = new SpeechSynthesisUtterance("Class dismissed. Have a great day!");
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
      if (preferredVoice) utterance.voice = preferredVoice;
      window.speechSynthesis.speak(utterance);
    }
    
    const highestId = window.setTimeout(() => {}, 0);
    for (let i = 0; i < highestId; i++) {
      window.clearTimeout(i);
    }
    
    setStepSpeakingComplete(true);
    setStepWritingComplete(true);
    setIsProcessing(false);
    setIsWriting(false);
    setMicOn(false);
    
    setCallEnded(true);
  };

  const generatePDF = async () => {
    const element = document.getElementById('whiteboard-content');
    if (!element) return;
    
    setIsGeneratingPDF(true);
    try {
      const originalBg = element.style.backgroundColor;
      element.style.backgroundColor = '#ffffff';
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
           const clonedElement = clonedDoc.getElementById('whiteboard-content');
           if (clonedElement) {
             clonedElement.style.backgroundColor = '#ffffff';
             
             // Find all elements and replace oklch colors with standard hex
             // html2canvas fails when it encounters oklch in computed styles
             const allElements = clonedElement.querySelectorAll('*');
             allElements.forEach((el: any) => {
               if (el instanceof HTMLElement) {
                 // Force standard colors for the PDF capture
                 // This bypasses the oklch parsing issue in html2canvas
                 const style = window.getComputedStyle(el);
                 
                 // If color or bg is oklch, force to standard hex
                 if (style.color.includes('oklch')) {
                   el.style.color = '#1f2937'; // gray-800
                 }
                 if (style.backgroundColor.includes('oklch')) {
                   // Check if it's a highlight
                   if (el.className.includes('bg-yellow')) {
                     el.style.backgroundColor = '#fef08a';
                   } else if (el.className.includes('bg-green')) {
                     el.style.backgroundColor = '#bbf7d0';
                   } else {
                     el.style.backgroundColor = 'transparent';
                   }
                 }
                 // Remove any other oklch references in borders etc.
                 if (style.borderColor.includes('oklch')) {
                   el.style.borderColor = '#e5e7eb'; // gray-200
                 }
               }
             });
           }
        }
      });
      
      element.style.backgroundColor = originalBg;
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('class-notes.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF notes. Try taking a screenshot instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (callEnded) {
    return (
      <div className="h-screen w-full bg-[#202124] flex flex-col items-center justify-center font-sans">
        <h1 className="text-4xl text-white mb-8">You left the meeting</h1>
        <div className="flex flex-col gap-4 items-center">
          <div className="flex gap-4 mb-8">
             <button 
              onClick={generatePDF}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Class Notes (PDF)
            </button>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
            >
              Rejoin
            </button>
            <button 
              onClick={onEndSession} 
              className="px-6 py-2 bg-transparent hover:bg-[#3c4043] text-blue-400 rounded-md font-medium transition-colors"
            >
              Return to home screen
            </button>
          </div>
        </div>
        
        <div className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none">
           {(whiteboardText.length > 0) && (
              <Whiteboard 
                text={whiteboardText} 
                isWriting={false} 
                onWritingComplete={() => {}}
                typingSpeed={0}
                highlightText=""
                permanentHighlights={permanentHighlights}
                drawings={currentDrawings}
                image={currentImage}
              />
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#202124] flex flex-col font-sans overflow-hidden">
      <div className="flex-1 flex p-2 md:p-4 pb-0 overflow-hidden relative">
        <div className="flex-1 h-full relative flex flex-col md:flex-row gap-4">
          {presentationMode !== 'none' && (
            <div className="flex-[3] h-full relative transition-all duration-500 ease-in-out">
              {presentationMode === 'whiteboard' ? (
                <Whiteboard 
                  text={whiteboardText} 
                  isWriting={isWriting} 
                  onWritingComplete={handleWritingComplete}
                  typingSpeed={typingSpeed}
                  highlightText={currentHighlight}
                  permanentHighlights={permanentHighlights}
                  drawings={currentDrawings}
                  image={currentImage}
                />
              ) : (
                <CodeBoard 
                  text={whiteboardText} 
                  isWriting={isWriting} 
                  onWritingComplete={handleWritingComplete}
                  expectedDuration={expectedDuration}
                  highlightText={currentHighlight}
                  language={codeLanguage}
                />
              )}
            </div>
          )}
          
          <div className={`flex gap-4 transition-all duration-500 ease-in-out ${
            presentationMode !== 'none' 
              ? 'flex-row md:flex-col h-auto md:h-full flex-1 md:max-w-[300px]' 
              : 'flex-col md:flex-row flex-1 justify-center items-center'
          }`}>
            <div className={`relative bg-[#3c4043] rounded-xl overflow-hidden shadow-lg aspect-video flex-1 border border-gray-700 flex items-center justify-center ${
              presentationMode !== 'none' ? 'max-h-[150px] md:max-h-[50%]' : 'max-w-full md:max-w-2xl w-full'
            }`}>
              <div className={`w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center ${isProcessing || currentStepIndex >= 0 ? 'animate-pulse' : ''}`}>
                <MonitorUp size={40} className="text-white" />
              </div>
              <div className="absolute bottom-3 left-3 bg-black/50 px-2 py-1 rounded text-sm text-white">AI Teacher</div>
            </div>

            <div className={`relative bg-[#3c4043] rounded-xl overflow-hidden shadow-lg aspect-video flex-1 border border-gray-700 ${
              presentationMode !== 'none' ? 'max-h-[150px] md:max-h-[50%]' : 'max-w-full md:max-w-2xl w-full'
            }`}>
              {videoOn ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-gray-600 flex items-center justify-center">
                    <VideoOff size={32} className="text-gray-400" />
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 left-3 bg-black/50 px-2 py-1 rounded text-sm text-white">You</div>
            </div>
          </div>
          
          {ccOn && steps[currentStepIndex]?.spokenText && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-lg max-w-2xl text-center z-20 backdrop-blur-sm border border-white/10">
              {steps[currentStepIndex].spokenText}
            </div>
          )}
          
          
          {isGeneratingPDF && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md rounded-xl flex items-center justify-center z-50">
              <div className="bg-[#202124] border border-gray-700 px-6 py-3 rounded-full shadow-lg flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-white font-medium">Saving class notes...</span>
              </div>
            </div>
          )}
        </div>
        
        {isChatOpen && (
          <ChatPanel 
            onSendMessage={handleSendMessage} 
            onClose={() => setIsChatOpen(false)} 
            disabled={isProcessing || isWriting}
            messages={messages}
          />
        )}
      </div>
      
      <div className="h-auto min-h-20 w-full flex flex-wrap items-center justify-between px-4 py-3 gap-y-4">
        <div className="flex items-center gap-4 text-white w-full md:w-1/4 justify-center md:justify-start">
          <span className="text-lg font-medium">AI Classroom</span>
        </div>
        
        <div className="flex items-center gap-2 md:gap-3 w-full md:w-2/4 justify-center flex-wrap relative">
          <AudioVisualizer stream={stream} isListening={micOn} />
          <button 
            onClick={() => setUseAWS(!useAWS)}
            className={`p-3 rounded-full flex items-center gap-2 ${useAWS ? 'bg-[#FF9900] hover:bg-[#E68A00]' : 'bg-[#3c4043] hover:bg-[#4d5155]'} text-white transition-colors`}
            title={useAWS ? "Enterprise Mode (AWS Active)" : "Local Mode (AWS Disabled)"}
          >
            {useAWS ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            <span className="text-xs font-bold hidden lg:block">{useAWS ? 'CLOUD' : 'LOCAL'}</span>
          </button>
          <button 
            onClick={toggleMic}
            className={`p-3 rounded-full ${micOn ? (voiceStatus === 'reconnecting' ? 'bg-orange-500 animate-pulse' : 'bg-red-600 hover:bg-red-700 animate-pulse') : 'bg-[#3c4043] hover:bg-[#4d5155]'} text-white transition-colors relative`}
            title={micOn ? (voiceStatus === 'reconnecting' ? "Reconnecting Voice..." : "Stop Listening") : "Start Voice Control"}
          >
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={toggleVideo}
            className={`p-3 rounded-full ${videoOn ? 'bg-[#3c4043] hover:bg-[#4d5155]' : 'bg-[#ea4335] hover:bg-[#f25c50]'} text-white transition-colors`}
          >
            {videoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setCcOn(!ccOn)}
            className={`hidden sm:block p-3 rounded-full ${ccOn ? 'bg-blue-100 text-blue-600' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'} transition-colors`}
          >
            <ClosedCaption className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setHandRaised(!handRaised)}
            className={`hidden sm:block p-3 rounded-full ${handRaised ? 'bg-blue-100 text-blue-600' : 'bg-[#3c4043] hover:bg-[#4d5155] text-white'} transition-colors`}
          >
            <Hand className="w-5 h-5" />
          </button>

          <button 
            onClick={() => alert("Screen sharing is not supported in this demo.")}
            className="hidden md:block p-3 rounded-full bg-[#3c4043] hover:bg-[#4d5155] text-white transition-colors"
          >
            <MonitorUp className="w-5 h-5" />
          </button>
          <button className="hidden sm:block p-3 rounded-full bg-[#3c4043] hover:bg-[#4d5155] text-white transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
          <button 
            onClick={handleEndCall}
            className="p-3 rounded-full bg-[#ea4335] hover:bg-[#f25c50] text-white transition-colors px-6"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-1/4 justify-center md:justify-end">
          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2 rounded-full transition-colors ${isChatOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-[#3c4043] text-white'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          
          <button 
            onClick={generatePDF}
            disabled={isGeneratingPDF}
            className="p-2 rounded-full hover:bg-[#3c4043] text-white transition-colors"
            title="Download Class Notes (PDF)"
          >
            <Download className="w-5 h-5" />
          </button>
          
          <div className="relative group">
            <button className="p-2 rounded-full hover:bg-[#3c4043] text-white transition-colors">
              <Info className="w-5 h-5" />
            </button>
            <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-xl p-4 hidden group-hover:block z-50">
              <h3 className="font-bold text-gray-800 mb-2 border-b pb-1">Session History</h3>
              <div className="max-h-60 overflow-y-auto text-sm">
                {sessionHistory.length === 0 ? (
                  <p className="text-gray-500 italic">No interactions yet.</p>
                ) : (
                  sessionHistory.map((item, i) => (
                    <div key={i} className="mb-3 border-b border-gray-100 pb-2 last:border-0">
                      <div className="text-xs text-gray-400">{item.timestamp}</div>
                      <div className="font-medium text-blue-600 truncate">{item.query}</div>
                      <div className="text-gray-600 text-xs truncate">{item.response}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <button className="hidden lg:block p-2 rounded-full hover:bg-[#3c4043] text-white transition-colors">
            <Shapes className="w-5 h-5" />
          </button>
          <button className="hidden lg:block p-2 rounded-full hover:bg-[#3c4043] text-white transition-colors">
            <Lock className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
