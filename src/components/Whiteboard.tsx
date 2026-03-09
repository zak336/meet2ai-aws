import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface Drawing {
  type?: 'rect' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'text' | 'path';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text?: string;
  d?: string; // For raw paths
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fontSize?: number;
}

interface WhiteboardProps {
  text: string;
  isWriting: boolean;
  onWritingComplete: () => void;
  typingSpeed: number;
  highlightText?: string;
  permanentHighlights?: string[];
  drawings?: Drawing[];
  image?: string | null;
}

const AnimatedPath: React.FC<{ 
  d: string, 
  stroke?: string, 
  strokeWidth?: number, 
  fill?: string, 
  index: number,
  isVisible: boolean,
  onProgress: (point: {x: number, y: number} | null) => void,
  onComplete: () => void
}> = ({ d, stroke, strokeWidth, fill, index, isVisible, onProgress, onComplete }) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);
  const [offset, setOffset] = useState(0);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number | null>(null);
  const hasCompletedRef = useRef(false);

  // Natural easing for human-like movement
  const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
  const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

  useLayoutEffect(() => {
    if (pathRef.current) {
      try {
        // Force a reflow to ensure the path is rendered
        void pathRef.current.getBoundingClientRect();
        const len = pathRef.current.getTotalLength();
        if (len > 0) {
          setLength(len);
          setOffset(len); // Start hidden
          hasCompletedRef.current = false;
          startTimeRef.current = null;
        } else {
          // Fallback if length is 0 (e.g. not fully rendered yet)
          setTimeout(() => {
            if (pathRef.current) {
              const retryLen = pathRef.current.getTotalLength();
              setLength(retryLen > 0 ? retryLen : 1000);
              setOffset(retryLen > 0 ? retryLen : 1000);
              hasCompletedRef.current = false;
              startTimeRef.current = null;
            }
          }, 50);
        }
      } catch (e) {
        setLength(1000);
        setOffset(1000);
      }
    }
  }, [d]);

  useEffect(() => {
    if (!isVisible || !pathRef.current || length === 0) return;
    
    if (hasCompletedRef.current) {
      setOffset(0);
      return;
    }

    // Dynamic duration based on path length (longer paths take more time)
    // but with a minimum and maximum to keep it snappy
    const duration = Math.min(1200, Math.max(300, length * 2.5)); 
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      
      // Calculate raw progress
      const rawProgress = Math.min(elapsed / duration, 1);
      
      // Apply easing for natural acceleration/deceleration
      const easedProgress = easeInOutSine(rawProgress);
      
      const currentOffset = length * (1 - easedProgress);
      setOffset(currentOffset);
      
      // Calculate current point for pen
      try {
        if (pathRef.current) {
          const currentLength = length * easedProgress;
          // Ensure currentLength is within valid bounds
          const safeLength = Math.max(0, Math.min(currentLength, length));
          const point = pathRef.current.getPointAtLength(safeLength);
          
          if (point && !isNaN(point.x) && !isNaN(point.y)) {
            // Calculate instantaneous speed (derivative of easeInOutSine)
            // Speed factor is highest in the middle of the stroke
            const speedFactor = Math.sin(rawProgress * Math.PI);
            
            // Base jitter plus speed-dependent jitter
            // Faster movement = more jitter
            const baseJitter = 0.5;
            const speedJitter = speedFactor * 2.5;
            const jitterIntensity = baseJitter + speedJitter;
            
            // Add some high-frequency noise using timestamp
            const timeNoiseX = Math.sin(timestamp * 0.05) * 0.5;
            const timeNoiseY = Math.cos(timestamp * 0.07) * 0.5;
            
            const jitterX = (Math.random() - 0.5) * jitterIntensity + timeNoiseX;
            const jitterY = (Math.random() - 0.5) * jitterIntensity + timeNoiseY;
            
            onProgress({ 
              x: point.x + jitterX, 
              y: point.y + jitterY 
            });
          }
        }
      } catch (e) {
        // Ignore getPointAtLength errors
      }

      if (rawProgress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        hasCompletedRef.current = true;
        setOffset(0); // Ensure it's fully drawn
        onProgress(null); // Signal done with this path
        onComplete();
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isVisible, length, d, onProgress, onComplete]);

  return (
    <path
      ref={pathRef}
      d={d}
      stroke={stroke || "black"}
      strokeWidth={strokeWidth || 2}
      fill={fill || "none"}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        strokeDasharray: length || 1000,
        strokeDashoffset: offset,
        fillOpacity: hasCompletedRef.current ? 1 : 0,
        transition: hasCompletedRef.current ? 'fill-opacity 0.3s ease-out' : 'none'
      }}
    />
  );
};

// Component to render text with fade-in and scale animation
const AnimatedText: React.FC<{ x: number, y: number, text: string, fontSize?: number, fill?: string, isVisible: boolean, onComplete: () => void }> = ({ x, y, text, fontSize, fill, isVisible, onComplete }) => {
  return (
    <motion.text
      initial={{ opacity: 0, scale: 0.5, y: y + 10 }}
      animate={isVisible ? { opacity: 1, scale: 1, y: y } : { opacity: 0, scale: 0.5, y: y + 10 }}
      transition={{ duration: 0.4, ease: "backOut" }}
      x={x}
      y={y}
      fontSize={fontSize || 20}
      fill={fill || "black"}
      fontFamily="Virgil, 'Comic Sans MS', sans-serif"
      onAnimationComplete={() => {
        if (isVisible) onComplete();
      }}
    >
      {text}
    </motion.text>
  );
};

export default function Whiteboard({ text, isWriting, onWritingComplete, typingSpeed, highlightText, permanentHighlights = [], drawings = [], image }: WhiteboardProps) {
  const [revealedChars, setRevealedChars] = useState(0);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightSpansRef = useRef<(HTMLSpanElement | null)[]>([]);
  const permanentHighlightSpansRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [penPos, setPenPos] = useState({ x: 0, y: 0 });
  const prevTextRef = useRef(text);
  
  // State to hold generated paths
  const [generatedPaths, setGeneratedPaths] = useState<{d: string, stroke: string, strokeWidth: number, fill: string}[]>([]);
  const [textElements, setTextElements] = useState<Drawing[]>([]);
  const processedDrawingsRef = useRef<Drawing[]>([]);
  
  // Drawing sequence state
  const [currentDrawingIndex, setCurrentDrawingIndex] = useState(-1);
  const [isDrawingSVG, setIsDrawingSVG] = useState(false);
  const svgContainerRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (text.length === 0) {
      setRevealedChars(0);
    } else if (!isWriting) {
      setRevealedChars(text.length);
    } else if (isWriting) {
      if (!text.startsWith(prevTextRef.current)) {
        setRevealedChars(0);
      }
    }
    prevTextRef.current = text;
  }, [text, isWriting]);

  useEffect(() => {
    if (!isWriting) {
      return;
    }

    if (revealedChars >= text.length) {
      return;
    }

    const timer = setTimeout(() => {
      setRevealedChars(prev => prev + 1);
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [isWriting, revealedChars, text, typingSpeed]);

  useEffect(() => {
    if (!isWriting) return;
    
    const isTextDone = revealedChars >= text.length;
    const hasDrawings = generatedPaths.length + textElements.length > 0;
    const isDrawingDone = hasDrawings ? currentDrawingIndex >= generatedPaths.length + textElements.length : true;

    if (isTextDone && isDrawingDone) {
      const timer = setTimeout(onWritingComplete, 0);
      return () => clearTimeout(timer);
    }
  }, [isWriting, revealedChars, text, currentDrawingIndex, generatedPaths.length, textElements.length, onWritingComplete]);

  // Process drawings - Incremental update
  useEffect(() => {
    if (!drawings || drawings.length === 0) {
      setGeneratedPaths([]);
      setTextElements([]);
      setCurrentDrawingIndex(-1);
      setIsDrawingSVG(false);
      processedDrawingsRef.current = [];
      return;
    }

    // Check if we need to reset (board cleared)
    const isReset = drawings.length < processedDrawingsRef.current.length || 
                    !drawings.every((d, i) => i >= processedDrawingsRef.current.length || JSON.stringify(d) === JSON.stringify(processedDrawingsRef.current[i]));

    if (isReset) {
      setGeneratedPaths([]);
      setTextElements([]);
      setCurrentDrawingIndex(-1);
      setIsDrawingSVG(false);
      processedDrawingsRef.current = [];
    }

    const newDrawings = drawings.slice(processedDrawingsRef.current.length);
    if (newDrawings.length === 0) return;

    const addedPaths: {d: string, stroke: string, strokeWidth: number, fill: string}[] = [];
    const addedTexts: Drawing[] = [];

    newDrawings.forEach(d => {
      if (d.type === 'text') {
        addedTexts.push(d);
        return;
      }

      if (d.d) {
        addedPaths.push({
          d: d.d,
          stroke: d.stroke || 'black',
          strokeWidth: d.strokeWidth || 2,
          fill: d.fill || 'none'
        });
      } else {
        // Fallback for basic shapes if AI still sends them (convert to simple paths)
        let pathD = "";
        const x = d.x || 0;
        const y = d.y || 0;
        const w = d.width || 0;
        const h = d.height || 0;

        switch (d.type) {
          case 'rect':
            pathD = `M${x} ${y} L${x+w} ${y} L${x+w} ${y+h} L${x} ${y+h} Z`;
            break;
          case 'circle':
            const r = w / 2;
            pathD = `M ${x-r}, ${y} a ${r},${r} 0 1,0 ${w},0 a ${r},${r} 0 1,0 -${w},0`;
            break;
          case 'ellipse':
            const rx = w / 2;
            const ry = h / 2;
            pathD = `M ${x-rx}, ${y} a ${rx},${ry} 0 1,0 ${w},0 a ${rx},${ry} 0 1,0 -${w},0`;
            break;
          case 'line':
            pathD = `M${x} ${y} L${d.x2 || 0} ${d.y2 || 0}`;
            break;
          case 'arrow':
            const x2 = d.x2 || 0;
            const y2 = d.y2 || 0;
            const angle = Math.atan2(y2 - y, x2 - x);
            const headLen = 15;
            pathD = `M${x} ${y} L${x2} ${y2} M${x2} ${y2} L${x2 - headLen * Math.cos(angle - Math.PI / 6)} ${y2 - headLen * Math.sin(angle - Math.PI / 6)} M${x2} ${y2} L${x2 - headLen * Math.cos(angle + Math.PI / 6)} ${ headLen * Math.sin(angle + Math.PI / 6)}`;
            // Simplified arrow path
            pathD = `M${x} ${y} L${x2} ${y2} L${x2 - headLen * Math.cos(angle - Math.PI / 6)} ${y2 - headLen * Math.sin(angle - Math.PI / 6)} M${x2} ${y2} L${x2 - headLen * Math.cos(angle + Math.PI / 6)} ${y2 - headLen * Math.sin(angle + Math.PI / 6)}`;
            break;
        }

        if (pathD) {
          addedPaths.push({
            d: pathD,
            stroke: d.stroke || 'black',
            strokeWidth: d.strokeWidth || 2,
            fill: d.fill || 'none'
          });
        }
      }
    });

    setGeneratedPaths(prev => [...prev, ...addedPaths]);
    setTextElements(prev => [...prev, ...addedTexts]);
    processedDrawingsRef.current = [...drawings];
  }, [drawings]);

  useEffect(() => {
    const isTextDone = revealedChars >= text.length;
    const hasDrawings = generatedPaths.length + textElements.length > 0;
    
    if (isTextDone && hasDrawings) {
      if (currentDrawingIndex === -1) {
        setCurrentDrawingIndex(0);
        setIsDrawingSVG(true);
      } else if (currentDrawingIndex >= generatedPaths.length + textElements.length) {
        setIsDrawingSVG(false);
      } else {
        setIsDrawingSVG(true);
      }
    } else {
      setIsDrawingSVG(false);
    }
  }, [revealedChars, text, currentDrawingIndex, generatedPaths.length, textElements.length]);

  const rectsCacheRef = useRef<{svg: DOMRect, container: DOMRect, time: number} | null>(null);

  const handlePathProgress = (point: {x: number, y: number} | null) => {
    if (point && svgContainerRef.current && containerRef.current) {
      const now = performance.now();
      // Cache rects for 100ms to avoid layout thrashing during animation
      if (!rectsCacheRef.current || now - rectsCacheRef.current.time > 100) {
        rectsCacheRef.current = {
          svg: svgContainerRef.current.getBoundingClientRect(),
          container: containerRef.current.getBoundingClientRect(),
          time: now
        };
      }
      
      const { svg: svgRect, container: containerRect } = rectsCacheRef.current;
      
      const scaleX = svgRect.width / 800;
      const scaleY = svgRect.height / 600;
      
      const screenX = (point.x * scaleX) + (svgRect.left - containerRect.left);
      const screenY = (point.y * scaleY) + (svgRect.top - containerRect.top);
      
      setPenPos({ x: screenX, y: screenY });
    }
  };

  const handlePathComplete = () => {
    setCurrentDrawingIndex(prev => prev + 1);
  };

  useEffect(() => {
    // Priority 0: Follow SVG drawing
    if (isDrawingSVG) {
      return; // penPos is handled by handlePathProgress
    }

    // Priority 1: Hover over highlighted text
    if (highlightText && highlightSpansRef.current.length > 0 && containerRef.current) {
      const span = highlightSpansRef.current[0];
      if (span) {
        const spanRect = span.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        // Center of the highlighted word
        setPenPos({
          x: (spanRect.left - containerRect.left) + (spanRect.width / 2),
          y: (spanRect.top - containerRect.top) + (spanRect.height / 2)
        });
        return;
      }
    }
    
    // Priority 2: Follow writing cursor
    if (isWriting && cursorRef.current && containerRef.current) {
      const cursorRect = cursorRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      
      setPenPos({
        x: cursorRect.right - containerRect.left,
        y: cursorRect.bottom - containerRect.top - 4
      });
    }
  }, [revealedChars, isWriting, highlightText, text, isDrawingSVG]);

  // Camera follows pen
  useEffect(() => {
    if (!scrollRef.current || (!isWriting && !isDrawingSVG)) return;
    
    const scrollElement = scrollRef.current;
    const penY = penPos.y;
    const visibleTop = scrollElement.scrollTop;
    const visibleBottom = visibleTop + scrollElement.clientHeight;
    
    // Keep pen at least 150px away from top/bottom edges
    const padding = 150;
    
    if (penY > visibleBottom - padding) {
      scrollElement.scrollTop = penY - scrollElement.clientHeight + padding;
    } else if (penY < visibleTop + padding) {
      scrollElement.scrollTop = Math.max(0, penY - padding);
    }
  }, [penPos.y, isWriting, isDrawingSVG]);

  const revealedText = text.substring(0, revealedChars);

  const renderText = () => {
    // Combine highlightText and permanentHighlights for splitting
    const allHighlights = [...permanentHighlights, highlightText].filter(Boolean) as string[];
    
    if (allHighlights.length === 0) {
      return <span>{revealedText}</span>;
    }
    
    try {
      // Escape all highlight strings and filter out empty ones
      const escapedHighlights = allHighlights
        .filter(h => h.trim().length > 0)
        .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      
      if (escapedHighlights.length === 0) return revealedText;

      // Create a regex that matches any of the highlight strings
      const regex = new RegExp(`(${escapedHighlights.join('|')})`, 'g');
      
      const parts = revealedText.split(regex);
      
      // Reset refs arrays
      highlightSpansRef.current = [];
      permanentHighlightSpansRef.current = [];
      
      return parts.map((part, i) => {
        if (part === highlightText) {
          return (
            <motion.span 
              key={i} 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              ref={el => { if (el) highlightSpansRef.current.push(el); }}
              className="relative z-10 bg-yellow-200/50 rounded px-1 inline-block"
            >
              {part}
            </motion.span>
          );
        } else if (permanentHighlights.includes(part)) {
           return (
            <motion.span 
              key={i} 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              ref={el => { if (el) permanentHighlightSpansRef.current.push(el); }}
              className="relative z-10 bg-green-200/30 rounded px-1 border-b-2 border-green-400/50 inline-block"
            >
              {part}
            </motion.span>
          );
        }
        return (
          <span key={i}>
            {part}
          </span>
        );
      });
    } catch (e) {
      return revealedText;
    }
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl flex flex-col border-[16px] border-slate-300"
         style={{
           background: 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f8fafc 100%)',
           boxShadow: 'inset 0 0 40px rgba(0,0,0,0.04), 0 20px 40px rgba(0,0,0,0.15)'
         }}>
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ 
             backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`, 
             backgroundSize: '40px 40px' 
           }} 
      />
      
      <div className="flex-1 overflow-y-auto p-4 md:p-8" ref={scrollRef}>
        <div className="relative min-h-full" ref={containerRef} id="whiteboard-content">
          
          {/* Image Content */}
          {image && (
            <div className="mb-6 flex justify-center">
              <img 
                src={image} 
                alt="User uploaded content" 
                className="max-w-full max-h-[400px] object-contain rounded-lg shadow-sm border border-gray-200"
              />
            </div>
          )}

          {/* Text Content */}
          <div className="relative z-10 font-handwriting text-2xl md:text-3xl lg:text-4xl text-gray-800 whitespace-pre-wrap leading-relaxed">
            {renderText()}
            <span ref={cursorRef} className="inline-block w-[1px] h-[1em] bg-transparent align-bottom"></span>
          </div>
          
          {/* Drawings SVG Area */}
          {(generatedPaths.length > 0 || textElements.length > 0) && (
            <div className="relative z-10 w-full mt-8 aspect-[4/3] border-t-2 border-dashed border-gray-200 pt-4 h-[500px] flex items-center justify-center">
               <svg 
                 ref={svgContainerRef}
                 viewBox="0 0 800 600" 
                 className="w-full h-full"
                 style={{ maxWidth: '100%', maxHeight: '100%' }}
                 preserveAspectRatio="xMidYMid meet"
               >
                 {generatedPaths.map((d, i) => (
                   <AnimatedPath 
                     key={`path-${i}`} 
                     d={d.d} 
                     stroke={d.stroke} 
                     strokeWidth={d.strokeWidth} 
                     fill={d.fill} 
                     index={i}
                     isVisible={currentDrawingIndex >= i}
                     onProgress={currentDrawingIndex === i ? handlePathProgress : () => {}}
                     onComplete={currentDrawingIndex === i ? handlePathComplete : () => {}}
                   />
                 ))}
                 {textElements.map((t, i) => (
                   <AnimatedText
                     key={`text-${i}`}
                     x={t.x || 0}
                     y={t.y || 0}
                     text={t.text || ""}
                     fontSize={t.fontSize}
                     fill={t.fill}
                     isVisible={currentDrawingIndex >= generatedPaths.length + i}
                     onComplete={currentDrawingIndex === generatedPaths.length + i ? handlePathComplete : () => {}}
                   />
                 ))}
               </svg>
            </div>
          )}
          
          {/* Pen Cursor */}
          {((isWriting && revealedChars < text.length) || isDrawingSVG) && (
            <motion.div 
              className="absolute pointer-events-none z-50"
              animate={{ 
                x: penPos.x, 
                y: penPos.y,
                rotate: isWriting ? [-6, 6, -4, 4, 0] : isDrawingSVG ? [-2, 2, -2] : 0,
                scale: (isWriting || isDrawingSVG) ? [1, 0.92, 1] : 1
              }}
              transition={{ 
                x: isWriting ? { type: "spring", stiffness: 1200, damping: 40 } : { type: "spring", stiffness: 600, damping: 35, mass: 0.4 },
                y: isWriting ? { type: "spring", stiffness: 1200, damping: 40 } : { type: "spring", stiffness: 600, damping: 35, mass: 0.4 },
                rotate: isWriting ? { repeat: Infinity, duration: 0.12, ease: "linear" } : isDrawingSVG ? { repeat: Infinity, duration: 0.15, ease: "easeInOut" } : { duration: 0.2 },
                scale: (isWriting || isDrawingSVG) ? { repeat: Infinity, duration: 0.2, ease: "easeInOut" } : { duration: 0.2 }
              }}
              style={{ 
                left: 0,
                top: 0,
                transformOrigin: '0px 0px',
              }}
            >
              <div className="absolute bottom-0 left-0" style={{ transform: 'translate(-8px, 8px)' }}>
                <svg width="100" height="150" viewBox="-10 -140 100 150" className="overflow-visible drop-shadow-2xl">
                  <g transform="rotate(-15) translate(-2, -5)">
                    <path d="M 5 -15 L 20 0 L 70 -70 L 25 -10 Z" fill="rgba(0,0,0,0.15)" transform="translate(10, 15)" style={{ filter: 'blur(2px)' }}/>
                    <path d="M 0 0 L 12 -35 L 50 -120 L 80 -90 L 30 -12 Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2"/>
                    <path d="M 12 -35 L 30 -12 L 23 -2 L 5 -25 Z" fill="#1e293b" />
                    <path d="M 0 0 L 5 -25 L 23 -2 Z" fill="#0f172a" />
                    <path d="M 25 -30 L 60 -100" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.8"/>
                  </g>
                </svg>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fillIn {
          from { fill-opacity: 0; }
          to { fill-opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
