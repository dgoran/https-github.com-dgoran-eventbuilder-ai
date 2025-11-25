
import React, { useState, useEffect } from 'react';
import { EventPlan, IntegrationConfig } from '../types';
import { addRegistrant, getAdminSettings } from '../services/storageService';
import { 
  Calendar, 
  CheckSquare, 
  PieChart as PieChartIcon, 
  Clock, 
  Users, 
  MapPin, 
  Sparkles,
  Download,
  Share2,
  Edit3,
  Globe,
  Code,
  ExternalLink,
  Laptop,
  Video,
  Mail,
  Mic,
  MessageCircle,
  Hash
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface DashboardProps {
  eventPlan: EventPlan;
  onUpdate: (instruction: string) => void;
  isUpdating: boolean;
  onGenerateWebsite: () => void;
  isGeneratingWebsite: boolean;
  integrationConfig: IntegrationConfig;
  setIntegrationConfig: (config: IntegrationConfig) => void;
  onExit: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4'];

export const Dashboard: React.FC<DashboardProps> = ({ 
  eventPlan, 
  onUpdate, 
  isUpdating,
  onGenerateWebsite,
  isGeneratingWebsite,
  integrationConfig,
  setIntegrationConfig,
  onExit
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'agenda' | 'tasks' | 'budget' | 'website'>('overview');
  const [chatInput, setChatInput] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [lastRegistrant, setLastRegistrant] = useState<string | null>(null);

  // Listen for registration events from the iframe website
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'EVENT_REGISTRATION') {
        const { eventId, payload } = event.data;
        if (eventId === eventPlan.id) {
          console.log('Received registration via iframe:', payload);
          addRegistrant(eventId, payload);
          setLastRegistrant(payload.name);
          setTimeout(() => setLastRegistrant(null), 5000);

          // Handle External Integration Logic (Simulated Backend)
          if (integrationConfig.type === 'bigmarker' && integrationConfig.platformId) {
             const settings = getAdminSettings();
             if (settings.bigmarkerApiKey) {
                try {
                  console.log(`Attempting BigMarker Registration for ID: ${integrationConfig.platformId}`);
                  // BigMarker API: PUT https://www.bigmarker.com/api/v1/conferences/{id}/register
                  // Note: This call may fail due to CORS if the BigMarker API does not support client-side calls.
                  // In a real production app, this would route through a proxy.
                  const response = await fetch(`https://www.bigmarker.com/api/v1/conferences/${integrationConfig.platformId}/register`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'API-KEY': settings.bigmarkerApiKey
                    },
                    body: JSON.stringify({
                      email: payload.email,
                      first_name: payload.first_name,
                      last_name: payload.last_name
                    })
                  });
                  
                  const result = await response.json();
                  console.log('BigMarker API Response:', result);
                  if (response.ok) {
                    console.log('Successfully registered on BigMarker');
                  } else {
                    console.error('BigMarker API Error:', result);
                  }
                } catch (err) {
                  console.error('BigMarker Integration Error (Client-side/CORS):', err);
                }
             } else {
               console.warn("BigMarker API Key not found in Admin Settings");
             }
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [eventPlan.id, integrationConfig]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isUpdating) return;
    onUpdate(chatInput);
    setChatInput('');
  };

  const handleDownloadHtml = () => {
    if (!eventPlan.websiteHtml) return;
    const element = document.createElement("a");
    const file = new Blob([eventPlan.websiteHtml], {type: 'text/html'});
    element.href = URL.createObjectURL(file);
    element.download = `${eventPlan.title.replace(/\s+/g, '-').toLowerCase()}-webinar.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {/* Event Hero Image & Theme */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 col-span-1 md:col-span-2 lg:col-span-2 overflow-hidden relative group">
         <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10" />
         <img 
            src={`https://picsum.photos/seed/${eventPlan.imageKeyword || 'event'}/800/400`} 
            alt={eventPlan.theme}
            className="w-full h-48 md:h-64 object-cover transform group-hover:scale-105 transition-transform duration-700"
         />
         <div className="absolute bottom-0 left-0 p-6 z-20 text-white">
            <h3 className="text-sm font-medium uppercase tracking-wider text-indigo-300 mb-1">{eventPlan.theme}</h3>
            <p className="text-xl md:text-2xl font-bold leading-tight">"{eventPlan.marketingTagline}"</p>
         </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Expected Viewers</p>
            <p className="text-2xl font-bold text-slate-900">{eventPlan.estimatedAttendees}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Platform</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{eventPlan.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Live Date</p>
            <p className="text-lg font-bold text-slate-900">{eventPlan.date}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Mic className="w-5 h-5 text-indigo-500" />
          Featured Speakers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {eventPlan.speakers && eventPlan.speakers.map((speaker, idx) => (
             <div key={idx} className="flex items-center gap-4 p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                <img 
                  src={`https://i.pravatar.cc/150?u=${speaker.id}`} 
                  alt={speaker.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100"
                />
                <div>
                   <p className="font-bold text-slate-800 text-sm">{speaker.name}</p>
                   <p className="text-xs text-indigo-600">{speaker.role}</p>
                </div>
             </div>
          ))}
          {(!eventPlan.speakers || eventPlan.speakers.length === 0) && (
            <p className="text-slate-500 text-sm">No speakers listed yet.</p>
          )}
        </div>
      </div>
      
       <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Event Description</h3>
        <p className="text-slate-600 leading-relaxed">{eventPlan.description}</p>
      </div>
    </div>
  );

  const renderAgenda = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-800">Run of Show</h3>
        <span className="text-xs font-medium px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
          {eventPlan.agenda.length} Segments
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {eventPlan.agenda.map((item, index) => (
          <div key={index} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row gap-4">
             {/* Thumbnail for Agenda Item */}
             <div className="hidden md:block flex-shrink-0 w-24 h-24 bg-slate-200 rounded-lg overflow-hidden">
                <img 
                  src={`https://picsum.photos/seed/${item.imageKeyword || 'meeting'}/200/200`} 
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
             </div>

            <div className="md:w-32 flex-shrink-0 flex md:flex-col items-center md:items-start gap-2">
              <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                {item.time}
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {item.durationMinutes} min
              </span>
            </div>
            <div className="flex-grow">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-base font-semibold text-slate-800">{item.title}</h4>
                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider
                  ${item.type === 'break' ? 'bg-slate-100 text-slate-500' : 
                    item.type === 'keynote' ? 'bg-indigo-100 text-indigo-700' :
                    item.type === 'workshop' ? 'bg-emerald-100 text-emerald-700' :
                    item.type === 'networking' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'}`}>
                  {item.type}
                </span>
              </div>
              <p className="text-sm text-slate-600">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden animate-fadeIn">
       <div className="p-6 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800">Action Plan</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {eventPlan.tasks.map((task, index) => (
          <div key={index} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
              ${task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
              {task.status === 'completed' && <CheckSquare className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-grow">
              <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {task.title}
              </p>
            </div>
            <div className="flex items-center gap-2">
               <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full
                  ${task.priority === 'high' ? 'bg-red-50 text-red-600' : 
                    task.priority === 'medium' ? 'bg-orange-50 text-orange-600' :
                    'bg-green-50 text-green-600'}`}>
                  {task.priority}
               </span>
               <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                 {task.status}
               </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderBudget = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-6">Budget Breakdown</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={eventPlan.budget.items}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="amount"
              >
                {eventPlan.budget.items.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip 
                formatter={(value: number) => `${eventPlan.budget.currency}${value.toLocaleString()}`}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 text-center">
           <p className="text-sm text-slate-500">Total Estimated Cost</p>
           <p className="text-3xl font-bold text-slate-900">
             {eventPlan.budget.currency}{eventPlan.budget.totalBudget.toLocaleString()}
           </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Expense Details</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {eventPlan.budget.items.map((item, index) => (
            <div key={index} className="p-4 flex justify-between items-center hover:bg-slate-50">
              <div>
                <p className="font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500 uppercase">{item.category}</p>
              </div>
              <p className="font-mono font-medium text-slate-700">
                {eventPlan.budget.currency}{item.amount.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderWebsite = () => (
    <div className="space-y-6 animate-fadeIn h-full flex flex-col">
      {!eventPlan.websiteHtml ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 flex flex-col items-center justify-center flex-grow">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-6">
            <Laptop className="w-8 h-8" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Webinar Landing Page</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-8 text-center">
            Configure your registration method before generating the page.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
            <button 
              onClick={() => setIntegrationConfig({ ...integrationConfig, type: 'zoom' })}
              className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'zoom' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">Zoom</span>
              <span className="text-xs text-slate-500">API Integration</span>
            </button>
            <button 
               onClick={() => setIntegrationConfig({ ...integrationConfig, type: 'bigmarker' })}
               className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'bigmarker' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">BigMarker</span>
              <span className="text-xs text-slate-500">API Integration</span>
            </button>
            <button 
               onClick={() => setIntegrationConfig({ ...integrationConfig, type: 'email' })}
               className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'email' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">No-Code / Email</span>
              <span className="text-xs text-slate-500">SMTP / SendGrid</span>
            </button>
          </div>

          {(integrationConfig.type === 'zoom' || integrationConfig.type === 'bigmarker') && (
            <div className="w-full max-w-md mb-8 animate-fadeIn">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {integrationConfig.type === 'zoom' ? 'Zoom Webinar ID' : 'BigMarker Conference ID'}
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={integrationConfig.platformId || ''}
                  onChange={(e) => setIntegrationConfig({...integrationConfig, platformId: e.target.value})}
                  placeholder="e.g., 123456789"
                  className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Make sure the API Key is set in SuperAdmin.
              </p>
            </div>
          )}

          <button 
            onClick={onGenerateWebsite}
            disabled={isGeneratingWebsite}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
          >
            {isGeneratingWebsite ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating Page...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Landing Page
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
             <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-800">Website Preview</h3>
                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {integrationConfig.type === 'email' ? 'Email Form' : `${integrationConfig.type} Integrated`}
                </span>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setShowCode(!showCode)}
                  className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <Code className="w-4 h-4" /> {showCode ? 'View Preview' : 'View Code'}
                </button>
                <button 
                   onClick={handleDownloadHtml}
                   className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" /> HTML
                </button>
                 <button 
                   onClick={() => {
                     const win = window.open();
                     if(win) {
                       win.document.write(eventPlan.websiteHtml || '');
                       win.document.close();
                     }
                   }}
                   className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Open New Tab
                </button>
             </div>
          </div>

          <div className="flex-grow bg-slate-100 rounded-xl border border-slate-200 overflow-hidden relative">
            {showCode ? (
              <textarea 
                readOnly 
                value={eventPlan.websiteHtml} 
                className="w-full h-full p-4 font-mono text-sm text-slate-800 bg-white resize-none focus:outline-none"
              />
            ) : (
              <iframe 
                srcDoc={eventPlan.websiteHtml} 
                title="Website Preview" 
                className="w-full h-full bg-white"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Toast Notification for Registration */}
      {lastRegistrant && (
        <div className="fixed top-20 right-8 bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-bounce-in">
          <CheckSquare className="w-5 h-5 text-white" />
          <div>
            <p className="font-bold text-sm">New Registration!</p>
            <p className="text-xs text-green-100">{lastRegistrant} has been saved to backend.</p>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col md:h-screen sticky top-0">
        <div className="p-6 border-b border-slate-800 cursor-pointer" onClick={onExit}>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            EventBuilder AI
          </h1>
          <p className="text-xs text-slate-400 mt-1">Webinar Edition</p>
        </div>
        
        <nav className="flex-grow p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Sparkles className="w-5 h-5" />
            Strategy
          </button>
          <button 
            onClick={() => setActiveTab('agenda')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'agenda' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Calendar className="w-5 h-5" />
            Run of Show
          </button>
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'tasks' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <CheckSquare className="w-5 h-5" />
            Tasks
          </button>
          <button 
            onClick={() => setActiveTab('budget')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'budget' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <PieChartIcon className="w-5 h-5" />
            Budget
          </button>
           <button 
            onClick={() => setActiveTab('website')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'website' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Globe className="w-5 h-5" />
            Landing Page
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
           <button onClick={onExit} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-md flex items-center justify-center gap-2 text-sm transition-colors mb-2">
              <ExternalLink className="w-4 h-4" /> Exit to Generator
            </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-6 flex justify-between items-center shadow-sm z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{eventPlan.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{eventPlan.date} • {eventPlan.location}</p>
          </div>
          <div className="hidden md:block">
            <div className="text-right">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Webinar Mode</p>
              <p className="text-xs text-slate-400">Gemini 2.5 Flash</p>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-auto p-6 md:p-8">
          <div className="max-w-5xl mx-auto h-full pb-24">
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'agenda' && renderAgenda()}
            {activeTab === 'tasks' && renderTasks()}
            {activeTab === 'budget' && renderBudget()}
            {activeTab === 'website' && renderWebsite()}
          </div>
        </div>

        {/* AI Command Bar (Sticky Bottom) - Hide on Website tab to avoid overlap if needed, or keep it */}
        {activeTab !== 'website' && (
          <div className="absolute bottom-6 left-0 md:left-64 right-0 px-6 flex justify-center pointer-events-none">
            <div className="bg-white p-2 rounded-2xl shadow-xl border border-indigo-100 w-full max-w-2xl pointer-events-auto flex items-center gap-2">
              <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
                 <Sparkles className="w-5 h-5" />
              </div>
              <form onSubmit={handleChatSubmit} className="flex-grow flex items-center">
                <input 
                  type="text" 
                  placeholder={isUpdating ? "AI is modifying your event plan..." : "Ask AI to change something (e.g., 'Add a Q&A session', 'Change to Zoom')"}
                  className="w-full bg-transparent border-none focus:ring-0 text-slate-700 placeholder-slate-400 text-sm md:text-base py-2"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isUpdating}
                />
                <button 
                  type="submit" 
                  disabled={isUpdating || !chatInput.trim()}
                  className="ml-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
                >
                  {isUpdating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Edit3 className="w-5 h-5" />}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
