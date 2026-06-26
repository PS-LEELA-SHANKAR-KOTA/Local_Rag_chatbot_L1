import React, { useState, useEffect } from 'react';
import { Sparkles, FileText, MessageSquare, Search, ArrowRight, X } from 'lucide-react';

export const OnboardingModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const hasSeen = localStorage.getItem('has_seen_onboarding');
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('has_seen_onboarding', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const steps = [
    {
      title: "Welcome to Local AI Knowledge Studio",
      description: "Your 100% offline, secure, and private workspace for semantic search and generative AI.",
      icon: <Sparkles className="h-10 w-10 text-blue-400" />,
      content: "This studio uses local Llama and Qwen models to process your documents entirely on your machine. None of your data is ever sent to the cloud."
    },
    {
      title: "1. Create Workspaces",
      description: "Isolate your projects.",
      icon: <FileText className="h-10 w-10 text-amber-400" />,
      content: "Start by creating a Workspace from the sidebar. Workspaces keep your documents and chat histories completely separate (e.g., HR Docs vs Legal Contracts)."
    },
    {
      title: "2. Upload Documents",
      description: "Build your Knowledge Base.",
      icon: <FileText className="h-10 w-10 text-purple-400" />,
      content: "Upload PDFs, Word Docs, text files, or images. The system will automatically chunk the text and generate vector embeddings using Ollama."
    },
    {
      title: "3. Chat & Search",
      description: "Query your data with citations.",
      icon: <MessageSquare className="h-10 w-10 text-emerald-400" />,
      content: "Use the Chat Assistant to ask questions. The AI will read your documents and provide answers with exact page-level citations. You can also use the Search tab for quick lookups."
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 flex justify-end">
          <button 
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 flex flex-col items-center text-center space-y-4">
          <div className="p-4 rounded-full bg-white/5 border border-white/10 mb-2">
            {steps[currentStep].icon}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {steps[currentStep].title}
          </h2>
          <p className="text-sm text-muted-foreground font-semibold">
            {steps[currentStep].description}
          </p>
          <p className="text-sm text-muted-foreground/80 leading-relaxed mt-2 h-20">
            {steps[currentStep].content}
          </p>
        </div>

        {/* Footer / Controls */}
        <div className="p-4 bg-black/20 border-t border-border flex items-center justify-between">
          <div className="flex space-x-1.5 ml-4">
            {steps.map((_, idx) => (
              <div 
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep ? "w-4 bg-blue-500" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>
          <button
            onClick={nextStep}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            {currentStep === steps.length - 1 ? "Get Started" : "Next"}
            {currentStep < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
