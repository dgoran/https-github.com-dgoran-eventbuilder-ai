
import React, { useState, useEffect } from 'react';
import { Trash2, Save, Key, Layout, LogOut, Users, X, Check, Activity, AlertCircle, Wifi } from 'lucide-react';
import { EventPlan, AdminSettings, Registrant } from '../types';
import { getEvents, deleteEvent, getAdminSettings, saveAdminSettings } from '../services/storageService';

interface SuperAdminProps {
  onLogout: () => void;
  currentEventId?: string;
  onEventDeleted?: (id: string) => void;
}

export const SuperAdmin: React.FC<SuperAdminProps> = ({ onLogout, currentEventId, onEventDeleted }) => {
  const [events, setEvents] = useState<EventPlan[]>([]);
  const [settings, setSettings] = useState<AdminSettings>({
    zoomApiKey: '',
    bigmarkerApiKey: '',
    sendgridApiKey: '',
    smtpHost: ''
  });
  const [activeTab, setActiveTab] = useState<'events' | 'keys'>('events');
  const [selectedEventForRegistrants, setSelectedEventForRegistrants] = useState<EventPlan | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [isTestingBigMarker, setIsTestingBigMarker] = useState(false);

  useEffect(() => {
    loadData();
    checkServerStatus();
  }, []);

  const checkServerStatus = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch (e) {
      setServerStatus('offline');
    }
  };

  const loadData = () => {
    const loadedEvents = getEvents();
    // Sort by date created desc
    loadedEvents.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setEvents(loadedEvents);
    setSettings(getAdminSettings());
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const targetId = String(id).trim();

    if (!targetId) {
      alert("Error: Cannot delete event with invalid ID.");
      return;
    }

    if (window.confirm('Are you sure you want to permanently delete this event?')) {
      const success = deleteEvent(targetId);

      if (success) {
        // Optimistically remove from UI
        setEvents(prevEvents => prevEvents.filter(ev => String(ev.id).trim() !== targetId));
        
        // Notify parent if the currently active event was deleted
        if (currentEventId && String(currentEventId).trim() === targetId) {
          if (onEventDeleted) {
            onEventDeleted(targetId);
          }
        }
      } else {
        alert("Could not delete event. It may have already been removed. Reloading list...");
        loadData();
      }
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveAdminSettings(settings);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const handleTestBigMarker = async () => {
    if (!settings.bigmarkerApiKey) {
      alert("Please enter an API Key first.");
      return;
    }
    setIsTestingBigMarker(true);
    try {
      // Attempt to fetch conferences list (page 1, 1 item) as a lightweight auth test
      // We send the key in the header to override the stored one if the user changed it but hasn't saved
      // IMPORTANT: Do NOT send Content-Type: application/json for GET requests, some APIs reject it.
      const response = await fetch('/api/bigmarker/api/v1/conferences?page=1&per_page=1', {
        headers: { 
          'api-key': settings.bigmarkerApiKey.trim()
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Connection Successful! BigMarker API is responding.\n\nAccount seems valid.`);
        console.log("BigMarker Test Response:", data);
      } else {
        const errText = await response.text();
        let errMsg = errText;
        try {
           const jsonErr = JSON.parse(errText);
           errMsg = jsonErr.error || jsonErr.details || jsonErr.message || JSON.stringify(jsonErr);
        } catch (e) {} // use raw text if json parse fails
        
        alert(`Connection Failed (Status: ${response.status}).\n\nError: ${errMsg}`);
      }
    } catch (error: any) {
      alert(`Network Error: ${error.message}\n\nEnsure the backend server is running.`);
    } finally {
      setIsTestingBigMarker(false);
    }
  };

  const RegistrantsModal = () => {
    if (!selectedEventForRegistrants) return null;
    const list = selectedEventForRegistrants.registrants || [];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
             <div>
               <h3 className="text-xl font-bold text-slate-800">Event Registrants</h3>
               <p className="text-sm text-slate-500">{selectedEventForRegistrants.title}</p>
             </div>
             <button onClick={() => setSelectedEventForRegistrants(null)} className="text-slate-400 hover:text-slate-600">
               <X className="w-6 h-6" />
             </button>
          </div>
          <div className="p-6 overflow-y-auto">
            {list.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No registrants found for this event yet.</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-sm font-semibold text-slate-500">Name</th>
                    <th className="pb-3 text-sm font-semibold text-slate-500">Email</th>
                    <th className="pb-3 text-sm font-semibold text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {list.map((reg, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                       <td className="py-3 text-slate-800 font-medium">{reg.name}</td>
                       <td className="py-3 text-slate-600">{reg.email}</td>
                       <td className="py-3 text-slate-400 text-sm">{new Date(reg.registeredAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
             <span className="text-sm text-slate-500">Total: <strong>{list.length}</strong></span>
             <button onClick={() => setSelectedEventForRegistrants(null)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">Close</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex relative">
      <RegistrantsModal />
      
      {/* Toast Notification */}
      {showSuccessToast && (
        <div className="fixed top-6 right-6 z-[100] bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-bounce-in">
          <div className="bg-white/20 p-1 rounded-full">
            <Check className="w-5 h-5" />
          </div>
          <span className="font-bold">API Configuration Saved Successfully</span>
        </div>
      )}

      {/* Admin Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col h-screen sticky top-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-red-400">SuperAdmin</h1>
          <p className="text-xs text-slate-400 mt-1">Backend Management</p>
        </div>
        <nav className="flex-grow p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('events')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'events' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Layout className="w-5 h-5" /> Events Database
          </button>
          <button 
            onClick={() => setActiveTab('keys')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'keys' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Key className="w-5 h-5" /> API Integrations
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className={`flex items-center gap-2 mb-4 text-xs font-medium ${
            serverStatus === 'online' ? 'text-green-400' : 'text-red-400'
          }`}>
            {serverStatus === 'online' ? <Activity className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            Backend: {serverStatus === 'checking' ? 'Checking...' : (serverStatus === 'online' ? 'Online' : 'Offline')}
          </div>
          <button onClick={onLogout} className="w-full text-left px-4 py-2 text-slate-400 hover:text-white flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Exit Admin
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-grow p-8 overflow-auto h-screen">
        {activeTab === 'events' ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
               <h2 className="text-2xl font-bold text-slate-800">Managed Webinars</h2>
               <button 
                onClick={loadData}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
               >
                 Refresh List
               </button>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-semibold text-slate-600 text-sm w-1/3">Title</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Created</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Registrants</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm">Budget</th>
                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">No events found in database.</td>
                    </tr>
                  ) : events.map(event => (
                    <tr key={event.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">
                        <div className="truncate max-w-xs">{event.title}</div>
                      </td>
                      <td className="p-4 text-slate-500 text-sm">
                        {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : 'Unknown'}
                      </td>
                      <td className="p-4">
                         <button 
                          onClick={() => setSelectedEventForRegistrants(event)}
                          className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium text-sm bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors"
                         >
                            <Users className="w-4 h-4" />
                            {event.registrants ? event.registrants.length : 0}
                         </button>
                      </td>
                      <td className="p-4 text-slate-500 text-sm">{event.budget.currency}{event.budget.totalBudget.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <button 
                          type="button"
                          onClick={(e) => handleDelete(e, String(event.id))}
                          className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors inline-block cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">API & Integration Keys</h2>
            <form onSubmit={handleSaveSettings} className="space-y-6">
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-indigo-900 mb-4 flex items-center gap-2">
                  <Key className="w-5 h-5" /> Webinar Platforms
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zoom API Key / JWT</label>
                    <input 
                      type="password"
                      value={settings.zoomApiKey}
                      onChange={e => setSettings({...settings, zoomApiKey: e.target.value.trim()})}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="eyJhbGciOiJIUzI1NiJ9..."
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-slate-700">BigMarker API Key</label>
                      <button 
                        type="button"
                        onClick={handleTestBigMarker}
                        disabled={isTestingBigMarker}
                        className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 flex items-center gap-1 transition-colors"
                      >
                        {isTestingBigMarker ? (
                          <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                        ) : (
                          <Wifi className="w-3 h-3" />
                        )}
                        Test Connection
                      </button>
                    </div>
                    <input 
                      type="password"
                      value={settings.bigmarkerApiKey}
                      onChange={e => setSettings({...settings, bigmarkerApiKey: e.target.value.trim()})}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="bm_api_..."
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-semibold text-emerald-900 mb-4 flex items-center gap-2">
                   <Key className="w-5 h-5" /> Email & SMTP
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SendGrid API Key</label>
                    <input 
                      type="password"
                      value={settings.sendgridApiKey}
                      onChange={e => setSettings({...settings, sendgridApiKey: e.target.value.trim()})}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="SG.xxxxx..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host (Legacy)</label>
                    <input 
                      type="text"
                      value={settings.smtpHost}
                      onChange={e => setSettings({...settings, smtpHost: e.target.value.trim()})}
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      placeholder="smtp.example.com"
                    />
                  </div>
                </div>
              </div>
              
              <button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-200"
              >
                <Save className="w-5 h-5" /> Save Configuration
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
