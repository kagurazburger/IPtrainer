
import React, { useState, useEffect, useMemo } from 'react';
import { FlashcardData, getSectionStyle } from '../types';
import { Icons } from '../constants';

interface MultipleChoiceProps {
  card: FlashcardData;
  allCards: FlashcardData[]; // Needed to generate distractors
  onNext: () => void;
  isVisualizing?: boolean;
}

const MultipleChoice: React.FC<MultipleChoiceProps> = ({ card, allCards, onNext, isVisualizing }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [imageError, setImageError] = useState(false);
  const config = getSectionStyle(card.section);

  // Generate options (1 correct + 3 distractors)
  useEffect(() => {
    // Reset state for new card
    setSelectedOption(null);
    setIsCorrect(null);
    setImageError(false);

    const generateOptions = () => {
      // Filter out current card answer
      const otherCards = allCards.filter(c => c.id !== card.id && c.text.trim() !== card.text.trim());
      
      // Shuffle other cards to get random distractors
      const shuffledOthers = [...otherCards].sort(() => 0.5 - Math.random());
      
      // Take up to 3 distractors
      const distractors = shuffledOthers.slice(0, 3).map(c => c.text);
      
      // Combine with correct answer
      const combined = [card.text, ...distractors];
      
      // Shuffle the final options so correct answer isn't always first
      return combined.sort(() => 0.5 - Math.random());
    };

    setOptions(generateOptions());
  }, [card, allCards]);

  const handleSelect = (option: string) => {
    if (selectedOption) return; // Prevent changing answer
    
    setSelectedOption(option);
    const correct = option === card.text;
    setIsCorrect(correct);

    // Auto advance if correct, or wait for manual advance if wrong (to read explanation)
    if (correct) {
      setTimeout(() => {
        onNext();
      }, 1000);
    }
  };

  return (
    <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Question Card */}
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 mb-6 shadow-2xl relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-1 h-full ${config.bg.replace('bg-', 'bg-opacity-100 ')}`}></div>
        
        <div className="flex justify-between items-start mb-6">
           <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${config.bg} ${config.color} border ${config.border}`}>
             {card.section}
           </span>
           <span className="text-white/30 text-[10px] mono font-bold uppercase tracking-widest">{card.ip}</span>
        </div>

        <div className="flex flex-col items-center text-center">
            {/* Image Box */}
            {card.image && !imageError ? (
               <div className="mb-6 rounded-xl overflow-hidden h-32 w-32 shadow-lg border border-white/10 bg-black/20 p-2">
                 <img 
                    src={card.image} 
                    onError={() => setImageError(true)}
                    className="w-full h-full object-contain" 
                    alt="Visual anchor" 
                 />
               </div>
             ) : (
               <div className="mb-6 h-32 w-32 rounded-xl bg-white/5 flex flex-col items-center justify-center border border-white/5 opacity-40 gap-2">
                 {isVisualizing ? (
                    <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin"></div>
                 ) : (
                    <>
                      <Icons.Doc />
                      <span className="text-[8px] font-mono uppercase tracking-widest">
                        {imageError ? 'Invalid Image' : 'No Anchor'}
                      </span>
                    </>
                 )}
               </div>
             )}

            <h2 className="text-2xl font-bold text-white mb-2">{card.question}</h2>
            {selectedOption && !isCorrect && (
              <p className="text-amber-400 text-sm italic mt-2 animate-in fade-in">Hint: {card.hint}</p>
            )}
        </div>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 gap-3">
        {options.map((option, idx) => {
          const isSelected = selectedOption === option;
          const isActuallyCorrect = option === card.text;
          
          let stateClass = "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";
          if (selectedOption) {
            if (isSelected && isCorrect) stateClass = "bg-emerald-500/20 border-emerald-500 text-emerald-200";
            else if (isSelected && !isCorrect) stateClass = "bg-red-500/20 border-red-500 text-red-200";
            else if (isActuallyCorrect && !isCorrect) stateClass = "bg-emerald-500/10 border-emerald-500/50 text-emerald-200/70"; // Show correct answer if user missed it
            else stateClass = "bg-black/40 border-transparent opacity-50";
          }

          return (
            <button
              key={idx}
              disabled={!!selectedOption}
              onClick={() => handleSelect(option)}
              className={`p-5 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden ${stateClass}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-mono ${isSelected || (selectedOption && isActuallyCorrect) ? 'border-current' : 'border-white/20 text-white/40'}`}>
                  {String.fromCharCode(65 + idx)}
                </div>
                <span className={`text-sm font-medium ${selectedOption ? '' : 'text-white/80 group-hover:text-white'}`}>
                  {option}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Continue Button */}
      {selectedOption && !isCorrect && (
         <div className="mt-6 flex justify-center animate-in fade-in slide-in-from-bottom-2">
            <button 
              onClick={onNext}
              className="px-8 py-3 bg-white text-black font-bold uppercase tracking-widest text-xs rounded-full hover:bg-white/90 transition-all"
            >
              Next Card
            </button>
         </div>
      )}
    </div>
  );
};

export default MultipleChoice;
