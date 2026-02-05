
import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Generator } from './components/Generator';
import { SuperAdmin } from './components/SuperAdmin';
import { LandingPage } from './components/LandingPage';
import { AuthFlow } from './components/Auth/AuthFlow';
import { EventWizard } from './components/Wizard/EventWizard';
import { Modal, Button } from './components/UIComponents';
import { generateEvent, updateEvent, generateWebsiteCode } from './services/aiService';
import { saveEvent, getEvents, deleteEvent, checkServerHealth } from './services/storageService';
import { EventPlan, AppState, IntegrationConfig } from './types';
import { AlertCircle, Lock, RefreshCw, Power } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LANDING);
  const [eventPlan, setEventPlan] = useState<EventPlan | null>(null);
  const [savedEvents, setSavedEvents] = useState<EventPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);

  const [isGeneratingWebsite, setIsGeneratingWebsite] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  // Default Integration Config
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>({
    type: 'zoom',
  });

  const loadEvents = async () => {
    try {
      const events = await getEvents();
      events.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSavedEvents(events);
      setIsServerOffline(false);
    } catch (e) {
      console.error("Failed to load events", e);
      setIsServerOffline(true);
    }
  };

  // Load events when in IDLE state (Generator view)
  useEffect(() => {
    if (appState === AppState.IDLE) {
      loadEvents();
    }
  }, [appState]);

  // Polling mechanism to auto-connect when server comes online
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isServerOffline) {
      // Check immediately
      checkServerHealth().then(isHealthy => {
        if (isHealthy) loadEvents();
      });

      // Then poll every 2 seconds
      interval = setInterval(async () => {
        const isHealthy = await checkServerHealth();
        if (isHealthy) {
          loadEvents();
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isServerOffline]);

  // Magic Link Verification Handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      verifyToken(token);
    }
  }, []);

  const verifyToken = async (token: string) => {
    // Clear URL to prevent re-triggering on refresh
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      setAppState(AppState.AUTH); // Show auth screen (or loading state) briefly? 
      // Actually, better to show a loading overlay or just jump to onboarding

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Verified via Magic Link:", data.user);
        setAppState(AppState.ONBOARDING);
      } else {
        setError("Invalid or expired login link.");
        setAppState(AppState.LANDING);
      }
    } catch (e) {
      console.error(e);
      setError("Verification failed.");
      setAppState(AppState.LANDING);
    }
  };

  const handleGenerate = async (prompt: string, initialConfig?: IntegrationConfig) => {
    setAppState(AppState.GENERATING);
    setError(null);
    try {
      const plan = await generateEvent(prompt);

      // Merge initial configuration from wizard if present
      if (initialConfig) {
        plan.integrationConfig = initialConfig;
        setIntegrationConfig(initialConfig);
      }

      setEventPlan(plan);
      await saveEvent(plan); // Persist immediately
      setAppState(AppState.VIEWING);
    } catch (err) {
      console.error(err);
      setError("Failed to generate event plan. Please check your API key and try again.");
      setAppState(AppState.IDLE);
    }
  };

  const handleSelectEvent = (event: EventPlan) => {
    setEventPlan(event);
    // Restore integration config if it exists, otherwise default to Zoom
    if (event.integrationConfig) {
      setIntegrationConfig(event.integrationConfig);
    } else {
      setIntegrationConfig({ type: 'zoom' });
    }
    setAppState(AppState.VIEWING);
  };

  const handleDeleteEvent = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmationId) {
      await deleteEvent(deleteConfirmationId);
      await loadEvents(); // Reload list
      setDeleteConfirmationId(null);
    }
  };

  const handleUpdate = async (instruction: string) => {
    if (!eventPlan) return;
    setIsUpdating(true);
    try {
      const updatedPlan = await updateEvent(eventPlan, instruction);
      setEventPlan(updatedPlan);
      await saveEvent(updatedPlan); // Update persistence
    } catch (err) {
      console.error(err);
      alert("Could not update the event plan. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleManualUpdate = async (updatedPlan: EventPlan) => {
    setEventPlan(updatedPlan);
    await saveEvent(updatedPlan);
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
      await saveEvent(updatedPlan);
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

      {isServerOffline && (
        <div className="bg-slate-900 text-white px-4 py-3 text-center flex flex-col md:flex-row items-center justify-center gap-4 shadow-md relative z-50 border-b border-slate-800 transition-all duration-500">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-red-500 rounded-full absolute top-0 left-0 animate-ping"></div>
            </div>
            <p className="font-medium text-sm">Server Disconnected</p>
          </div>
          <p className="text-xs text-slate-400 hidden md:block">Waiting for backend connection...</p>
          <button
            onClick={loadEvents}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95"
          >
            <Power className="w-3 h-3" /> Connect to Server
          </button>
        </div>
      )}


      {appState === AppState.LANDING && (
        <LandingPage
          onGetStarted={() => setAppState(AppState.AUTH)}
          onLogin={() => setAppState(AppState.AUTH)}
        />
      )}

      {appState === AppState.AUTH && (
        <AuthFlow
          onComplete={(user) => {
            console.log("Logged in:", user);
            setAppState(AppState.ONBOARDING);
          }}
          onCancel={() => setAppState(AppState.LANDING)}
        />
      )}

      {appState === AppState.ONBOARDING && (
        <EventWizard
          onComplete={(data) => {
            // transform wizard data into a prompt
            const prompt = `
                 Title: ${data.title}
                 Topic/Description: ${data.description}
                 Attendees: ${data.attendees}
                 Presenters: ${data.presenters}
                 Type: ${data.eventType}
                 Platform: ${data.platformType}
                 Agenda: ${data.agendaText || 'Please generate a standard agenda'}
                 Registration Required: ${data.requiresRegistration}
               `;

            const newConfig: IntegrationConfig = {
              type: data.platformType as any,
              platformId: 'mock-id'
            };

            // Set integration config (for UI state)
            setIntegrationConfig(newConfig);

            handleGenerate(prompt, newConfig);
          }}
          onCancel={() => setAppState(AppState.LANDING)}
        />
      )}

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
          onManualUpdate={handleManualUpdate}
          isUpdating={isUpdating}
          onGenerateWebsite={handleGenerateWebsite}
          isGeneratingWebsite={isGeneratingWebsite}
          integrationConfig={integrationConfig}
          setIntegrationConfig={setIntegrationConfig}
          onExit={() => setAppState(AppState.IDLE)}
        />
      ) : appState === AppState.IDLE || appState === AppState.GENERATING ? (
        <>
          <Generator
            onGenerate={handleGenerate}
            isLoading={appState === AppState.GENERATING}
            savedEvents={savedEvents}
            onSelectEvent={handleSelectEvent}
            onDeleteEvent={handleDeleteEvent}
            isOffline={isServerOffline}
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
      ) : null}


      <Modal
        isOpen={!!deleteConfirmationId}
        onClose={() => setDeleteConfirmationId(null)}
        title="Delete Event"
      >
        <div className="space-y-6">
          <p className="text-slate-600">
            Are you sure you want to delete this event? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirmationId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete Event
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default App;