import { useEffect, useRef, useState } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface CodeBoardProps {
  text: string;
  isWriting: boolean;
  onWritingComplete: () => void;
  expectedDuration: number;
  highlightText?: string;
  language?: string;
}

export default function CodeBoard({ text, isWriting, onWritingComplete, expectedDuration, highlightText, language = 'typescript' }: CodeBoardProps) {
  const [typingState, setTypingState] = useState({
    revealedChars: 0,
    wrongChars: '',
    isBackspacing: false
  });
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monaco = useMonaco();
  const decorationsRef = useRef<string[]>([]);
  const prevTextRef = useRef(text);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (text.length === 0) {
      setTypingState({ revealedChars: 0, wrongChars: '', isBackspacing: false });
    } else if (!isWriting) {
      setTypingState({ revealedChars: text.length, wrongChars: '', isBackspacing: false });
    } else if (isWriting) {
      if (!text.startsWith(prevTextRef.current)) {
        setTypingState({ revealedChars: 0, wrongChars: '', isBackspacing: false });
        startTimeRef.current = Date.now();
      } else if (text.length > prevTextRef.current.length) {
        startTimeRef.current = Date.now();
      }
    }
    prevTextRef.current = text;
  }, [text, isWriting]);

  useEffect(() => {
    if (!isWriting) {
      return;
    }
    
    if (typingState.revealedChars >= text.length) {
      // If text is already fully revealed, complete immediately
      // Use setTimeout to avoid render cycle issues
      const timer = setTimeout(onWritingComplete, 0);
      return () => clearTimeout(timer);
    }

    const elapsed = Date.now() - startTimeRef.current;
    const remainingTime = Math.max(0, expectedDuration - elapsed);
    const remainingChars = text.length - typingState.revealedChars;
    
    // Base delay to finish exactly on time
    let delay = remainingChars > 0 ? remainingTime / remainingChars : 50;
    
    const nextChar = text[typingState.revealedChars];
    
    if (typingState.isBackspacing) {
      delay = delay * 0.5;
    } else if (typingState.wrongChars === '') {
      if (['.', ',', ';', ':', '(', ')', '{', '}'].includes(nextChar)) {
        delay *= 2;
      } else if (nextChar === ' ') {
        delay *= 1.2;
      } else if (nextChar === '\n') {
        delay *= 2.5;
      } else {
        delay *= (0.8 + Math.random() * 0.4);
      }
    }

    // Cap delay to reasonable bounds
    delay = Math.min(400, Math.max(10, delay));

    const timer = setTimeout(() => {
      setTypingState(prev => {
        if (prev.isBackspacing) {
          if (prev.wrongChars.length > 0) {
            return { ...prev, wrongChars: prev.wrongChars.slice(0, -1) };
          } else {
            return { ...prev, isBackspacing: false };
          }
        } else {
          // 2% chance to make a typo, but not on whitespace and not at the very end
          if (Math.random() < 0.02 && !/\s/.test(nextChar) && prev.revealedChars < text.length - 1 && prev.wrongChars.length === 0) {
            const keyboard = "qwertyuiopasdfghjklzxcvbnm";
            const randomChar = keyboard[Math.floor(Math.random() * keyboard.length)];
            return { ...prev, wrongChars: randomChar, isBackspacing: true };
          } else {
            const next = prev.revealedChars + 1;
            if (next === text.length) {
              setTimeout(onWritingComplete, 0);
            }
            return { ...prev, revealedChars: next };
          }
        }
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [isWriting, typingState, text, expectedDuration, onWritingComplete]);

  const revealedText = text.substring(0, typingState.revealedChars) + typingState.wrongChars;

  useEffect(() => {
    if (editorRef.current && monaco) {
      const model = editorRef.current.getModel();
      if (model) {
        const position = model.getPositionAt(typingState.revealedChars + typingState.wrongChars.length);
        editorRef.current.setPosition(position);
        editorRef.current.revealPosition(position);
      }
    }
  }, [typingState.revealedChars, typingState.wrongChars.length, monaco]);

  useEffect(() => {
    if (!editorRef.current || !monaco) return;
    
    const editorInstance = editorRef.current;
    
    if (highlightText && typingState.revealedChars >= text.length) {
      const model = editorInstance.getModel();
      if (model) {
        const matches = model.findMatches(highlightText, false, false, false, null, true);
        if (matches.length > 0) {
          const match = matches[0];
          
          decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, [
            {
              range: match.range,
              options: {
                isWholeLine: false,
                className: 'monaco-highlight-line',
              }
            }
          ]);
          editorInstance.revealRangeInCenter(match.range);
        } else {
          decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, []);
        }
      }
    } else {
      decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, []);
    }
  }, [highlightText, typingState.revealedChars, text.length, monaco]);

  const getFilename = () => {
    switch (language) {
      case 'python': return 'script.py';
      case 'javascript': return 'script.js';
      case 'typescript': return 'script.ts';
      case 'html': return 'index.html';
      case 'css': return 'style.css';
      case 'c': return 'main.c';
      case 'cpp': return 'main.cpp';
      case 'java': return 'Main.java';
      default: return `script.${language}`;
    }
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-xl shadow-lg overflow-hidden flex flex-col border border-gray-700">
      <div className="bg-[#2d2d2d] px-4 py-2 flex items-center gap-2 border-b border-gray-700">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="ml-2 text-xs text-gray-400 font-mono">{getFilename()}</span>
      </div>
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={revealedText}
          onMount={(editor) => { editorRef.current = editor; }}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 16,
            wordWrap: 'on',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            cursorBlinking: isWriting ? 'solid' : 'blink',
            renderLineHighlight: 'none',
          }}
        />
      </div>
    </div>
  );
}
