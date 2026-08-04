// components/cutscene-player.tsx
"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { Keyboard, X, Minimize2, Maximize2 } from "lucide-react"
import { Cutscene } from "./cutscene-types"

function getEmbedUrl(url: string) {
  if (!url) return "";
  let embedUrl = url;
  if (url.includes("youtube.com/watch?v=")) {
    embedUrl = url.replace("watch?v=", "embed/");
    const ampersandPos = embedUrl.indexOf("&");
    if (ampersandPos !== -1) embedUrl = embedUrl.substring(0, ampersandPos);
  } else if (url.includes("youtu.be/")) {
    embedUrl = url.replace("youtu.be/", "youtube.com/embed/");
    const questionPos = embedUrl.indexOf("?");
    if (questionPos !== -1) embedUrl = embedUrl.substring(0, questionPos);
  }
  return embedUrl;
}

// 1. Som de digitação completamente removido
function TypewriterText({ text, isMinimized }: { text: string, isMinimized: boolean }) {
  const [displayed, setDisplayed] = useState("");
  
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 45); 
    
    return () => clearInterval(interval);
  }, [text]);

  return (
    <h2 className={`font-serif font-black text-white text-center leading-tight drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] px-6 mx-auto ${isMinimized ? 'text-lg line-clamp-3' : 'text-3xl md:text-5xl lg:text-6xl max-w-5xl'}`}>
      {displayed}
    </h2>
  );
}

interface CutscenePlayerProps {
  cutscene: Cutscene;
  sceneIndex: number;
  isGm: boolean;
  onSyncScene: (idx: number) => void;
  onClose: () => void;
}

export function CutscenePlayer({ cutscene, sceneIndex, isGm, onSyncScene, onClose }: CutscenePlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const scene = cutscene.scenes[sceneIndex];

  // Listener global SOMENTE para o mestre
  useEffect(() => {
    if (!isGm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const key = parseInt(e.key);
      if (!isNaN(key) && key >= 1 && key <= 9) {
         const idx = key - 1;
         if (idx < cutscene.scenes.length) {
            onSyncScene(idx);
         }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGm, cutscene.scenes.length, onSyncScene]);

  if (!scene) return null;

  return (
    <>
      <AnimatePresence>
        {!isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] pointer-events-auto"
          />
        )}
      </AnimatePresence>

      <motion.div 
        layout
        key="cutscene-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        // 2. top-auto e left-auto garantem que o PIP não suma da tela
        className={`fixed z-[100] flex items-center justify-center overflow-hidden bg-black transition-colors ${
          isMinimized 
            ? "top-auto left-auto bottom-6 right-6 w-[320px] h-[180px] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] border-2 border-white/20 cursor-pointer hover:border-primary/50 group pointer-events-auto" 
            : "inset-0 md:inset-10 lg:inset-16 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.9)] border border-white/10 pointer-events-none"
        }`}
        onClick={() => {
          if (isMinimized) setIsMinimized(false);
        }}
      >
        <div className={`absolute inset-0 flex items-center justify-center ${!isMinimized ? 'pointer-events-auto' : ''}`}>
           {scene.type === 'text' && (
              <div className="w-full h-full flex items-center justify-center bg-black/50 p-4">
                 <TypewriterText text={scene.content} isMinimized={isMinimized} />
              </div>
           )}
           
           {scene.type === 'image' && (
              <Image src={scene.content} alt="Cutscene" fill className={isMinimized ? "object-cover" : "object-contain"} />
           )}

           {scene.type === 'video' && (
              <iframe
                src={`${getEmbedUrl(scene.content)}?autoplay=1&rel=0`}
                className={`w-full h-full border-0 ${isMinimized ? 'pointer-events-none' : ''}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
           )}
        </div>

        {isMinimized && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
             <Maximize2 className="text-white drop-shadow-md size-8" />
          </div>
        )}

        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6">
           <div className="flex justify-between items-start w-full">
              {!isMinimized && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }} 
                  className="bg-black/50 hover:bg-black/80 border border-white/10 text-white/70 hover:text-white p-2.5 rounded-full transition-colors backdrop-blur-md pointer-events-auto"
                  title="Minimizar (Para usar Enquetes/Ficha)"
                >
                  <Minimize2 className="size-5" />
                </button>
              )}
              {isMinimized && <div></div>}

              {isGm && !isMinimized && (
                 <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-xs text-white/70 font-mono flex items-center gap-2">
                      <Keyboard className="size-4" /> Teclas <strong className="text-primary">1 a {cutscene.scenes.length}</strong> = Cenas
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/50 rounded-full p-2.5 transition-colors shadow-lg">
                       <X className="size-5" />
                    </button>
                 </div>
              )}
              
              {isGm && isMinimized && (
                 <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="bg-red-500/50 hover:bg-red-500 text-white rounded-full p-1 transition-colors pointer-events-auto shadow-md">
                    <X className="size-4" />
                 </button>
              )}
           </div>

           {!isMinimized && (
             <div className="flex justify-center gap-2">
                {cutscene.scenes.map((_, i) => (
                   <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === sceneIndex ? 'w-8 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]' : 'w-2 bg-white/20'}`} />
                ))}
             </div>
           )}
        </div>
      </motion.div>
    </>
  )
}