
import React, { useState, useEffect, useRef } from 'react';
import { EventPlan, IntegrationConfig, Speaker, FormField, AgendaItem, Task, EventBudget } from '../types';
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
  Hash,
  Upload,
  RefreshCw,
  Camera,
  Trash2,
  Plus,
  Save,
  X
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Button, Modal } from './UIComponents';

interface DashboardProps {
  eventPlan: EventPlan;
  onUpdate: (instruction: string) => void;
  onManualUpdate: (plan: EventPlan) => void;
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
  onManualUpdate,
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
  const [isSyncingFields, setIsSyncingFields] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingHtml, setIsEditingHtml] = useState(false);
  const [editedHtml, setEditedHtml] = useState(eventPlan.websiteHtml || '');
  const [showIntegrationSettings, setShowIntegrationSettings] = useState(false);

  // Refs for file inputs
  const headerInputRef = useRef<HTMLInputElement>(null);
  const speakerInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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

          // Relay registration to BigMarker if configured
          if (integrationConfig.type === 'bigmarker' && integrationConfig.platformId) {
            const settings = getAdminSettings();
            if (settings.bigmarkerApiKey) {
               try {
                  const fullName = payload.name || '';
                  const firstSpace = fullName.indexOf(' ');
                  const firstName = firstSpace === -1 ? fullName : fullName.substring(0, firstSpace);
                  const lastName = firstSpace === -1 ? '.' : fullName.substring(firstSpace + 1);
                  
                  // Filter payload for custom fields (exclude known keys)
                  const customFieldsPayload: Record<string, any> = {};
                  Object.keys(payload).forEach(key => {
                    if (!['name', 'email', 'first_name', 'last_name'].includes(key)) {
                        customFieldsPayload[key] = payload[key];
                    }
                  });

                  await fetch(`/api/bigmarker/api/v1/conferences/${integrationConfig.platformId}/register`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'API-KEY': settings.bigmarkerApiKey
                    },
                    body: JSON.stringify({
                      email: payload.email,
                      first_name: firstName,
                      last_name: lastName,
                      custom_fields: customFieldsPayload
                    })
                  });
                  console.log('Registered to BigMarker via Dashboard proxy');
               } catch (bmError) {
                 console.error('Failed to register to BigMarker via Dashboard:', bmError);
               }
            }
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [eventPlan.id, integrationConfig]);

  // Sync editedHtml when websiteHtml changes
  useEffect(() => {
    setEditedHtml(eventPlan.websiteHtml || '');
  }, [eventPlan.websiteHtml]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isUpdating) return;
    onUpdate(chatInput);
    setChatInput('');
  };

  // --- Manual Edit Handlers ---
  const handleOverviewChange = (field: keyof EventPlan, value: any) => {
    onManualUpdate({ ...eventPlan, [field]: value });
  };

  const handleAgendaChange = (index: number, field: keyof AgendaItem, value: any) => {
    const newAgenda = [...eventPlan.agenda];
    newAgenda[index] = { ...newAgenda[index], [field]: value };
    onManualUpdate({ ...eventPlan, agenda: newAgenda });
  };

  const addAgendaItem = () => {
    const newItem: AgendaItem = {
      id: Date.now().toString(),
      time: '12:00',
      title: 'New Session',
      description: 'Session description',
      durationMinutes: 30,
      type: 'other',
      imageKeyword: 'meeting'
    };
    onManualUpdate({ ...eventPlan, agenda: [...eventPlan.agenda, newItem] });
  };

  const removeAgendaItem = (index: number) => {
    const newAgenda = eventPlan.agenda.filter((_, i) => i !== index);
    onManualUpdate({ ...eventPlan, agenda: newAgenda });
  };

  const handleTaskChange = (index: number, field: keyof Task, value: any) => {
    const newTasks = [...eventPlan.tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    onManualUpdate({ ...eventPlan, tasks: newTasks });
  };

  const addTask = () => {
    const newTask: Task = {
      id: Date.now().toString(),
      title: 'New Task',
      status: 'pending',
      priority: 'medium'
    };
    onManualUpdate({ ...eventPlan, tasks: [...eventPlan.tasks, newTask] });
  };

  const removeTask = (index: number) => {
    const newTasks = eventPlan.tasks.filter((_, i) => i !== index);
    onManualUpdate({ ...eventPlan, tasks: newTasks });
  };

  const handleBudgetChange = (index: number, field: string, value: any) => {
    const newItems = [...eventPlan.budget.items];
    // @ts-ignore
    newItems[index] = { ...newItems[index], [field]: value };

    // Recalculate total
    const total = newItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    onManualUpdate({
      ...eventPlan,
      budget: {
        ...eventPlan.budget,
        items: newItems,
        totalBudget: total
      }
    });
  };

  const addBudgetItem = () => {
    const newItem = {
      category: 'General',
      amount: 0,
      label: 'New Expense'
    };
    const newItems = [...eventPlan.budget.items, newItem];
    onManualUpdate({
      ...eventPlan,
      budget: {
        ...eventPlan.budget,
        items: newItems
      }
    });
  };

  const removeBudgetItem = (index: number) => {
    const newItems = eventPlan.budget.items.filter((_, i) => i !== index);
    const total = newItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    onManualUpdate({
      ...eventPlan,
      budget: {
        ...eventPlan.budget,
        items: newItems,
        totalBudget: total
      }
    });
  };

  const handleSpeakerChange = (index: number, field: keyof Speaker, value: any) => {
    const newSpeakers = [...eventPlan.speakers];
    newSpeakers[index] = { ...newSpeakers[index], [field]: value };
    onManualUpdate({ ...eventPlan, speakers: newSpeakers });
  };

  const addSpeaker = () => {
    const newSpeaker: Speaker = {
      id: Date.now().toString(),
      name: 'New Speaker',
      role: 'Role',
      bio: 'Bio goes here.'
    };
    onManualUpdate({ ...eventPlan, speakers: [...eventPlan.speakers, newSpeaker] });
  };

  const removeSpeaker = (index: number) => {
    const newSpeakers = eventPlan.speakers.filter((_, i) => i !== index);
    onManualUpdate({ ...eventPlan, speakers: newSpeakers });
  };

  // --- Image Upload Handlers ---

  const handleHeaderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        onManualUpdate({ ...eventPlan, headerImageUrl: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSpeakerUpload = (e: React.ChangeEvent<HTMLInputElement>, speakerId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const updatedSpeakers = eventPlan.speakers.map(s =>
          s.id === speakerId ? { ...s, customImageUrl: base64String } : s
        );
        onManualUpdate({ ...eventPlan, speakers: updatedSpeakers });
      };
      reader.readAsDataURL(file);
    }
  };

  // --- BigMarker Field Sync ---

  const handleSyncBigMarkerFields = async () => {
    if (!integrationConfig.platformId) {
      alert("Please enter a Conference ID first.");
      return;
    }

    setIsSyncingFields(true);

    try {
      // Use the standard Conference Detail endpoint which typically contains the custom_fields array
      // Proxy path: /api/bigmarker/api/v1/conferences/{id} -> https://www.bigmarker.com/api/v1/conferences/{id}
      const response = await fetch(`/api/bigmarker/api/v1/conferences/${integrationConfig.platformId}`);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404 && errorText.includes("File not found")) {
             throw new Error(`BigMarker API error (404): Conference ID not found or proxy connection failed.`);
        }
        throw new Error(`BigMarker API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // BigMarker structure varies, but often fields are in 'custom_fields' array
      let rawFields = [];
      if (data && Array.isArray(data.custom_fields)) {
        rawFields = data.custom_fields;
      } else if (Array.isArray(data)) {
        // Fallback if endpoint returned array directly
        rawFields = data;
      }

      // Map BigMarker fields to our FormField format
      const customFields: FormField[] = rawFields.map((field: any) => {
        // Helper to map BigMarker field types to our types
        const mapFieldType = (type: string): 'text' | 'email' | 'checkbox' | 'select' => {
          const lowerType = (type || 'text').toLowerCase();
          if (lowerType.includes('email')) return 'email';
          if (lowerType.includes('checkbox') || lowerType.includes('bool')) return 'checkbox';
          if (lowerType.includes('dropdown') || lowerType.includes('select') || lowerType.includes('choice')) return 'select';
          return 'text';
        };

        return {
          id: field.id || field.field_name || field.name,
          label: field.field_name || field.label || field.name || "Field",
          type: mapFieldType(field.field_type || field.type),
          required: field.required || false,
          options: field.options || field.choices || undefined
        };
      });

      // Add default fields if none were returned (email is typically required)
      if (customFields.length === 0) {
        customFields.push(
          { id: 'email', label: 'Email Address', type: 'email', required: true },
          { id: 'first_name', label: 'First Name', type: 'text', required: false },
          { id: 'last_name', label: 'Last Name', type: 'text', required: false }
        );
      }

      setIntegrationConfig({
        ...integrationConfig,
        customFields: customFields
      });

      setIsSyncingFields(false);
      alert(`Successfully synced ${customFields.length} custom field${customFields.length !== 1 ? 's' : ''} from BigMarker!`);
    } catch (error: any) {
      console.error('BigMarker sync error:', error);
      setIsSyncingFields(false);

      let errorMessage = 'Failed to sync fields from BigMarker.';
      if (error.message.includes('401')) {
        errorMessage = 'API key is invalid or missing. Please configure it in SuperAdmin settings.';
      } else if (error.message.includes('404')) {
        errorMessage = 'Conference not found. Please check the Conference ID.';
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and ensure the backend server is running.';
      } else {
        errorMessage = `Error: ${error.message}`;
      }

      alert(errorMessage);
    }
  };

  const handleSaveHtml = () => {
    onManualUpdate({ ...eventPlan, websiteHtml: editedHtml });
    setIsEditingHtml(false);
  };

  // State for Regenerate confirmation modal
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const openRegenerateConfirm = () => setShowRegenerateConfirm(true);

  const confirmRegenerate = () => {
    onGenerateWebsite();
    setShowIntegrationSettings(false);
    setShowRegenerateConfirm(false);
  };

  const cancelRegenerate = () => setShowRegenerateConfirm(false);

  const handleRegenerateWithNewSettings = () => {
    openRegenerateConfirm();
  };

  const handleDownloadHtml = () => {
    if (!eventPlan.websiteHtml) return;
    const element = document.createElement("a");
    const file = new Blob([eventPlan.websiteHtml], { type: 'text/html' });
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none" />

        <img
          src={eventPlan.headerImageUrl || `https://picsum.photos/seed/${eventPlan.imageKeyword || 'event'}/800/400`}
          alt={eventPlan.theme}
          className="w-full h-48 md:h-64 object-cover transform transition-transform duration-700"
        />

        {/* Upload Button Overlay */}
        <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => headerInputRef.current?.click()}
            className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg backdrop-blur-sm flex items-center gap-2 text-xs font-bold"
          >
            <Camera className="w-4 h-4" /> Change Cover
          </button>
          <input
            type="file"
            ref={headerInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleHeaderUpload}
          />
        </div>

        <div className="absolute bottom-0 left-0 p-6 z-20 text-white w-full">
          {isEditing ? (
            <div className="space-y-2">
              <input
                value={eventPlan.theme}
                onChange={(e) => handleOverviewChange('theme', e.target.value)}
                className="bg-white/20 text-white placeholder-white/50 w-full px-2 py-1 rounded text-sm uppercase tracking-wider font-medium"
                placeholder="Theme"
              />
              <textarea
                value={eventPlan.marketingTagline}
                onChange={(e) => handleOverviewChange('marketingTagline', e.target.value)}
                className="bg-white/20 text-white placeholder-white/50 w-full px-2 py-1 rounded text-xl font-bold leading-tight"
                placeholder="Marketing Tagline"
                rows={2}
              />
            </div>
          ) : (
            <>
              <h3 className="text-sm font-medium uppercase tracking-wider text-indigo-300 mb-1">{eventPlan.theme}</h3>
              <p className="text-xl md:text-2xl font-bold leading-tight">"{eventPlan.marketingTagline}"</p>
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-center space-y-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div className="w-full">
            <p className="text-sm text-slate-500 font-medium">Expected Viewers</p>
            {isEditing ? (
              <input
                type="number"
                value={eventPlan.estimatedAttendees}
                onChange={(e) => handleOverviewChange('estimatedAttendees', parseInt(e.target.value))}
                className="w-full border-b border-slate-300 focus:border-indigo-500 outline-none font-bold text-slate-900 text-2xl"
              />
            ) : (
              <p className="text-2xl font-bold text-slate-900">{eventPlan.estimatedAttendees}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <MapPin className="w-6 h-6" />
          </div>
          <div className="w-full">
            <p className="text-sm text-slate-500 font-medium">Platform</p>
            {isEditing ? (
              <input
                type="text"
                value={eventPlan.location}
                onChange={(e) => handleOverviewChange('location', e.target.value)}
                className="w-full border-b border-slate-300 focus:border-indigo-500 outline-none font-bold text-slate-900 text-lg"
              />
            ) : (
              <p className="text-lg font-bold text-slate-900 leading-tight">{eventPlan.location}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="w-full">
            <p className="text-sm text-slate-500 font-medium">Live Date</p>
            {isEditing ? (
              <input
                type="text"
                value={eventPlan.date}
                onChange={(e) => handleOverviewChange('date', e.target.value)}
                className="w-full border-b border-slate-300 focus:border-indigo-500 outline-none font-bold text-slate-900 text-lg"
              />
            ) : (
              <p className="text-lg font-bold text-slate-900">{eventPlan.date}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Mic className="w-5 h-5 text-indigo-500" />
            Featured Speakers
          </h3>
          {isEditing && (
            <button onClick={addSpeaker} className="text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100">
              <Plus className="w-3 h-3" /> Add Speaker
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {eventPlan.speakers && eventPlan.speakers.map((speaker, idx) => (
            <div key={idx} className="flex items-center gap-4 p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors group relative">
              <div className="relative flex-shrink-0">
                <img
                  src={speaker.customImageUrl || `https://i.pravatar.cc/150?u=${speaker.id}`}
                  alt={speaker.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100"
                />
                <button
                  onClick={() => speakerInputRefs.current[speaker.id]?.click()}
                  className="absolute -bottom-1 -right-1 bg-white shadow-md border border-slate-200 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Upload Photo"
                >
                  <Upload className="w-3 h-3 text-slate-600" />
                </button>
                <input
                  type="file"
                  ref={(el) => { speakerInputRefs.current[speaker.id] = el; }}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleSpeakerUpload(e, speaker.id)}
                />
              </div>
              <div className="w-full">
                {isEditing ? (
                  <div className="space-y-1">
                    <input
                      value={speaker.name}
                      onChange={(e) => handleSpeakerChange(idx, 'name', e.target.value)}
                      className="w-full text-sm font-bold border-b border-slate-200 focus:border-indigo-500 outline-none bg-transparent"
                      placeholder="Name"
                    />
                    <input
                      value={speaker.role}
                      onChange={(e) => handleSpeakerChange(idx, 'role', e.target.value)}
                      className="w-full text-xs text-indigo-600 border-b border-slate-200 focus:border-indigo-500 outline-none bg-transparent"
                      placeholder="Role"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-bold text-slate-800 text-sm">{speaker.name}</p>
                    <p className="text-xs text-indigo-600">{speaker.role}</p>
                  </>
                )}
              </div>
              {isEditing && (
                <button onClick={() => removeSpeaker(idx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {(!eventPlan.speakers || eventPlan.speakers.length === 0) && (
            <p className="text-slate-500 text-sm">No speakers listed yet.</p>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Event Description</h3>
        {isEditing ? (
          <textarea
            value={eventPlan.description}
            onChange={(e) => handleOverviewChange('description', e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[100px]"
          />
        ) : (
          <p className="text-slate-600 leading-relaxed">{eventPlan.description}</p>
        )}
      </div>
    </div>
  );

  const renderAgenda = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-800">Run of Show</h3>
        <div className="flex gap-2">
          {isEditing && (
            <button onClick={addAgendaItem} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Add Item
            </button>
          )}
          <span className="text-xs font-medium px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full flex items-center">
            {eventPlan.agenda.length} Segments
          </span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {eventPlan.agenda.map((item, index) => (
          <div key={index} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row gap-4 relative group">
            {/* Thumbnail for Agenda Item */}
            <div className="hidden md:block flex-shrink-0 w-24 h-24 bg-slate-200 rounded-lg overflow-hidden">
              <img
                src={`https://picsum.photos/seed/${item.imageKeyword || 'meeting'}/200/200`}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="md:w-32 flex-shrink-0 flex md:flex-col items-center md:items-start gap-2">
              {isEditing ? (
                <>
                  <input
                    value={item.time}
                    onChange={(e) => handleAgendaChange(index, 'time', e.target.value)}
                    className="text-sm font-bold text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded w-24"
                  />
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <input
                      type="number"
                      value={item.durationMinutes}
                      onChange={(e) => handleAgendaChange(index, 'durationMinutes', parseInt(e.target.value))}
                      className="text-xs text-slate-500 bg-white border border-slate-300 px-1 py-0.5 rounded w-12"
                    />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded">
                    {item.time}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {item.durationMinutes} min
                  </span>
                </>
              )}
            </div>
            <div className="flex-grow pr-8">
              <div className="flex items-center justify-between mb-1">
                {isEditing ? (
                  <input
                    value={item.title}
                    onChange={(e) => handleAgendaChange(index, 'title', e.target.value)}
                    className="text-base font-semibold text-slate-800 bg-white border border-slate-300 px-2 py-1 rounded w-full mr-2"
                  />
                ) : (
                  <h4 className="text-base font-semibold text-slate-800">{item.title}</h4>
                )}

                {isEditing ? (
                  <select
                    value={item.type}
                    onChange={(e) => handleAgendaChange(index, 'type', e.target.value)}
                    className="text-xs font-bold px-2 py-1 rounded border border-slate-300"
                  >
                    <option value="keynote">Keynote</option>
                    <option value="break">Break</option>
                    <option value="workshop">Workshop</option>
                    <option value="networking">Networking</option>
                    <option value="panel">Panel</option>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider
                    ${item.type === 'break' ? 'bg-slate-100 text-slate-500' :
                      item.type === 'keynote' ? 'bg-indigo-100 text-indigo-700' :
                        item.type === 'workshop' ? 'bg-emerald-100 text-emerald-700' :
                          item.type === 'networking' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'}`}>
                    {item.type}
                  </span>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={item.description}
                  onChange={(e) => handleAgendaChange(index, 'description', e.target.value)}
                  className="w-full text-sm text-slate-600 bg-white border border-slate-300 px-2 py-1 rounded mt-1"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-slate-600">{item.description}</p>
              )}
            </div>

            {isEditing && (
              <button
                onClick={() => removeAgendaItem(index)}
                className="absolute top-4 right-4 text-red-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-800">Action Plan</h3>
        {isEditing && (
          <button onClick={addTask} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {eventPlan.tasks.map((task, index) => (
          <div key={index} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors group relative">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
              ${task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
              {task.status === 'completed' && <CheckSquare className="w-3 h-3 text-white" />}
            </div>

            <div className="flex-grow pr-8">
              {isEditing ? (
                <input
                  value={task.title}
                  onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                  className="w-full text-sm font-medium text-slate-800 border-b border-slate-300 focus:border-indigo-500 outline-none pb-1"
                />
              ) : (
                <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {task.title}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <select
                    value={task.priority}
                    onChange={(e) => handleTaskChange(index, 'priority', e.target.value)}
                    className="text-xs font-bold px-2 py-1 rounded border border-slate-300"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <select
                    value={task.status}
                    onChange={(e) => handleTaskChange(index, 'status', e.target.value)}
                    className="text-xs px-2 py-1 rounded border border-slate-300"
                  >
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </>
              ) : (
                <>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full
                      ${task.priority === 'high' ? 'bg-red-50 text-red-600' :
                      task.priority === 'medium' ? 'bg-orange-50 text-orange-600' :
                        'bg-green-50 text-green-600'}`}>
                    {task.priority}
                  </span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    {task.status}
                  </span>
                </>
              )}
            </div>

            {isEditing && (
              <button
                onClick={() => removeTask(index)}
                className="text-red-400 hover:text-red-600 p-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800">Expense Details</h3>
          {isEditing && (
            <button onClick={addBudgetItem} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {eventPlan.budget.items.map((item, index) => (
            <div key={index} className="p-4 flex justify-between items-center hover:bg-slate-50 relative group">
              <div className="flex-grow pr-4">
                {isEditing ? (
                  <div className="flex flex-col gap-1">
                    <input
                      value={item.label}
                      onChange={(e) => handleBudgetChange(index, 'label', e.target.value)}
                      className="font-medium text-slate-800 border-b border-slate-300 focus:border-indigo-500 outline-none w-full"
                      placeholder="Expense Name"
                    />
                    <input
                      value={item.category}
                      onChange={(e) => handleBudgetChange(index, 'category', e.target.value)}
                      className="text-xs text-slate-500 uppercase border-b border-slate-300 focus:border-indigo-500 outline-none w-1/2"
                      placeholder="Category"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 uppercase">{item.category}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4">
                {isEditing ? (
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => handleBudgetChange(index, 'amount', parseFloat(e.target.value))}
                    className="font-mono font-medium text-slate-700 w-24 text-right border-b border-slate-300 focus:border-indigo-500 outline-none"
                  />
                ) : (
                  <p className="font-mono font-medium text-slate-700">
                    {eventPlan.budget.currency}{item.amount.toLocaleString()}
                  </p>
                )}
                {isEditing && (
                  <button
                    onClick={() => removeBudgetItem(index)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
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
            <div className="w-full max-w-md mb-8 animate-fadeIn space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {integrationConfig.type === 'zoom' ? 'Zoom Webinar ID' : 'BigMarker Conference ID'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={integrationConfig.platformId || ''}
                    onChange={(e) => setIntegrationConfig({ ...integrationConfig, platformId: e.target.value })}
                    placeholder="e.g., 123456789"
                    className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* BigMarker Specific Field Sync Button */}
              {integrationConfig.type === 'bigmarker' && (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-bold text-slate-700">Form Fields</h4>
                    <button
                      onClick={handleSyncBigMarkerFields}
                      disabled={isSyncingFields || !integrationConfig.platformId}
                      className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingFields ? 'animate-spin' : ''}`} />
                      {isSyncingFields ? 'Syncing...' : 'Sync Fields'}
                    </button>
                  </div>

                  {integrationConfig.customFields ? (
                    <div className="space-y-1">
                      {integrationConfig.customFields.map(field => (
                        <div key={field.id} className="text-xs text-slate-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          <span className="font-mono">{field.label}</span>
                          <span className="text-slate-400 italic">({field.type})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Click "Sync Fields" to pull form configuration from BigMarker.
                    </p>
                  )}
                </div>
              )}
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
                onClick={() => setShowIntegrationSettings(!showIntegrationSettings)}
                className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${showIntegrationSettings
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <RefreshCw className="w-4 h-4" /> Settings
              </button>
              {showCode && (
                <button
                  onClick={() => {
                    if (isEditingHtml) {
                      handleSaveHtml();
                    } else {
                      setIsEditingHtml(true);
                    }
                  }}
                  className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${isEditingHtml
                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                    }`}
                >
                  {isEditingHtml ? (
                    <>
                      <Save className="w-4 h-4" /> Save Changes
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-4 h-4" /> Edit HTML
                    </>
                  )}
                </button>
              )}
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
                  if (win) {
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

          {/* Integration Settings Panel */}
          {showIntegrationSettings && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                Integration Settings
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {integrationConfig.type === 'zoom' ? 'Zoom Webinar ID' : 'BigMarker Conference ID'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={integrationConfig.platformId || ''}
                      onChange={(e) => setIntegrationConfig({ ...integrationConfig, platformId: e.target.value })}
                      placeholder="e.g., 123456789"
                      className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}

              <button
                onClick={handleRegenerateWithNewSettings}
                disabled={isGeneratingWebsite}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {isGeneratingWebsite ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Regenerate with New Settings
                  </>
                )}
              </button>
            </div>
          )}

          <div className="flex-grow bg-slate-100 rounded-xl border border-slate-200 overflow-hidden relative">
            {showCode ? (
              <textarea
                readOnly={!isEditingHtml}
                value={isEditingHtml ? editedHtml : eventPlan.websiteHtml}
                onChange={(e) => setEditedHtml(e.target.value)}
                className={`w-full h-full p-4 font-mono text-sm text-slate-800 bg-white resize-none focus:outline-none ${isEditingHtml ? 'focus:ring-2 focus:ring-indigo-500' : ''
                  }`}
                placeholder="HTML code will appear here..."
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

      <Modal
        isOpen={showRegenerateConfirm}
        onClose={cancelRegenerate}
        title="Regenerate Website?"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            This will overwrite your current website content with a new version based on the updated settings.
            Any manual text edits to the HTML will be lost.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={cancelRegenerate}>Cancel</Button>
            <Button onClick={confirmRegenerate}>Yes, Regenerate</Button>
          </div>
        </div>
      </Modal>
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
            {isEditing ? (
              <input
                value={eventPlan.title}
                onChange={(e) => handleOverviewChange('title', e.target.value)}
                className="text-2xl font-bold text-slate-800 border-b border-slate-300 focus:border-indigo-500 outline-none"
              />
            ) : (
              <h2 className="text-2xl font-bold text-slate-800">{eventPlan.title}</h2>
            )}
            <p className="text-sm text-slate-500 mt-1">{eventPlan.date} • {eventPlan.location}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Edit Mode Toggle */}
            {activeTab !== 'website' && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border ${isEditing
                  ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {isEditing ? (
                  <>
                    <Save className="w-4 h-4" /> Done Editing
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4" /> Edit Mode
                  </>
                )}
              </button>
            )}

            <div className="hidden md:block">
              <div className="text-right">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Webinar Mode</p>
                <p className="text-xs text-slate-400">Gemini 2.5 Flash</p>
              </div>
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
        {activeTab !== 'website' && !isEditing && (
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
