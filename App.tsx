
import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Generator } from './components/Generator';
import { SuperAdmin } from './components/SuperAdmin';
import { generateEvent, updateEvent, generateWebsiteCode } from './services/aiService';
import { saveEvent } from './services/storageService';
import { EventPlan, AppState, IntegrationConfig } from './types';
import { AlertCircle, Lock } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [eventPlan, setEventPlan] = useState<EventPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingWebsite, setIsGeneratingWebsite] = useState(false);
  
  // Default Integration Config
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>({
    type: 'zoom',
  });

  const handleGenerate = async (prompt: string) => {
    setAppState(AppState.GENERATING);
    setError(null);
    try {
      const plan = await generateEvent(prompt);
      setEventPlan(plan);
      saveEvent(plan); // Persist immediately
      setAppState(AppState.VIEWING);
    } catch (err) {
      console.error(err);
      setError("Failed to generate event plan. Please check your API key and try again.");
      setAppState(AppState.IDLE);
    }
  };

  const handleUpdate = async (instruction: string) => {
    if (!eventPlan) return;
    setIsUpdating(true);
    try {
      const updatedPlan = await updateEvent(eventPlan, instruction);
      setEventPlan(updatedPlan);
      saveEvent(updatedPlan); // Update persistence
    } catch (err) {
      console.error(err);
      alert("Could not update the event plan. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGenerateWebsite = async () => {
    if (!eventPlan) return;
    setIsGeneratingWebsite(true);
    try {
      // Pass integration config to website generator
      const html = await generateWebsiteCode(eventPlan, integrationConfig);
      
      const updatedPlan = { 
        ...eventPlan, 
        websiteHtml: html,
        integrationConfig: integrationConfig 
      };
      
      setEventPlan(updatedPlan);
      saveEvent(updatedPlan);
    } catch (err) {
       console.error(err);
       alert("Could not generate website. Please try again.");
    } finally {
      setIsGeneratingWebsite(false);
    }
  };

  const toggleAdmin = () => {
    if (appState === AppState.ADMIN) {
      setAppState(AppState.IDLE);
    } else {
      setAppState(AppState.ADMIN);
    }
  };

  // Callback to handle deletion of the currently active event in Admin mode
  const handleCurrentEventDeleted = (id: string) => {
    if (eventPlan && String(eventPlan.id) === String(id)) {
      setEventPlan(null);
      // We don't force IDLE here immediately, we let the user exit Admin at their own pace,
      // but the background state is cleared so it doesn't resurrect.
    }
  };

  // Error Banner
  const ErrorBanner = () => (
    error ? (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-50 text-red-700 px-6 py-4 rounded-xl shadow-lg border border-red-200 flex items-center gap-3 animate-bounce-in">
        <AlertCircle className="w-5 h-5" />
        <p className="font-medium">{error}</p>
        <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 font-bold">&times;</button>
      </div>
    ) : null
  );

  return (
    <>
      <ErrorBanner />
      
      {appState === AppState.ADMIN ? (
        <SuperAdmin 
          onLogout={() => setAppState(AppState.IDLE)} 
          currentEventId={eventPlan?.id}
          onEventDeleted={handleCurrentEventDeleted}
        />
      ) : appState === AppState.VIEWING && eventPlan ? (
        <Dashboard 
          eventPlan={eventPlan} 
          onUpdate={handleUpdate}
          isUpdating={isUpdating}
          onGenerateWebsite={handleGenerateWebsite}
          isGeneratingWebsite={isGeneratingWebsite}
          integrationConfig={integrationConfig}
          setIntegrationConfig={setIntegrationConfig}
          onExit={() => setAppState(AppState.IDLE)}
        />
      ) : (
        <>
          <Generator 
            onGenerate={handleGenerate} 
            isLoading={appState === AppState.GENERATING} 
          />
          {/* Admin Toggle - Bottom Right */}
          <div className="fixed bottom-4 right-4 z-50">
             <button 
              onClick={toggleAdmin}
              className="bg-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white p-3 rounded-full shadow-lg transition-all"
              title="SuperAdmin Login"
             >
               <Lock className="w-4 h-4" />
             </button>
          </div>
        </>
      )}
    </>
  );
};

export default App;
