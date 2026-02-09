
import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { Generator } from './components/Generator';
import { SuperAdmin } from './components/SuperAdmin';
import { Modal, Button } from './components/UIComponents';
import { generateEvent, updateEvent, generateWebsiteCode } from './services/aiService';
import { saveEvent, getEvents, deleteEvent, checkServerHealth } from './services/storageService';
import { requestMagicLink, verifyMagicLink, getCurrentUser, logout, loginWithPassword, getOAuthProviders, startOAuthSignIn, checkEmailRegistration, AuthUser, OAuthProviderStatus } from './services/authService';
import { EventPlan, AppState, IntegrationConfig } from './types';
import { AlertCircle, Lock, RefreshCw, Power, LogOut } from 'lucide-react';

const generateLocalId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHtml = (value: string): string =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildDefaultWebsiteTemplate = (plan: EventPlan, integration: IntegrationConfig): string => {
  const title = escapeHtml(plan.title || 'Event Registration');
  const description = escapeHtml(plan.description || 'Register to join this event.');
  const date = escapeHtml(plan.date || 'Date TBD');
  const location = escapeHtml(plan.location || 'Online');
  const eventId = escapeHtml(plan.id || '');
  const isZoomLike = integration.type === 'zoom' || integration.type === 'bigmarker';

  const nameFields = isZoomLike
    ? `
      <label>First Name<input name="first_name" required /></label>
      <label>Last Name<input name="last_name" required /></label>
      <label>Email<input name="email" type="email" required /></label>
    `
    : `
      <label>Full Name<input name="name" required /></label>
      <label>Email<input name="email" type="email" required /></label>
    `;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; }
    .wrap { max-width: 920px; margin: 40px auto; padding: 0 16px; }
    .hero { background: linear-gradient(120deg, #0f172a, #1e293b); color: #fff; padding: 28px; border-radius: 16px; }
    .hero p { color: #cbd5e1; }
    .card { margin-top: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
    .meta { color: #475569; font-size: 14px; margin-bottom: 16px; }
    form { display: grid; gap: 12px; }
    label { font-size: 14px; color: #334155; display: grid; gap: 6px; }
    input, select, textarea { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; font-size: 14px; }
    button { border: 0; border-radius: 10px; padding: 12px 14px; background: #4f46e5; color: #fff; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>${title}</h1>
      <p>${description}</p>
    </section>
    <section class="card">
      <div class="meta">Date: ${date} | Location: ${location}</div>
      <form id="reg-form">
        ${nameFields}
        <button type="submit">Register</button>
      </form>
    </section>
  </main>
  <script>
    const form = document.getElementById('reg-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const payload = {
        ...data,
        name: data.name || [data.first_name || '', data.last_name || ''].join(' ').trim(),
        email: data.email || ''
      };
      if (window.parent) {
        window.parent.postMessage({
          type: 'EVENT_REGISTRATION',
          eventId: '${eventId}',
          payload
        }, '*');
      }
      alert('Registration submitted. Please wait for confirmation.');
    });
  </script>
</body>
</html>`;
};

const buildManualDraftPlan = (prompt: string, integration: IntegrationConfig): EventPlan => {
  const cleanedPrompt = String(prompt || '').trim();
  const titleCandidate = cleanedPrompt
    .split(/\n|\.|,|-/)[0]
    .trim()
    .slice(0, 90);
  const title = titleCandidate || 'Manual CME Event Draft';
  const now = Date.now();

  return {
    id: generateLocalId(),
    createdAt: now,
    title,
    description: cleanedPrompt || 'Fill in event description manually.',
    theme: 'Manual Draft',
    targetAudience: 'Healthcare professionals',
    estimatedAttendees: 100,
    date: new Date(now + (14 * 24 * 60 * 60 * 1000)).toLocaleDateString(),
    location:
      integration.type === 'zoom'
        ? 'Zoom'
        : integration.type === 'bigmarker'
          ? 'BigMarker'
          : integration.type === 'email'
            ? 'Email Registration'
            : 'Virtual Event',
    imageKeyword: 'conference',
    speakers: [],
    agenda: [],
    tasks: [],
    budget: {
      totalBudget: 0,
      currency: 'USD',
      items: []
    },
    marketingTagline: 'Build your meeting details manually',
    integrationConfig: integration
  };
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [eventPlan, setEventPlan] = useState<EventPlan | null>(null);
  const [savedEvents, setSavedEvents] = useState<EventPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatus[]>([]);

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

  const refreshAuth = async (): Promise<boolean> => {
    try {
      const user = await getCurrentUser();
      setAuthUser(user);
      return !!user;
    } catch (e) {
      setAuthUser(null);
      return false;
    }
  };

  const refreshOAuthProviders = async () => {
    try {
      const providers = await getOAuthProviders();
      setOauthProviders(providers);
    } catch (e) {
      setOauthProviders([]);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setIsAuthLoading(true);
      try {
        const currentPath = window.location.pathname;
        if (currentPath === '/auth/verify') {
          const params = new URLSearchParams(window.location.search);
          const token = params.get('token') || '';
          if (token) {
            await verifyMagicLink(token);
          }
          window.history.replaceState({}, document.title, '/');
        }
      } catch (err) {
        console.error('Magic link verification failed:', err);
      } finally {
        await refreshOAuthProviders();
        await refreshAuth();
        setIsAuthLoading(false);
      }
    };
    bootstrap();
  }, []);

  // Load events when in IDLE state (Generator view)
  useEffect(() => {
    if (authUser && appState === AppState.IDLE) {
      loadEvents();
    }
  }, [appState, authUser]);

  // Polling mechanism to auto-connect when server comes online
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (authUser && isServerOffline) {
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
  }, [isServerOffline, authUser]);

  const handleGenerate = async (prompt: string, context?: {
    integrationType?: 'zoom' | 'bigmarker' | 'email' | 'none';
    integrationPlatformId?: string;
    agendaSourceText?: string;
    brandPalette?: string[];
    uploadedDeckName?: string;
    uploadedFiles?: EventPlan['uploadedFiles'];
  }) => {
    if (!authUser) {
      setError('Please sign in to generate a meeting plan.');
      throw new Error('Not authenticated');
    }
    setAppState(AppState.GENERATING);
    setError(null);
    try {
      const plan = await generateEvent(prompt);
      const resolvedIntegration: IntegrationConfig = context?.integrationType
        ? {
          type: context.integrationType,
          platformId: context.integrationPlatformId || integrationConfig.platformId
        }
        : integrationConfig;
      const enrichedPlan: EventPlan = {
        ...plan,
        integrationConfig: resolvedIntegration,
        agendaSourceText: context?.agendaSourceText || plan.agendaSourceText,
        brandPalette: context?.brandPalette || plan.brandPalette,
        uploadedDeckName: context?.uploadedDeckName || plan.uploadedDeckName,
        uploadedFiles: context?.uploadedFiles || plan.uploadedFiles
      };

      let planToSave = enrichedPlan;
      try {
        const html = await generateWebsiteCode(enrichedPlan, resolvedIntegration);
        planToSave = { ...enrichedPlan, websiteHtml: html };
      } catch (websiteError) {
        console.error('Auto landing-page generation failed:', websiteError);
        planToSave = {
          ...enrichedPlan,
          websiteHtml: buildDefaultWebsiteTemplate(enrichedPlan, resolvedIntegration)
        };
      }

      setIntegrationConfig(resolvedIntegration);
      setEventPlan(planToSave);
      await saveEvent(planToSave); // Persist immediately
      setAppState(AppState.VIEWING);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to generate event plan';
      if (/unauthorized|not authenticated|session may have expired/i.test(message)) {
        await logout().catch(() => undefined);
        setAuthUser(null);
        setError('Your session expired. Please sign in again.');
      } else if (/quota|rate limit|resource exhausted|429/i.test(message)) {
        const resolvedIntegration: IntegrationConfig = context?.integrationType
          ? {
            type: context.integrationType,
            platformId: context.integrationPlatformId || integrationConfig.platformId
          }
          : integrationConfig;
        const draft = buildManualDraftPlan(prompt, resolvedIntegration);
        const manualPlan = {
          ...draft,
          websiteHtml: buildDefaultWebsiteTemplate(draft, resolvedIntegration)
        };
        setIntegrationConfig(resolvedIntegration);
        setEventPlan(manualPlan);
        await saveEvent(manualPlan);
        setError('Gemini quota/rate limit reached. Opened manual draft mode so you can continue without AI.');
        setAppState(AppState.VIEWING);
        return;
      } else {
        setError(message || "Failed to generate event plan. Please check your API key and try again.");
      }
      setAppState(AppState.IDLE);
      throw err instanceof Error ? err : new Error(String(err));
    }
  };

  const handleSessionExpired = () => {
    logout().catch(() => undefined);
    setAuthUser(null);
    setEventPlan(null);
    setSavedEvents([]);
    setAppState(AppState.IDLE);
    window.history.replaceState({}, document.title, '/');
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

  const handleGenerateWebsite = async (overrideConfig?: IntegrationConfig) => {
    if (!eventPlan) return;
    setIsGeneratingWebsite(true);
    try {
      const resolvedIntegration = overrideConfig || integrationConfig;
      // Pass integration config to website generator
      const html = await generateWebsiteCode(eventPlan, resolvedIntegration);

      const updatedPlan = {
        ...eventPlan,
        websiteHtml: html,
        integrationConfig: resolvedIntegration
      };

      if (overrideConfig) {
        setIntegrationConfig(resolvedIntegration);
      }
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

  const handleLogout = async () => {
    await logout();
    setAuthUser(null);
    setEventPlan(null);
    setSavedEvents([]);
    setAppState(AppState.IDLE);
    window.history.replaceState({}, document.title, '/');
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
      {authUser && (
        <div
          className={`fixed left-4 z-50 ${
            appState === AppState.VIEWING ? 'bottom-24 md:bottom-20' : 'bottom-4'
          }`}
        >
          <button
            onClick={handleLogout}
            className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-3 py-2 rounded-lg shadow-sm inline-flex items-center gap-2 text-sm"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      )}

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

      {isAuthLoading ? (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600">
          <div className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Checking session...
          </div>
        </div>
      ) : appState === AppState.ADMIN ? (
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
      ) : (
        <>
          <Generator
            key={authUser?.id || 'anonymous'}
            onGenerate={handleGenerate}
            onRequestMagicLink={requestMagicLink}
            onCheckEmailRegistration={checkEmailRegistration}
            onPasswordLogin={loginWithPassword}
            onRefreshAuth={refreshAuth}
            onStartOAuth={(providerId) => startOAuthSignIn(providerId, '/')}
            onSessionExpired={handleSessionExpired}
            isLoading={appState === AppState.GENERATING}
            isAuthenticated={!!authUser}
            currentUser={authUser}
            oauthProviders={oauthProviders}
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
      )}


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
