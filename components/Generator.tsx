import React, { useState } from 'react';
import { Sparkles, Calendar, ArrowRight, Activity } from 'lucide-react';

interface GeneratorProps {
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
}

export const Generator: React.FC<GeneratorProps> = ({ onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onGenerate(prompt);
  };

  const suggestions = [
    "A 2-day tech hackathon in San Francisco for 100 developers",
    "A cozy 50th birthday dinner for family with Italian theme",
    "Corporate team building retreat in the mountains",
    "Product launch event for a new AI startup"
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-10 space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4">
             <div className="bg-indigo-100 p-2 rounded-lg mr-3">
               <Calendar className="w-6 h-6 text-indigo-600" />
             </div>
             <span className="text-lg font-bold text-slate-800">EventBuilder AI</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            Plan your next event in <span className="text-indigo-600">seconds</span>.
          </h1>
          <p className="text-lg text-slate-600 max-w-lg mx-auto">
            Describe your event idea, and our AI will generate a complete schedule, task list, budget, and strategy for you instantly.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-2 transform transition-all hover:scale-[1.01]">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              className="w-full h-32 md:h-40 p-6 text-lg bg-transparent border-none focus:ring-0 resize-none text-slate-800 placeholder-slate-300"
              placeholder="What are you planning? (e.g., 'A marketing conference for 300 people in New York next month...')"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
               {isLoading && (
                 <span className="text-sm text-indigo-600 font-medium animate-pulse flex items-center gap-2">
                   <Activity className="w-4 h-4 animate-spin" />
                   Thinking...
                 </span>
               )}
               <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
              >
                Generate Plan <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8">
          <p className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider text-center">Try these examples</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(suggestion)}
                disabled={isLoading}
                className="text-left p-4 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl text-slate-600 text-sm transition-all flex items-start gap-3 group"
              >
                <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 group-hover:text-indigo-600" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
