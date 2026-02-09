
import React, { useState, useEffect, useRef } from 'react';
import { EventPlan, IntegrationConfig, Speaker, FormField, AgendaItem, Task, EventBudget } from '../types';
import { addRegistrant, getAdminSettings, saveAdminSettings } from '../services/storageService';
import { getApiAuthHeaders, getApiUrl } from '../services/config';
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
  X,
  Key,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Button, Modal } from './UIComponents';

interface DashboardProps {
  eventPlan: EventPlan;
  onUpdate: (instruction: string) => void;
  onManualUpdate: (plan: EventPlan) => void;
  isUpdating: boolean;
  onGenerateWebsite: (overrideConfig?: IntegrationConfig) => void;
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
  type IntegrationType = IntegrationConfig['type'];
  const [activeTab, setActiveTab] = useState<'overview' | 'agenda' | 'tasks' | 'budget' | 'files' | 'website' | 'registrants'>('overview');
  const [chatInput, setChatInput] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [lastRegistrant, setLastRegistrant] = useState<string | null>(null);
  const [isSyncingFields, setIsSyncingFields] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingHtml, setIsEditingHtml] = useState(false);
  const [editedHtml, setEditedHtml] = useState(eventPlan.websiteHtml || '');
  const [showIntegrationSettings, setShowIntegrationSettings] = useState(false);
  const [bigMarkerApiKey, setBigMarkerApiKey] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isEditingLandingDetails, setIsEditingLandingDetails] = useState(false);
  const [landingDraft, setLandingDraft] = useState({
    title: eventPlan.title || '',
    marketingTagline: eventPlan.marketingTagline || '',
    description: eventPlan.description || '',
    date: eventPlan.date || '',
    location: eventPlan.location || ''
  });
  const [liveRegistrants, setLiveRegistrants] = useState(eventPlan.registrants || []);
  const [zoomMeetingDetails, setZoomMeetingDetails] = useState<null | {
    id: string | number;
    topic?: string;
    host_id?: string;
    start_time?: string;
    duration?: number;
    timezone?: string;
    join_url?: string;
    start_url?: string;
    registration_url?: string;
    status?: string;
  }>(null);
  const [isSyncingZoomDetails, setIsSyncingZoomDetails] = useState(false);
  const [bigMarkerConferenceDetails, setBigMarkerConferenceDetails] = useState<null | {
    id: string | number;
    title?: string;
    status?: string;
    starts_at?: string;
    timezone?: string;
    webinar_url?: string;
    registration_url?: string;
    host_name?: string;
  }>(null);
  const [isSyncingBigMarkerDetails, setIsSyncingBigMarkerDetails] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldId, setNewFieldId] = useState('');
  const [newFieldType, setNewFieldType] = useState<FormField['type']>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const getIntegrationLabel = (type: IntegrationType): string => {
    if (type === 'zoom') return 'Zoom';
    if (type === 'bigmarker') return 'BigMarker';
    if (type === 'custom') return 'Custom Webinar Platform';
    if (type === 'email') return 'Email Registration';
    return 'Registration';
  };

  const buildDefaultCustomWebinarFields = (): FormField[] => ([
    { id: 'name', label: 'Full Name', type: 'text', required: true },
    { id: 'email', label: 'Email Address', type: 'email', required: true },
    { id: 'company', label: 'Organization', type: 'text', required: false }
  ]);

  const applyIntegrationSwitch = (nextType: IntegrationType) => {
    const previousType = integrationConfig.type;
    const previousSettings = integrationConfig.platformSettings || {};
    const nextConfig: IntegrationConfig = {
      ...integrationConfig,
      type: nextType,
      platformId: previousType === nextType ? integrationConfig.platformId : '',
      customFields:
        nextType === 'custom'
          ? (Array.isArray(integrationConfig.customFields) && integrationConfig.customFields.length > 0
              ? integrationConfig.customFields
              : buildDefaultCustomWebinarFields())
          : previousType === nextType
            ? integrationConfig.customFields
            : undefined,
      platformSettings: {
        ...previousSettings,
        customProviderName:
          nextType === 'custom'
            ? (previousSettings.customProviderName || 'Custom Webinar Platform')
            : previousSettings.customProviderName,
      }
    };
    setIntegrationConfig(nextConfig);
  };

  const getMandatoryFieldIds = (type: IntegrationType): string[] => {
    if (type === 'zoom') return ['first_name', 'last_name', 'email'];
    if (type === 'bigmarker') return ['full_name', 'email'];
    if (type === 'custom') return ['name', 'email'];
    return ['email'];
  };

  const normalizeFieldId = (raw: string): string =>
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const upsertCustomFields = (fields: FormField[]) => {
    setIntegrationConfig({
      ...integrationConfig,
      customFields: fields
    });
  };

  const handleAddRegistrationField = () => {
    const label = String(newFieldLabel || '').trim();
    if (!label) {
      showToast('Field label is required.', 'error');
      return;
    }
    const normalizedId = normalizeFieldId(newFieldId || label);
    if (!normalizedId) {
      showToast('Field ID is invalid.', 'error');
      return;
    }
    const current = Array.isArray(integrationConfig.customFields) ? integrationConfig.customFields : [];
    if (current.some((f) => String(f.id).toLowerCase() === normalizedId)) {
      showToast(`Field "${normalizedId}" already exists.`, 'error');
      return;
    }

    const options = newFieldType === 'select'
      ? String(newFieldOptions || '').split(',').map((x) => x.trim()).filter(Boolean)
      : undefined;
    const nextField: FormField = {
      id: normalizedId,
      label,
      type: newFieldType,
      required: newFieldRequired,
      options: options && options.length > 0 ? options : undefined
    };
    upsertCustomFields([...current, nextField]);
    setNewFieldLabel('');
    setNewFieldId('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldOptions('');
    showToast('Field added.', 'success');
  };

  const handleRemoveRegistrationField = (fieldId: string) => {
    const id = String(fieldId || '').toLowerCase();
    if (!id) return;
    const mandatory = getMandatoryFieldIds(integrationConfig.type);
    if (mandatory.includes(id)) {
      showToast(`"${fieldId}" is required for ${getIntegrationLabel(integrationConfig.type)} registration.`, 'error');
      return;
    }
    const current = Array.isArray(integrationConfig.customFields) ? integrationConfig.customFields : [];
    const next = current.filter((f) => String(f.id).toLowerCase() !== id);
    upsertCustomFields(next);
    showToast('Field removed.', 'success');
  };

  const renderRegistrationFieldsEditor = (emptyHint: string) => (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-bold text-slate-700">Registration Fields</h4>
        <button
          onClick={integrationConfig.type === 'zoom' ? handleSyncZoomFields : integrationConfig.type === 'bigmarker' ? handleSyncBigMarkerFields : syncProviderFields}
          disabled={isSyncingFields || ((integrationConfig.type === 'zoom' || integrationConfig.type === 'bigmarker') && !integrationConfig.platformId)}
          className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncingFields ? 'animate-spin' : ''}`} />
          {isSyncingFields ? 'Syncing...' : 'Sync Fields'}
        </button>
      </div>

      {Array.isArray(integrationConfig.customFields) && integrationConfig.customFields.length > 0 ? (
        <div className="space-y-2 max-h-40 overflow-auto pr-1">
          {integrationConfig.customFields.map((field) => (
            <div key={field.id} className="text-xs text-slate-700 flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2 py-1.5">
              <div className="min-w-0">
                <span className="font-mono">{field.label}</span>
                <span className="text-slate-400 italic ml-2">({field.type}{field.required ? ', required' : ''})</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveRegistrationField(field.id)}
                className="text-rose-600 hover:text-rose-700 font-medium whitespace-nowrap"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">{emptyHint}</p>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          type="text"
          value={newFieldLabel}
          onChange={(e) => setNewFieldLabel(e.target.value)}
          placeholder="Field label"
          className="md:col-span-2 border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <input
          type="text"
          value={newFieldId}
          onChange={(e) => setNewFieldId(e.target.value)}
          placeholder="field_id (optional)"
          className="border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <select
          value={newFieldType}
          onChange={(e) => setNewFieldType(e.target.value as FormField['type'])}
          className="border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="text">Text</option>
          <option value="email">Email</option>
          <option value="select">Select</option>
          <option value="checkbox">Checkbox</option>
        </select>
        <button
          type="button"
          onClick={handleAddRegistrationField}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2 py-1.5 text-xs font-semibold"
        >
          Add Field
        </button>
      </div>
      {newFieldType === 'select' && (
        <input
          type="text"
          value={newFieldOptions}
          onChange={(e) => setNewFieldOptions(e.target.value)}
          placeholder="Select options (comma-separated)"
          className="mt-2 w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      )}
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={newFieldRequired}
          onChange={(e) => setNewFieldRequired(e.target.checked)}
        />
        Required field
      </label>
    </div>
  );

  const adjustPlanForIntegration = (plan: EventPlan, cfg: IntegrationConfig): EventPlan => {
    const integrationLabel = getIntegrationLabel(cfg.type);
    const customProviderName = String(cfg.platformSettings?.customProviderName || '').trim() || 'Custom Webinar Platform';
    const locationByType: Record<IntegrationType, string> = {
      zoom: 'Zoom Webinar',
      bigmarker: 'BigMarker Live Webinar',
      custom: customProviderName,
      email: 'Online Registration',
      none: 'Virtual Event'
    };

    const conversionCopyByType: Record<IntegrationType, { tagline: string; descriptor: string }> = {
      zoom: {
        tagline: 'High-converting registration with Zoom sync, reminders, and access control.',
        descriptor: 'Attendees register through a Zoom-native flow with structured fields, confirmation continuity, and streamlined join readiness.'
      },
      bigmarker: {
        tagline: 'Branded registration with BigMarker sync for live webinar engagement.',
        descriptor: 'Attendees register through a BigMarker-ready workflow optimized for conversion, event credibility, and clean backend sync.'
      },
      custom: {
        tagline: `Branded registration routed through ${customProviderName} with flexible workflow control.`,
        descriptor: `Attendees register through your custom webinar stack (${customProviderName}), preserving brand continuity while keeping registration friction low.`
      },
      email: {
        tagline: 'Simple no-code registration flow with lightweight confirmation handling.',
        descriptor: 'Attendees register through a focused email-first form designed to reduce drop-off and keep sign-up fast on desktop and mobile.'
      },
      none: {
        tagline: plan.marketingTagline || 'Registration workflow ready.',
        descriptor: 'Registration flow is configured and can be regenerated with provider-specific settings.'
      }
    };

    const baseDescription = String(plan.description || '')
      .replace(/\s*Registration platform:[^\n.]*(\.|\n)?/ig, ' ')
      .replace(/\s*Attendees register through[^.]*\./ig, ' ')
      .trim();
    const descriptor = conversionCopyByType[cfg.type].descriptor;
    const nextDescription = `${baseDescription} ${descriptor} Registration platform: ${integrationLabel}.`
      .replace(/\s+/g, ' ')
      .trim();

    return {
      ...plan,
      location: locationByType[cfg.type] || plan.location,
      description: nextDescription,
      marketingTagline: conversionCopyByType[cfg.type].tagline
    };
  };

  const getFallbackSubdomain = () => {
    const titleSeed = String(eventPlan.title || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'event';
    const idSeed = String(eventPlan.id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(-6) || 'landing';
    return `${titleSeed}-${idSeed}`.slice(0, 58);
  };

  const getLandingSubdomainUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol || 'http:';
    const port = window.location.port ? `:${window.location.port}` : '';
    const host = window.location.hostname || 'localhost';
    const subdomain = String(eventPlan.landingSubdomain || '').trim() || getFallbackSubdomain();
    if (host === 'localhost' || host === '127.0.0.1') {
      return `${protocol}//${subdomain}.localhost${port}/`;
    }
    if (host.endsWith('.localhost')) {
      return `${protocol}//${subdomain}.localhost${port}/`;
    }
    const hostParts = host.split('.').filter(Boolean);
    const rootDomain = hostParts.length >= 2 ? hostParts.slice(-2).join('.') : host;
    return `${protocol}//${subdomain}.${rootDomain}${port}/`;
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Load admin settings on mount to check for API keys
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getAdminSettings();
      if (settings.hasBigMarkerKey) {
        showToast('Stored BigMarker API key is configured on server.', 'success');
      }
    };
    loadSettings();
  }, []);

  // Refs for file inputs
  const headerInputRef = useRef<HTMLInputElement>(null);
  const speakerInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const uploadedFileInputRef = useRef<HTMLInputElement>(null);
  const [newUploadedFileKind, setNewUploadedFileKind] = useState<'agenda' | 'deck'>('agenda');
  const [newUploadedLinkName, setNewUploadedLinkName] = useState('');
  const [newUploadedLinkUrl, setNewUploadedLinkUrl] = useState('');

  // Listen for registration events from the iframe website
  useEffect(() => {
    setLiveRegistrants(eventPlan.registrants || []);
  }, [eventPlan.id, eventPlan.registrants]);

  useEffect(() => {
    setZoomMeetingDetails(null);
    setBigMarkerConferenceDetails(null);
  }, [eventPlan.id, integrationConfig.type, integrationConfig.platformId]);

  // Listen for registration events from the iframe website
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'EVENT_REGISTRATION') {
        const { eventId, payload } = event.data;
        if (eventId === eventPlan.id) {
          console.log('Received registration via iframe:', payload);
          const postResultToIframe = (body: Record<string, unknown>) => {
            try {
              if (event.source && typeof (event.source as WindowProxy).postMessage === 'function') {
                (event.source as WindowProxy).postMessage({
                  type: 'EVENT_REGISTRATION_RESULT',
                  eventId: eventPlan.id,
                  ...body
                }, '*');
              }
            } catch (e) {
              console.warn('Unable to post registration result back to iframe', e);
            }
          };
          try {
            const result = await addRegistrant(eventId, payload);
            postResultToIframe({
              success: true,
              registration: result?.registration || null
            });
            if (!result?.duplicate) {
              if (integrationConfig.type === 'bigmarker' && integrationConfig.platformId) {
                showToast('Registrant synced to BigMarker successfully.', 'success');
              }
            }
          } catch (registerError: any) {
            const errorMessage = registerError?.message || 'Failed to save registration.';
            postResultToIframe({
              success: false,
              error: errorMessage
            });
            showToast(errorMessage, 'error');
            return;
          }
          setLiveRegistrants((prev) => {
            const email = String(payload.email || '').trim().toLowerCase();
            if (!email) return prev;
            const exists = prev.some((r) => String(r.email || '').trim().toLowerCase() === email);
            if (exists) return prev;
            return [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: String(payload.name || `${payload.first_name || ''} ${payload.last_name || ''}`.trim() || 'Unknown'),
                email: String(payload.email || '').trim(),
                company: String(payload.company || '').trim() || undefined,
                registeredAt: Date.now()
              },
              ...prev
            ];
          });
          setLastRegistrant(payload.name);
          setTimeout(() => setLastRegistrant(null), 5000);

          if (integrationConfig.type === 'zoom' && integrationConfig.platformId) {
            try {
              const fullName = String(payload.name || '').trim();
              const firstSpace = fullName.indexOf(' ');
              const firstName = payload.first_name || (firstSpace === -1 ? fullName : fullName.substring(0, firstSpace));
              const lastName = payload.last_name || (firstSpace === -1 ? '.' : fullName.substring(firstSpace + 1));
              const customQuestions = Array.isArray(integrationConfig.customFields)
                ? integrationConfig.customFields
                    .filter((field) => !['email', 'first_name', 'last_name', 'name', 'full_name'].includes(field.id.toLowerCase()))
                    .map((field) => {
                      const raw = payload[field.id];
                      if (raw === undefined || raw === null || String(raw).trim() === '') {
                        return null;
                      }
                      return {
                        title: field.label,
                        value: String(raw).trim()
                      };
                    })
                    .filter(Boolean)
                : [];

              const zoomResp = await fetch(
                getApiUrl(`/api/zoom/meetings/${encodeURIComponent(String(integrationConfig.platformId))}/registrants`),
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...getApiAuthHeaders()
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    email: payload.email,
                    first_name: firstName || '.',
                    last_name: lastName || '.',
                    custom_questions: customQuestions
                  })
                }
              );
              if (!zoomResp.ok) {
                const errText = await zoomResp.text();
                console.error('Failed to register to Zoom via Dashboard:', errText);
                showToast(`Zoom registration failed: ${errText.slice(0, 180)}`, 'error');
              } else {
                console.log('Registered to Zoom meeting via Dashboard proxy');
                showToast('Registrant synced to Zoom successfully.', 'success');
              }
            } catch (zoomError) {
              console.error('Failed to register to Zoom via Dashboard:', zoomError);
              showToast('Zoom registration failed. Check meeting registration settings.', 'error');
            }
          } else if (integrationConfig.type === 'zoom' && !integrationConfig.platformId) {
            showToast('Zoom meeting ID is missing. Registrant saved locally only.', 'error');
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

  useEffect(() => {
    setLandingDraft({
      title: eventPlan.title || '',
      marketingTagline: eventPlan.marketingTagline || '',
      description: eventPlan.description || '',
      date: eventPlan.date || '',
      location: eventPlan.location || ''
    });
    setIsEditingLandingDetails(false);
  }, [eventPlan.id, eventPlan.title, eventPlan.marketingTagline, eventPlan.description, eventPlan.date, eventPlan.location]);

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

  const handleSyncBigMarkerFields = async (): Promise<FormField[]> => {
    if (!integrationConfig.platformId) {
      alert("Please enter a Conference ID first.");
      return [];
    }

    setIsSyncingFields(true);

    // Auto-save API Key if provided
    if (bigMarkerApiKey) {
      try {
        const currentSettings = await getAdminSettings();
        await saveAdminSettings({ ...currentSettings, bigMarkerApiKey: bigMarkerApiKey });
      } catch (e) {
        console.error("Failed to auto-save BigMarker key", e);
      }
    }

    try {
      // Use the dedicated Custom Fields endpoint to get correct field definitions
      // Proxy path: /api/bigmarker/api/v1/conferences/custom_fields/{id}
      const response = await fetch(getApiUrl(`/api/bigmarker/api/v1/conferences/custom_fields/${integrationConfig.platformId}`), {
        headers: getApiAuthHeaders()
      });

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

      // Filter out mapped fields that conflict with our mandatory standard fields
      // We want to enforce: "Full Name" and "Email Address" as the primary fields.
      const filteredMappedFields = customFields.filter(f => {
        const id = f.id.toLowerCase();
        return !['email', 'first_name', 'last_name', 'full_name', 'name'].includes(id);
      });

      // Always prepend the standard mandatory fields
      const finalFields: FormField[] = [
        { id: 'full_name', label: 'Full Name', type: 'text', required: true },
        { id: 'email', label: 'Email Address', type: 'email', required: true },
        ...filteredMappedFields
      ];

      setIntegrationConfig({
        ...integrationConfig,
        customFields: finalFields
      });

      setIsSyncingFields(false);
      console.log('BigMarker Sync Success. Final Fields:', finalFields);
      showToast(`Successfully synced ${finalFields.length} fields (including standard fields) from BigMarker!`, 'success');
      return finalFields;
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

      showToast(errorMessage, 'error');
      return [];
    }
  };

  const handleSyncZoomFields = async (): Promise<FormField[]> => {
    const meetingId = String(integrationConfig.platformId || '').trim();
    if (!meetingId) {
      alert('Please enter a Zoom Meeting/Webinar ID first.');
      return [];
    }

    setIsSyncingFields(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/zoom/meetings/${encodeURIComponent(meetingId)}/registration-fields`),
        {
          credentials: 'include',
          headers: { ...getApiAuthHeaders() }
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Zoom field sync failed (${response.status})`);
      }

      const standardQuestions = Array.isArray(body.questions) ? body.questions : [];
      const customQuestions = Array.isArray(body.custom_questions) ? body.custom_questions : [];
      const fields: FormField[] = [];

      const pushUnique = (field: FormField) => {
        if (!field.id) return;
        if (fields.some((f) => f.id.toLowerCase() === field.id.toLowerCase())) return;
        fields.push(field);
      };

      const mapZoomFieldType = (value: string): 'text' | 'email' | 'checkbox' | 'select' => {
        const normalized = String(value || '').toLowerCase();
        if (normalized.includes('email')) return 'email';
        if (normalized.includes('single_radio') || normalized.includes('single') || normalized.includes('dropdown')) return 'select';
        if (normalized.includes('checkbox') || normalized.includes('multiple')) return 'checkbox';
        return 'text';
      };

      for (const q of standardQuestions) {
        const fieldName = String(q?.field_name || '').trim();
        if (!fieldName) continue;
        const id = fieldName.toLowerCase();
        const label = fieldName
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (ch) => ch.toUpperCase());
        pushUnique({
          id,
          label,
          type: mapZoomFieldType(String(q?.type || q?.field_type || 'text')),
          required: Boolean(q?.required)
        });
      }

      for (const q of customQuestions) {
        const title = String(q?.title || '').trim();
        if (!title) continue;
        const normalizedId = `custom_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'}`;
        const answers = Array.isArray(q?.answers) ? q.answers.map((a: any) => String(a || '').trim()).filter(Boolean) : [];
        pushUnique({
          id: normalizedId,
          label: title,
          type: answers.length > 0 ? 'select' : 'text',
          required: Boolean(q?.required),
          options: answers.length > 0 ? answers : undefined
        });
      }

      // Ensure primary identity fields are always present
      pushUnique({ id: 'first_name', label: 'First Name', type: 'text', required: true });
      pushUnique({ id: 'last_name', label: 'Last Name', type: 'text', required: true });
      pushUnique({ id: 'email', label: 'Email Address', type: 'email', required: true });

      // Move identity fields to top in fixed order
      const preferredOrder = ['first_name', 'last_name', 'email'];
      const ordered = [
        ...preferredOrder.map((id) => fields.find((f) => f.id.toLowerCase() === id)).filter(Boolean) as FormField[],
        ...fields.filter((f) => !preferredOrder.includes(f.id.toLowerCase()))
      ];

      setIntegrationConfig({
        ...integrationConfig,
        customFields: ordered
      });
      showToast(`Successfully synced ${ordered.length} Zoom registration fields.`, 'success');
      return ordered;
    } catch (error: any) {
      const message = error?.message || 'Failed to sync Zoom fields.';
      showToast(message, 'error');
      return [];
    } finally {
      setIsSyncingFields(false);
    }
  };

  const syncProviderFields = async (): Promise<FormField[] | null> => {
    if (integrationConfig.type === 'bigmarker') {
      return await handleSyncBigMarkerFields();
    }
    if (integrationConfig.type === 'zoom') {
      return await handleSyncZoomFields();
    }
    if (integrationConfig.type === 'custom') {
      const fields = buildDefaultCustomWebinarFields();
      setIntegrationConfig({
        ...integrationConfig,
        customFields: fields
      });
      showToast(`Initialized ${fields.length} custom webinar form fields.`, 'success');
      return fields;
    }
    return null;
  };

  const handleSaveHtml = () => {
    onManualUpdate({ ...eventPlan, websiteHtml: editedHtml });
    setIsEditingHtml(false);
  };

  const handleSaveLandingDetails = () => {
    const updatedPlan: EventPlan = {
      ...eventPlan,
      title: (landingDraft.title || '').trim() || eventPlan.title,
      marketingTagline: (landingDraft.marketingTagline || '').trim() || eventPlan.marketingTagline,
      description: (landingDraft.description || '').trim() || eventPlan.description,
      date: (landingDraft.date || '').trim() || eventPlan.date,
      location: (landingDraft.location || '').trim() || eventPlan.location
    };
    onManualUpdate(updatedPlan);
    setIsEditingLandingDetails(false);
    onGenerateWebsite();
  };

  const handleCancelLandingDetails = () => {
    setLandingDraft({
      title: eventPlan.title || '',
      marketingTagline: eventPlan.marketingTagline || '',
      description: eventPlan.description || '',
      date: eventPlan.date || '',
      location: eventPlan.location || ''
    });
    setIsEditingLandingDetails(false);
  };

  // State for Regenerate confirmation modal
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const openRegenerateConfirm = () => setShowRegenerateConfirm(true);

  const confirmRegenerate = async () => {
    const synced = await syncProviderFields();
    const nextConfig = Array.isArray(synced)
      ? { ...integrationConfig, customFields: synced }
      : integrationConfig;
    const adjusted = adjustPlanForIntegration(eventPlan, nextConfig);
    onManualUpdate({ ...adjusted, integrationConfig: nextConfig });
    setLandingDraft({
      title: adjusted.title || '',
      marketingTagline: adjusted.marketingTagline || '',
      description: adjusted.description || '',
      date: adjusted.date || '',
      location: adjusted.location || ''
    });
    setIntegrationConfig(nextConfig);
    onGenerateWebsite(nextConfig);
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

  const appendUploadedFiles = (entries: NonNullable<EventPlan['uploadedFiles']>) => {
    const current = Array.isArray(eventPlan.uploadedFiles) ? eventPlan.uploadedFiles : [];
    onManualUpdate({
      ...eventPlan,
      uploadedFiles: [...entries, ...current]
    });
  };

  const handleUploadedFilesInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    const now = Date.now();
    const entries = selectedFiles.map((file, idx) => ({
      id: `${now}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      kind: newUploadedFileKind,
      source: 'upload' as const,
      mimeType: file.type || undefined,
      sizeBytes: Number.isFinite(file.size) ? file.size : undefined,
      // Keep an in-browser blob URL so the file is immediately downloadable from Uploaded Files.
      url: URL.createObjectURL(file),
      createdAt: now + idx
    }));
    appendUploadedFiles(entries);
    e.target.value = '';
    showToast(`${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} added.`, 'success');
  };

  const handleAddUploadedLink = () => {
    const rawUrl = String(newUploadedLinkUrl || '').trim();
    if (!rawUrl) {
      showToast('Enter a file URL first.', 'error');
      return;
    }
    try {
      // Validate URL format
      new URL(rawUrl);
    } catch (_e) {
      showToast('Enter a valid URL (including https://).', 'error');
      return;
    }
    const now = Date.now();
    appendUploadedFiles([
      {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(newUploadedLinkName || '').trim() || rawUrl,
        kind: newUploadedFileKind,
        source: 'link',
        url: rawUrl,
        createdAt: now
      }
    ]);
    setNewUploadedLinkName('');
    setNewUploadedLinkUrl('');
    showToast('Link added to uploaded files.', 'success');
  };

  const handleRemoveUploadedFile = (fileId: string) => {
    const current = Array.isArray(eventPlan.uploadedFiles) ? eventPlan.uploadedFiles : [];
    const target = current.find((file) => String(file.id) === String(fileId));
    if (target?.url && String(target.url).startsWith('blob:')) {
      try {
        URL.revokeObjectURL(target.url);
      } catch (_e) {
        // Ignore object URL cleanup issues.
      }
    }
    const next = current.filter((file) => String(file.id) !== String(fileId));
    onManualUpdate({
      ...eventPlan,
      uploadedFiles: next
    });
  };

  const handleDownloadUploadedFile = (file: NonNullable<EventPlan['uploadedFiles']>[number]) => {
    if (file.url) {
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name || 'download';
      a.rel = 'noopener noreferrer';
      if (!String(file.url).startsWith('blob:')) {
        a.target = '_blank';
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const fallback = [
      `File: ${file.name || 'Unknown'}`,
      `Type: ${file.kind || 'unknown'}`,
      `Source: ${file.source || 'unknown'}`,
      file.mimeType ? `Mime: ${file.mimeType}` : '',
      typeof file.sizeBytes === 'number' ? `Size: ${file.sizeBytes}` : '',
      `Created: ${file.createdAt ? new Date(file.createdAt).toISOString() : 'n/a'}`
    ].filter(Boolean).join('\n');
    const blob = new Blob([fallback], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${(file.name || 'uploaded-file').replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
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

  const handleSyncZoomMeetingDetails = async () => {
    if (integrationConfig.type !== 'zoom') return;
    const meetingId = String(integrationConfig.platformId || '').trim();
    if (!meetingId) {
      showToast('Zoom meeting ID is required before sync.', 'error');
      return;
    }

    setIsSyncingZoomDetails(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/zoom/meetings/${encodeURIComponent(meetingId)}/details`),
        {
          method: 'GET',
          headers: {
            ...getApiAuthHeaders()
          },
          credentials: 'include'
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Failed to sync Zoom meeting (${response.status})`);
      }
      setZoomMeetingDetails(body);
      showToast('Zoom meeting details synced.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to sync Zoom meeting details.', 'error');
    } finally {
      setIsSyncingZoomDetails(false);
    }
  };

  const renderZoomMeetingDetailsCard = () => {
    if (integrationConfig.type !== 'zoom') return null;
    const meetingId = String(integrationConfig.platformId || '').trim();
    return (
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700">Zoom Sync</h4>
          <button
            type="button"
            onClick={handleSyncZoomMeetingDetails}
            disabled={isSyncingZoomDetails || !meetingId}
            className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 disabled:opacity-50"
          >
            {isSyncingZoomDetails ? 'Syncing...' : 'Sync via API'}
          </button>
        </div>
        <p className="text-xs text-slate-600">
          Meeting ID: <span className="font-mono">{meetingId || 'Missing'}</span>
        </p>
        {zoomMeetingDetails ? (
          <div className="space-y-1 text-xs text-slate-600 break-all">
            <p>Topic: <span className="font-medium text-slate-800">{zoomMeetingDetails.topic || 'N/A'}</span></p>
            <p>Status: <span className="font-medium text-slate-800">{zoomMeetingDetails.status || 'N/A'}</span></p>
            <p>Start Time: <span className="font-medium text-slate-800">{zoomMeetingDetails.start_time || 'N/A'}</span></p>
            <p>Duration: <span className="font-medium text-slate-800">{zoomMeetingDetails.duration || 0} min</span></p>
            <p>Timezone: <span className="font-medium text-slate-800">{zoomMeetingDetails.timezone || 'N/A'}</span></p>
            <p>Host ID: <span className="font-mono text-slate-800">{zoomMeetingDetails.host_id || 'N/A'}</span></p>
            <p>Join URL: <a className="text-indigo-600 underline" href={zoomMeetingDetails.join_url} target="_blank" rel="noreferrer">{zoomMeetingDetails.join_url || 'N/A'}</a></p>
            <p>Start URL (login): <a className="text-indigo-600 underline" href={zoomMeetingDetails.start_url} target="_blank" rel="noreferrer">{zoomMeetingDetails.start_url || 'N/A'}</a></p>
            <p>Registration URL: <a className="text-indigo-600 underline" href={zoomMeetingDetails.registration_url} target="_blank" rel="noreferrer">{zoomMeetingDetails.registration_url || 'N/A'}</a></p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No synced Zoom meeting details yet.</p>
        )}
      </div>
    );
  };

  const handleSyncBigMarkerConferenceDetails = async () => {
    if (integrationConfig.type !== 'bigmarker') return;
    const conferenceId = String(integrationConfig.platformId || '').trim();
    if (!conferenceId) {
      showToast('BigMarker conference ID is required before sync.', 'error');
      return;
    }
    setIsSyncingBigMarkerDetails(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/bigmarker/conferences/${encodeURIComponent(conferenceId)}/details`),
        {
          method: 'GET',
          headers: {
            ...getApiAuthHeaders()
          },
          credentials: 'include'
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Failed to sync BigMarker conference (${response.status})`);
      }
      setBigMarkerConferenceDetails(body);
      showToast('BigMarker conference details synced.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to sync BigMarker conference details.', 'error');
    } finally {
      setIsSyncingBigMarkerDetails(false);
    }
  };

  const renderBigMarkerConferenceDetailsCard = () => {
    if (integrationConfig.type !== 'bigmarker') return null;
    const conferenceId = String(integrationConfig.platformId || '').trim();
    return (
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700">BigMarker Sync</h4>
          <button
            type="button"
            onClick={handleSyncBigMarkerConferenceDetails}
            disabled={isSyncingBigMarkerDetails || !conferenceId}
            className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded border border-indigo-200 disabled:opacity-50"
          >
            {isSyncingBigMarkerDetails ? 'Syncing...' : 'Sync via API'}
          </button>
        </div>
        <p className="text-xs text-slate-600">
          Conference ID: <span className="font-mono">{conferenceId || 'Missing'}</span>
        </p>
        {bigMarkerConferenceDetails ? (
          <div className="space-y-1 text-xs text-slate-600 break-all">
            <p>Title: <span className="font-medium text-slate-800">{bigMarkerConferenceDetails.title || 'N/A'}</span></p>
            <p>Status: <span className="font-medium text-slate-800">{bigMarkerConferenceDetails.status || 'N/A'}</span></p>
            <p>Start Time: <span className="font-medium text-slate-800">{bigMarkerConferenceDetails.starts_at || 'N/A'}</span></p>
            <p>Timezone: <span className="font-medium text-slate-800">{bigMarkerConferenceDetails.timezone || 'N/A'}</span></p>
            <p>Host: <span className="font-medium text-slate-800">{bigMarkerConferenceDetails.host_name || 'N/A'}</span></p>
            <p>Webinar URL: <a className="text-indigo-600 underline" href={bigMarkerConferenceDetails.webinar_url} target="_blank" rel="noreferrer">{bigMarkerConferenceDetails.webinar_url || 'N/A'}</a></p>
            <p>Registration URL: <a className="text-indigo-600 underline" href={bigMarkerConferenceDetails.registration_url} target="_blank" rel="noreferrer">{bigMarkerConferenceDetails.registration_url || 'N/A'}</a></p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No synced BigMarker conference details yet.</p>
        )}
      </div>
    );
  };

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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full max-w-4xl mb-8">
            <button
              onClick={() => applyIntegrationSwitch('zoom')}
              className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'zoom' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">Zoom</span>
              <span className="text-xs text-slate-500">API Integration</span>
            </button>
            <button
              onClick={() => applyIntegrationSwitch('bigmarker')}
              className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'bigmarker' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">BigMarker</span>
              <span className="text-xs text-slate-500">API Integration</span>
            </button>
            <button
              onClick={() => applyIntegrationSwitch('custom')}
              className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'custom' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-cyan-500 text-white rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">Custom Webinar</span>
              <span className="text-xs text-slate-500">White Label / External</span>
            </button>
            <button
              onClick={() => applyIntegrationSwitch('email')}
              className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'email' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <span className="font-semibold text-slate-800">No-Code / Email</span>
              <span className="text-xs text-slate-500">SMTP / SendGrid</span>
            </button>
          </div>

          {(integrationConfig.type === 'zoom' || integrationConfig.type === 'bigmarker' || integrationConfig.type === 'custom') && (
            <div className="w-full max-w-md mb-8 animate-fadeIn space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {integrationConfig.type === 'zoom'
                    ? 'Zoom Webinar ID'
                    : integrationConfig.type === 'bigmarker'
                      ? 'BigMarker Conference ID'
                      : 'Custom Webinar ID / External Reference'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={integrationConfig.platformId || ''}
                    onChange={(e) => setIntegrationConfig({ ...integrationConfig, platformId: e.target.value })}
                    placeholder={integrationConfig.type === 'custom' ? 'e.g., webinar-2026-02 or ext-12345' : 'e.g., 123456789'}
                    className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              {integrationConfig.type === 'custom' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Custom Provider Name
                    </label>
                    <input
                      type="text"
                      value={integrationConfig.platformSettings?.customProviderName || ''}
                      onChange={(e) => setIntegrationConfig({
                        ...integrationConfig,
                        platformSettings: {
                          ...(integrationConfig.platformSettings || {}),
                          customProviderName: e.target.value
                        }
                      })}
                      placeholder="e.g., My Webinar Cloud"
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      External Webinar URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={integrationConfig.platformSettings?.customPlatformUrl || ''}
                      onChange={(e) => setIntegrationConfig({
                        ...integrationConfig,
                        platformSettings: {
                          ...(integrationConfig.platformSettings || {}),
                          customPlatformUrl: e.target.value
                        }
                      })}
                      placeholder="https://yourwebinar.com/live/abc123"
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {integrationConfig.type === 'bigmarker' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    BigMarker API Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={bigMarkerApiKey}
                      onChange={(e) => setBigMarkerApiKey(e.target.value)}
                      placeholder="Enter API Key to enable sync..."
                      className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Key is saved safely in database.json
                  </p>
                </div>
              )}

              {(integrationConfig.type === 'bigmarker' || integrationConfig.type === 'zoom' || integrationConfig.type === 'custom') && (
                renderRegistrationFieldsEditor(
                  `Click "Sync Fields" to refresh registration fields from ${integrationConfig.type === 'zoom' ? 'Zoom' : integrationConfig.type === 'bigmarker' ? 'BigMarker' : 'your custom webinar schema'}.`
                )
              )}
            </div>
          )}
          {integrationConfig.type === 'zoom' && (
            <div className="w-full max-w-md mb-8 animate-fadeIn">
              {renderZoomMeetingDetailsCard()}
            </div>
          )}
          {integrationConfig.type === 'bigmarker' && (
            <div className="w-full max-w-md mb-8 animate-fadeIn">
              {renderBigMarkerConferenceDetailsCard()}
            </div>
          )}

          <button
            onClick={() => onGenerateWebsite()}
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
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-800">Website Preview</h3>
              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {integrationConfig.type === 'email' ? 'Email Form' : `${getIntegrationLabel(integrationConfig.type)} Integrated`}
              </span>
              {integrationConfig.type === 'zoom' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  integrationConfig.platformId
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {integrationConfig.platformId
                    ? `Zoom Meeting Linked (${integrationConfig.platformId})`
                    : 'Zoom Meeting Missing'}
                </span>
              )}
              {integrationConfig.type === 'bigmarker' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  integrationConfig.platformId
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {integrationConfig.platformId
                    ? `BigMarker Conference Linked (${integrationConfig.platformId})`
                    : 'BigMarker Conference Missing'}
                </span>
              )}
              {integrationConfig.type === 'custom' && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  integrationConfig.platformId
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {integrationConfig.platformId
                    ? `Custom Webinar Linked (${integrationConfig.platformId})`
                    : 'Custom Webinar Reference Missing'}
                </span>
              )}
            </div>
          </div>

          {!showCode && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-800">Landing Page Content</h4>
                {isEditingLandingDetails && (
                  <span className="text-xs text-indigo-600 font-medium">Saving regenerates the page preview</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Headline</label>
                  <input
                    type="text"
                    disabled={!isEditingLandingDetails}
                    value={landingDraft.title}
                    onChange={(e) => setLandingDraft({ ...landingDraft, title: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tagline</label>
                  <input
                    type="text"
                    disabled={!isEditingLandingDetails}
                    value={landingDraft.marketingTagline}
                    onChange={(e) => setLandingDraft({ ...landingDraft, marketingTagline: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                  <textarea
                    disabled={!isEditingLandingDetails}
                    value={landingDraft.description}
                    onChange={(e) => setLandingDraft({ ...landingDraft, description: e.target.value })}
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date Label</label>
                  <input
                    type="text"
                    disabled={!isEditingLandingDetails}
                    value={landingDraft.date}
                    onChange={(e) => setLandingDraft({ ...landingDraft, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Platform / Location</label>
                  <input
                    type="text"
                    disabled={!isEditingLandingDetails}
                    value={landingDraft.location}
                    onChange={(e) => setLandingDraft({ ...landingDraft, location: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Integration Settings Panel */}
          {showIntegrationSettings && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                Integration Settings
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <button
                  onClick={() => applyIntegrationSwitch('zoom')}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'zoom' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  <div className="w-10 h-10 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                    <Video className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-slate-800">Zoom</span>
                  <span className="text-xs text-slate-500">API Integration</span>
                </button>
                <button
                  onClick={() => applyIntegrationSwitch('bigmarker')}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'bigmarker' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  <div className="w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center">
                    <Video className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-slate-800">BigMarker</span>
                  <span className="text-xs text-slate-500">API Integration</span>
                </button>
                <button
                  onClick={() => applyIntegrationSwitch('custom')}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'custom' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  <div className="w-10 h-10 bg-cyan-500 text-white rounded-lg flex items-center justify-center">
                    <Globe className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-slate-800">Custom Webinar</span>
                  <span className="text-xs text-slate-500">White Label / External</span>
                </button>
                <button
                  onClick={() => applyIntegrationSwitch('email')}
                  className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all ${integrationConfig.type === 'email' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  <div className="w-10 h-10 bg-green-500 text-white rounded-lg flex items-center justify-center">
                    <Mail className="w-6 h-6" />
                  </div>
                  <span className="font-semibold text-slate-800">No-Code / Email</span>
                  <span className="text-xs text-slate-500">SMTP / SendGrid</span>
                </button>
              </div>

              {(integrationConfig.type === 'zoom' || integrationConfig.type === 'bigmarker' || integrationConfig.type === 'custom') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {integrationConfig.type === 'zoom'
                      ? 'Zoom Webinar ID'
                      : integrationConfig.type === 'bigmarker'
                        ? 'BigMarker Conference ID'
                        : 'Custom Webinar ID / External Reference'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={integrationConfig.platformId || ''}
                      onChange={(e) => setIntegrationConfig({ ...integrationConfig, platformId: e.target.value })}
                      placeholder={integrationConfig.type === 'custom' ? 'e.g., webinar-2026-02 or ext-12345' : 'e.g., 123456789'}
                      className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}
              {integrationConfig.type === 'custom' && (
                <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Custom Provider Name
                    </label>
                    <input
                      type="text"
                      value={integrationConfig.platformSettings?.customProviderName || ''}
                      onChange={(e) => setIntegrationConfig({
                        ...integrationConfig,
                        platformSettings: {
                          ...(integrationConfig.platformSettings || {}),
                          customProviderName: e.target.value
                        }
                      })}
                      placeholder="e.g., My Webinar Cloud"
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      External Webinar URL (Optional)
                    </label>
                    <input
                      type="text"
                      value={integrationConfig.platformSettings?.customPlatformUrl || ''}
                      onChange={(e) => setIntegrationConfig({
                        ...integrationConfig,
                        platformSettings: {
                          ...(integrationConfig.platformSettings || {}),
                          customPlatformUrl: e.target.value
                        }
                      })}
                      placeholder="https://yourwebinar.com/live/abc123"
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
              {integrationConfig.type === 'zoom' && (
                <div className="mb-4">
                  {renderZoomMeetingDetailsCard()}
                </div>
              )}
              {integrationConfig.type === 'bigmarker' && (
                <div className="mb-4">
                  {renderBigMarkerConferenceDetailsCard()}
                </div>
              )}

              {(integrationConfig.type === 'bigmarker') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    BigMarker API Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={bigMarkerApiKey}
                      onChange={(e) => setBigMarkerApiKey(e.target.value)}
                      placeholder="Enter API Key..."
                      className="w-full border border-slate-300 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              )}

              {(integrationConfig.type === 'zoom' || integrationConfig.type === 'bigmarker' || integrationConfig.type === 'custom') && (
                <div className="mb-4">
                  {renderRegistrationFieldsEditor(
                    `Sync fields before regenerating so landing-page form matches ${integrationConfig.type === 'zoom' ? 'Zoom' : integrationConfig.type === 'bigmarker' ? 'BigMarker' : 'Custom Webinar'} registration.`
                  )}
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

  const renderRegistrants = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden animate-fadeIn">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-800">Registered Users</h3>
        <span className="text-xs font-medium px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full">
          {liveRegistrants.length} Total
        </span>
      </div>
      {liveRegistrants.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">No registrants yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {liveRegistrants.map((reg) => (
            <div key={reg.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">{reg.name}</p>
                <p className="text-sm text-slate-600">{reg.email}</p>
                {reg.company && <p className="text-xs text-slate-500">{reg.company}</p>}
              </div>
              <p className="text-xs text-slate-500">
                {reg.registeredAt ? new Date(reg.registeredAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderUploadedFiles = () => {
    const files = Array.isArray(eventPlan.uploadedFiles) ? eventPlan.uploadedFiles : [];
    const palette = Array.isArray(eventPlan.brandPalette) ? eventPlan.brandPalette : [];
    const hasAgendaText = !!String(eventPlan.agendaSourceText || '').trim();
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Files</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">File Type</label>
              <select
                value={newUploadedFileKind}
                onChange={(e) => setNewUploadedFileKind(e.target.value as 'agenda' | 'deck')}
                className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="agenda">Agenda</option>
                <option value="deck">Deck</option>
              </select>
            </div>
            <div className="md:col-span-3 flex items-end gap-2">
              <button
                type="button"
                onClick={() => uploadedFileInputRef.current?.click()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Upload File
              </button>
              <input
                ref={uploadedFileInputRef}
                type="file"
                className="hidden"
                onChange={handleUploadedFilesInputChange}
                multiple
              />
              <p className="text-xs text-slate-500 self-center">Adds metadata to event assets list.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Link Name (Optional)</label>
              <input
                type="text"
                value={newUploadedLinkName}
                onChange={(e) => setNewUploadedLinkName(e.target.value)}
                placeholder="Slides Folder"
                className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">File URL</label>
              <input
                type="url"
                value={newUploadedLinkUrl}
                onChange={(e) => setNewUploadedLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddUploadedLink}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Uploaded Assets</h3>
          {files.length === 0 ? (
            <p className="text-sm text-slate-500">No uploaded files captured for this meeting yet.</p>
          ) : (
            <div className="space-y-3">
              {files.map((file) => (
                <div key={file.id} className="border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {file.kind.toUpperCase()} • {file.source.toUpperCase()}
                      {file.mimeType ? ` • ${file.mimeType}` : ''}
                      {typeof file.sizeBytes === 'number' ? ` • ${(file.sizeBytes / 1024).toFixed(1)} KB` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleDownloadUploadedFile(file)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Download
                    </button>
                    {file.url && (
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                        Open Link
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveUploadedFile(String(file.id))}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Detected Brand Colors</h3>
          {palette.length === 0 ? (
            <p className="text-sm text-slate-500">No brand colors detected yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {palette.map((color) => (
                <span key={color} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white">
                  <span className="inline-block w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                  {color}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Agenda Source Snapshot</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {hasAgendaText ? String(eventPlan.agendaSourceText).slice(0, 2000) : 'No agenda source text captured.'}
          </p>
        </div>
      </div>
    );
  };

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
            Event Details
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
            onClick={() => setActiveTab('files')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'files' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Upload className="w-5 h-5" />
            Uploaded Files
          </button>
          <button
            onClick={() => setActiveTab('website')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'website' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Globe className="w-5 h-5" />
            Landing Page
          </button>
          {activeTab === 'website' && (
            <div className="ml-9 -mt-1 mb-1 space-y-1">
              <button
                onClick={async () => {
                  const url = getLandingSubdomainUrl();
                  if (!url) return;
                  try {
                    await navigator.clipboard.writeText(url);
                    showToast('Landing page subdomain URL copied.', 'success');
                  } catch (_e) {
                    showToast(url, 'success');
                  }
                }}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                title={getLandingSubdomainUrl()}
              >
                <Globe className="w-3.5 h-3.5" /> Subdomain URL
              </button>
              <button
                onClick={() => setShowIntegrationSettings(!showIntegrationSettings)}
                className={`w-full text-left px-3 py-1.5 rounded-md text-xs flex items-center gap-2 ${
                  showIntegrationSettings
                    ? 'bg-indigo-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Settings
              </button>
              {!showCode && (
                <>
                  <button
                    onClick={() => {
                      if (isEditingLandingDetails) {
                        handleSaveLandingDetails();
                      } else {
                        setIsEditingLandingDetails(true);
                      }
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-xs flex items-center gap-2 ${
                      isEditingLandingDetails
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {isEditingLandingDetails ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                    {isEditingLandingDetails ? 'Save Landing' : 'Edit Landing'}
                  </button>
                  {isEditingLandingDetails && (
                    <button
                      onClick={handleCancelLandingDetails}
                      className="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel Edit
                    </button>
                  )}
                </>
              )}
              {showCode && (
                <button
                  onClick={() => {
                    if (isEditingHtml) {
                      handleSaveHtml();
                    } else {
                      setIsEditingHtml(true);
                    }
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-xs flex items-center gap-2 ${
                    isEditingHtml
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {isEditingHtml ? <Save className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  {isEditingHtml ? 'Save HTML' : 'Edit HTML'}
                </button>
              )}
              <button
                onClick={() => setShowCode(!showCode)}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Code className="w-3.5 h-3.5" /> {showCode ? 'View Preview' : 'View Code'}
              </button>
              <button
                onClick={handleDownloadHtml}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" /> Download HTML
              </button>
              <button
                onClick={() => {
                  const subdomainUrl = getLandingSubdomainUrl();
                  const win = window.open(subdomainUrl || undefined);
                  if (win && !subdomainUrl) {
                    win.document.write(eventPlan.websiteHtml || '');
                    win.document.close();
                  }
                }}
                className="w-full text-left px-3 py-1.5 rounded-md text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open New Tab
              </button>
            </div>
          )}
          <button
            onClick={() => setActiveTab('registrants')}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-all ${activeTab === 'registrants' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            <Users className="w-5 h-5" />
            Registered Users
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
            {activeTab === 'files' && renderUploadedFiles()}
            {activeTab === 'website' && renderWebsite()}
            {activeTab === 'registrants' && renderRegistrants()}
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

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-bounce-in ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
          <div className="bg-white/20 p-1 rounded-full">
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <span className="font-bold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:bg-white/20 rounded-full p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
