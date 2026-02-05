import React, { useState, useEffect, useRef } from 'react';
import { FlashcardData, getSectionStyle, Section, User } from '../types';
import { Icons } from '../constants';
import { transcribeAudio, evaluateAnswer, stopSpeech, checkBackend } from '../services/localService';

interface FlashcardProps {
  card: FlashcardData;
  isFlipped: boolean;
  onFlip: () => void;
  isVisualizing?: boolean;
  onRescan?: () => void;
  user?: User | null;
}

const Flashcard: React.FC<FlashcardProps> = ({ card, isFlipped, onFlip, isVisualizing, onRescan, user }) => {
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [aiFeedback, setAiFeedback] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [showOutline, setShowOutline] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transcriptionIntervalRef = useRef<number | null>(null);
  const lastTranscriptRef = useRef<string>("");
  const silenceTimerRef = useRef<number | null>(null);
  const userRequestedEvaluateRef = useRef<boolean>(false);

  const config = getSectionStyle(card.section);

  // Cleanup
  useEffect(() => {
    stopLiveSession();
    return () => stopLiveSession();
  }, [card.id]);

  const stopLiveSession = () => {
    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    
    // Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    
    // Stop audio analysis
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Clear timers
    if (transcriptionIntervalRef.current) {
      clearInterval(transcriptionIntervalRef.current);
      transcriptionIntervalRef.current = null;
    }
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    // Stop speech playback
    stopSpeech();
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsLiveActive(false);
    setAiFeedback("");
    setMicLevel(0);
    setIsProcessing(false);
    setIsTranscribing(false);
    setIsStarting(false);
    setTranscribeError("");
    setUserTranscript("");
    lastTranscriptRef.current = "";
    userRequestedEvaluateRef.current = false;
  };

  const analyzeAudioLevel = () => {
    if (!analyserRef.current || !audioContextRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    setMicLevel(average / 255);
    
    animationFrameRef.current = requestAnimationFrame(analyzeAudioLevel);
  };

  const processTranscript = async (transcript: string) => {
    if (!transcript || transcript.trim() === "") return;
    if (transcript === lastTranscriptRef.current) return;
    lastTranscriptRef.current = transcript;
    setIsProcessing(true);
    try {
      const evaluation = await evaluateAnswer(
        transcript.trim(),
        card.text,
        card.question,
        card.ip,
        card.section
      );
      setAiFeedback(evaluation.feedback);
    } catch (error) {
      console.error("Evaluation error:", error);
      const errorMessage = error instanceof Error ? error.message : "Evaluation failed. Please try again.";
      setAiFeedback(`Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const startLiveSession = async () => {
    if (isLiveActive || isStarting) {
      console.log("Already active or starting, ignoring click");
      return;
    }

    console.log("Starting live session...");
    setIsStarting(true);
    setTranscribeError("");
    try {
      console.log("Checking backend...");
      const backend = await checkBackend();
      if (!backend.ok) {
        const errorMsg = backend.message || "Backend not connected";
        console.error("Backend check failed:", errorMsg);
        setTranscribeError(errorMsg);
        alert(`Backend Error: ${errorMsg}`);
        setIsStarting(false);
        return;
      }
      console.log("Backend OK, requesting microphone...");
      // Request microphone access (no forced sampleRate for compatibility)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone access granted");
      
      micStreamRef.current = stream;
      
      // Create audio context for volume analysis
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      // Start volume analysis
      analyzeAudioLevel();
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/ogg';
      
      mimeTypeRef.current = mimeType;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        if (!userRequestedEvaluateRef.current) return;
        userRequestedEvaluateRef.current = false;
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(t => t.stop());
          micStreamRef.current = null;
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        setMicLevel(0);
        if (!chunks.length) return;
        const audioBlob = new Blob(chunks, { type: mimeTypeRef.current });
        if (audioBlob.size < 3000) return;
        try {
          setTranscribeError("");
          setIsTranscribing(true);
          const transcript = await transcribeAudio(audioBlob, user?.transcriptionLanguage);
          setUserTranscript(transcript || "");
          await processTranscript(transcript);
        } catch (error: unknown) {
          console.error("Transcription error:", error);
          const msg = error instanceof Error ? error.message : String(error);
          const isNetwork = msg.includes("fetch") || msg.includes("Failed") || msg.includes("Network");
          setTranscribeError(isNetwork ? "Cannot reach backend. Please run start.bat." : `Transcription failed: ${msg.slice(0, 50)}`);
        } finally {
          setIsTranscribing(false);
        }
      };
      
      mediaRecorder.start(250);
      setIsRecording(true);
      setIsLiveActive(true);
      setIsStarting(false);
      console.log("Live session started successfully");
      
    } catch (err) {
      console.error("Live Setup Failed:", err);
      const error = err as Error;
      const isPermissionError = error.name === "NotAllowedError" || 
                                error.name === "PermissionDeniedError" ||
                                error.message.toLowerCase().includes("permission") ||
                                error.message.toLowerCase().includes("not allowed");
      if (isPermissionError) {
        alert("Please grant microphone permission.");
      } else {
        setTranscribeError(`Setup failed: ${error.message || String(err)}`);
        alert(`Setup failed: ${error.message || String(err)}`);
      }
      setIsStarting(false);
      stopLiveSession();
    }
  };

  const isTaboo = card.section === Section.TABOO;

  return (
    <div className={`card-container relative w-full h-[65dvh] max-h-[720px] md:h-[520px] cursor-pointer ${isFlipped ? 'flipped' : ''}`} onClick={(e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      onFlip();
    }}>
      <div className="card-inner shadow-2xl">
        
        {/* FRONT */}
        <div className="card-front bg-[#1a1a1a] border border-white/10 flex flex-col p-6 md:p-8">
          <div className="flex justify-between items-center mb-4">
             <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${config.bg} ${config.color} border ${config.border}`}>
               {card.section}
             </span>
             <span className="text-white/30 text-[9px] font-bold uppercase tracking-widest">{card.ip}</span>
          </div>

          {/* Outline Button - positioned above the title */}
          {card.outline && (
            <div className="flex justify-center mb-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOutline(true);
                }}
                className="group flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-300 hover:text-indigo-200 transition-all duration-200"
                title="View document outline"
              >
                <Icons.Doc className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Outline</span>
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center text-center">
             {!isLiveActive && (
               <>
                 {card.image && !imageError ? (
                   <img src={card.image} onError={() => setImageError(true)} className="w-24 h-24 md:w-32 md:h-32 object-contain mb-4 rounded-2xl bg-black/20 p-2 animate-in zoom-in" />
                 ) : (
                   <div className="w-24 h-24 md:w-24 md:h-24 mb-4 rounded-2xl border border-white/5 bg-white/5 flex items-center justify-center">
                     <Icons.Doc className="opacity-20" />
                   </div>
                 )}
               </>
             )}

             <h2 className={`text-xl md:text-2xl font-black text-white px-4 transition-all duration-500 ${isLiveActive ? 'mt-[-1rem] opacity-30 text-sm' : 'mb-6'}`}>
               {card.question}
             </h2>
             
             {isLiveActive ? (
                <div className="w-full flex flex-col items-center gap-4 animate-in fade-in zoom-in h-full justify-start pt-4">
                   {/* Visual VU Meter */}
                   <div className="flex items-end gap-1 h-16 mb-2">
                      {[...Array(15)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-1.5 rounded-full transition-all duration-75 ${micLevel > 0.01 ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.5)]' : 'bg-white/10'}`}
                          style={{ 
                            height: `${10 + (micLevel * (50 + Math.random() * 200) * (1 - Math.abs(i-7)/10))}%`,
                            opacity: 0.3 + (micLevel * 2)
                          }}
                        ></div>
                      ))}
                   </div>

                   {/* Status + Feedback */}
                   <div className="w-full max-w-sm space-y-3">
                      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-left backdrop-blur-sm min-h-[60px]">
                         <p className="text-[8px] font-black uppercase text-white/30 tracking-widest mb-1 flex items-center gap-2">
                           <div className={`w-1.5 h-1.5 rounded-full ${micLevel > 0.05 ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`}></div>
                          Recording:
                         </p>
                         <p className="text-xs font-bold text-white/90 leading-relaxed italic">
                          {isRecording ? "Recording... Click “Stop & Evaluate” when finished." : (isTranscribing ? "Transcribing..." : "Waiting...")}
                         </p>
                         {transcribeError && (
                           <p className="text-[10px] text-amber-400 mt-2">{transcribeError}</p>
                         )}
                         {isTranscribing && (
                          <p className="text-[8px] text-white/50 mt-1">Recognizing speech...</p>
                         )}
                         {isProcessing && !isTranscribing && (
                          <p className="text-[8px] text-indigo-400 mt-2 animate-pulse">Evaluating...</p>
                         )}
                      </div>

                      {userTranscript !== "" && (
                        <div className="p-4 bg-white/5 border border-white/20 rounded-2xl text-left backdrop-blur-sm max-h-28 overflow-y-auto">
                           <p className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Your speech (sent to AI):</p>
                           <p className="text-xs font-bold text-white/90 leading-relaxed italic">&ldquo;{userTranscript}&rdquo;</p>
                        </div>
                      )}
                      {aiFeedback && (
                        <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-left animate-in slide-in-from-left-2 backdrop-blur-sm max-h-40 overflow-y-auto">
                           <p className="text-[8px] font-black uppercase text-indigo-400 tracking-widest mb-1">Tutor Feedback:</p>
                           <p className="text-xs font-black text-indigo-100 leading-relaxed">{aiFeedback}</p>
                        </div>
                      )}
                   </div>

                   <div className="mt-4 flex gap-3">
                     <button 
                       onClick={(e) => { 
                         e.stopPropagation(); 
                         if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                           userRequestedEvaluateRef.current = true;
                           mediaRecorderRef.current.stop();
                           setIsRecording(false);
                         }
                       }} 
                       disabled={!isRecording}
                       className="px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                      Stop & Evaluate
                     </button>
                     <button 
                       onClick={(e) => { e.stopPropagation(); stopLiveSession(); }} 
                       className="px-6 py-3 bg-red-500 text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl active:scale-95"
                     >
                      Exit Voice Mode
                     </button>
                   </div>
                </div>
             ) : (
                <div className="flex flex-col items-center gap-3">
                   {transcribeError && (
                     <p className="text-[10px] text-amber-400 text-center max-w-xs px-2">{transcribeError}</p>
                   )}
                   <button 
                     onClick={(e) => { 
                       e.stopPropagation(); 
                       console.log("Voice Evaluation button clicked");
                       startLiveSession(); 
                     }} 
                     disabled={isStarting}
                     className={`group relative px-12 py-5 bg-white text-black rounded-[2.5rem] flex items-center gap-4 transition-all hover:scale-105 active:scale-95 shadow-xl ${isStarting ? 'opacity-50 cursor-wait' : ''}`}
                   >
                      <Icons.Mic className={`w-6 h-6 ${isStarting ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-black uppercase tracking-[0.2em]">
                        {isStarting ? 'Starting...' : 'Voice Evaluation'}
                      </span>
                   </button>
                </div>
             )}
          </div>

          {!isLiveActive && <div className="mt-4 text-[9px] text-white/20 italic font-mono uppercase tracking-widest">[ Click to view the answer ]</div>}
        </div>

        {/* BACK */}
        <div className={`card-back bg-[#111] flex flex-col p-6 md:p-10 border-2 ${config.border} ${isTaboo ? 'taboo-active' : 'bg-grid'}`}>
          <div className="flex justify-between items-center mb-6">
            <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${config.color}`}>
              {isTaboo ? 'SYSTEM TABOO' : 'CORE FACT'}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onFlip(); }} className="text-white/20 hover:text-white p-2">✕</button>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <p className={`text-xl md:text-3xl leading-relaxed text-white font-black tracking-tight ${isTaboo ? 'text-red-500' : ''}`}>
              {card.text}
            </p>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 flex justify-center">
             <button onClick={(e) => { e.stopPropagation(); onFlip(); }} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Back to question</button>
          </div>
        </div>
      </div>

      {/* Outline Modal */}
      {showOutline && card.outline && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-black text-white uppercase tracking-widest">Document Outline</h2>
              <button
                onClick={() => setShowOutline(false)}
                className="text-white/40 hover:text-white p-2"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="prose prose-invert max-w-none">
                {card.outline.split('\n').map((line, index) => {
                  if (line.startsWith('# ')) {
                    return <h1 key={index} className="text-2xl font-black text-white mt-6 mb-4 first:mt-0">{line.slice(2)}</h1>;
                  }
                  if (line.startsWith('## ')) {
                    return <h2 key={index} className="text-xl font-bold text-indigo-400 mt-5 mb-3">{line.slice(3)}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={index} className="text-lg font-bold text-white/90 mt-4 mb-2">{line.slice(4)}</h3>;
                  }
                  if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                    return (
                      <div key={index} className="flex items-start gap-3 mb-2 ml-4">
                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0"></div>
                        <p className="text-white/70 leading-relaxed">{line.trim().slice(2)}</p>
                      </div>
                    );
                  }
                  if (line.trim() === '') {
                    return <div key={index} className="h-2"></div>;
                  }
                  return <p key={index} className="mb-2 text-white/60 leading-relaxed">{line}</p>;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Flashcard;
