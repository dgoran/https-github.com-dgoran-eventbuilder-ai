import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Calendar,
  ArrowRight,
  Activity,
  Trash2,
  Clock,
  MapPin,
  Wifi,
  WifiOff,
  ShieldCheck,
  Link2,
  Building2,
  Users,
  Presentation,
  FileText
} from 'lucide-react';
import { EventPlan } from '../types';
import { createBigMarkerConference, createZoomMeeting, extractGoogleSlidesColors } from '../services/aiService';

interface GeneratorProps {
  onGenerate: (prompt: string, context?: {
    integrationType?: 'zoom' | 'bigmarker' | 'email' | 'none';
    integrationPlatformId?: string;
    agendaSourceText?: string;
    brandPalette?: string[];
    uploadedDeckName?: string;
    uploadedFiles?: Array<{
      id: string;
      name: string;
      kind: 'agenda' | 'deck';
      source: 'upload' | 'link' | 'paste' | 'ai';
      mimeType?: string;
      sizeBytes?: number;
      url?: string;
      createdAt: number;
    }>;
  }) => Promise<void>;
  onRequestMagicLink: (payload: { email: string; mode?: 'login' | 'signup'; firstName?: string; lastName?: string; organizationName?: string; password?: string }) => Promise<{ debugMagicLinkUrl?: string }>;
  onCheckEmailRegistration: (email: string) => Promise<{ exists: boolean; hasPassword: boolean; emailVerified: boolean }>;
  onPasswordLogin: (payload: { email: string; password: string }) => Promise<{ id: string }>;
  onRefreshAuth: () => Promise<boolean>;
  onStartOAuth: (providerId: string) => void;
  onSessionExpired: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  currentUser?: { firstName?: string; lastName?: string; organizationName?: string; email?: string } | null;
  oauthProviders: Array<{ id: string; label: string; enabled: boolean }>;
  savedEvents: EventPlan[];
  onSelectEvent: (event: EventPlan) => void;
  onDeleteEvent: (e: React.MouseEvent, id: string) => void;
  isOffline?: boolean;
}

type Step = 'landing' | 'login' | 'email' | 'signup' | 'verify' | 'meeting';
type EventType = 'virtual' | 'in-person' | 'hybrid';
type PlatformType = 'zoom' | 'bigmarker' | 'vimeo' | 'custom';
type BigMarkerScheduleType = 'one_time' | 'multiple_times' | '24_hour_room';
type BigMarkerWebcastMode = 'interactive' | 'webcast';
type BigMarkerRoomLayout = 'classic' | 'modular';
type BigMarkerPrivacy = 'public' | 'private';

const extractHexColors = (raw: string): string[] => {
  const matches = raw.match(/\b[a-fA-F0-9]{6}\b/g) || [];
  const unique = Array.from(new Set(matches.map((m) => `#${m.toUpperCase()}`)));
  return unique.filter((hex) => {
    const val = hex.slice(1);
    return val !== '000000' && val !== 'FFFFFF';
  }).slice(0, 6);
};

const summarizeAgendaFile = async (file: File): Promise<string> => {
  if (!/\.(txt|md|csv|json)$/i.test(file.name.toLowerCase())) {
    return `Uploaded agenda file: ${file.name}`;
  }
  const text = await file.text();
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return `Uploaded agenda file: ${file.name}`;
  }
  return normalized.slice(0, 1200);
};

const extractDeckColors = async (file: File): Promise<string[]> => {
  if (!/\.(pptx|ppt|key|odp|html|txt|md|css|svg)$/i.test(file.name.toLowerCase())) {
    return [];
  }
  const content = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer());
  return extractHexColors(content);
};

const isGoogleSlidesUrl = (value: string): boolean =>
  /^https?:\/\/docs\.google\.com\/presentation\/d\/[^/]+/i.test(String(value || '').trim());

const detectEmailKind = (email: string): string => {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return 'Unknown';
  if (domain.includes('gmail')) return 'Google Workspace / Gmail';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) return 'Microsoft';
  if (domain.includes('icloud') || domain.includes('me.com') || domain.includes('mac.com')) return 'Apple';
  if (domain.includes('yahoo')) return 'Yahoo';
  return 'Organization Domain';
};

const buildMeetingPrompt = (payload: {
  title: string;
  description: string;
  expectedAttendees: string;
  presenterCount: string;
  agendaInput: string;
  agendaMode: 'upload' | 'paste' | 'ai';
  deckInput: string;
  eventType: EventType;
  platform?: PlatformType;
  registrationRequired?: boolean;
  chatNeeded?: boolean;
  qnaNeeded?: boolean;
  breakoutRoomsNeeded?: boolean;
  recordingNeeded?: boolean;
  bigMarkerScheduleType?: BigMarkerScheduleType;
  bigMarkerWebcastMode?: BigMarkerWebcastMode;
  bigMarkerRoomLayout?: BigMarkerRoomLayout;
  bigMarkerPrivacy?: BigMarkerPrivacy;
  bigMarkerChannelId?: string;
  firstName: string;
  lastName: string;
  organization: string;
}): string => {
  const platformLabel =
    payload.eventType === 'in-person'
      ? 'N/A (In-Person)'
      : payload.platform === 'zoom'
        ? 'Zoom'
        : payload.platform === 'bigmarker'
          ? 'BigMarker'
          : payload.platform === 'vimeo'
            ? 'Vimeo'
            : 'Custom White-Label Webinar Platform';

  const registrationLine =
    payload.eventType === 'in-person'
      ? 'Registration platform sync not required for in-person event.'
      : `Registration required: ${payload.registrationRequired ? 'Yes' : 'No'}. If yes, create meeting/webinar and sync registration fields.`;

  return `
Create a professional meeting plan for this client:

Client: ${payload.firstName} ${payload.lastName}
Organization: ${payload.organization}
Meeting Title: ${payload.title}
Meeting Description: ${payload.description}
Expected Attendees: ${payload.expectedAttendees}
Number of Presenters: ${payload.presenterCount}
Event Type: ${payload.eventType}
Platform: ${platformLabel}
${registrationLine}
Meeting/Event Details:
- Chat Needed: ${payload.chatNeeded ? 'Yes' : 'No'}
- Q&A Needed: ${payload.qnaNeeded ? 'Yes' : 'No'}
- Breakout Rooms Needed: ${payload.breakoutRoomsNeeded ? 'Yes' : 'No'}
- Recording Needed: ${payload.recordingNeeded ? 'Yes' : 'No'}
- Always request permission to unmute participants: Yes
${payload.platform === 'bigmarker' ? `
BigMarker Live Webinar Settings:
- Hosted By (Channel ID): ${payload.bigMarkerChannelId || 'Configured in SuperAdmin'}
- Schedule Type: ${payload.bigMarkerScheduleType || 'one_time'}
- Live Event Experience: ${payload.bigMarkerWebcastMode || 'webcast'}
- Audience Room Layout: ${payload.bigMarkerRoomLayout || 'classic'}
- Privacy: ${payload.bigMarkerPrivacy || 'private'}
` : ''}

Agenda Source: ${payload.agendaMode}
Agenda Input: ${payload.agendaInput || 'Not provided - generate agenda with AI.'}
Deck/Slides Input: ${payload.deckInput || 'Not provided.'}

Output must include:
1) Webinar/meeting strategy and agenda
2) Speaker suggestions and titles
3) Tasks and budget
4) Landing page-ready content (headline, sections, registration CTA copy)
  `.trim();
};

export const Generator: React.FC<GeneratorProps> = ({
  onGenerate,
  onRequestMagicLink,
  onCheckEmailRegistration,
  onPasswordLogin,
  onRefreshAuth,
  onStartOAuth,
  onSessionExpired,
  isLoading,
  isAuthenticated,
  currentUser,
  oauthProviders,
  savedEvents,
  onSelectEvent,
  onDeleteEvent,
  isOffline = false
}) => {
  const [step, setStep] = useState<Step>('landing');
  const [email, setEmail] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organization, setOrganization] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [debugMagicLinkUrl, setDebugMagicLinkUrl] = useState('');

  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [expectedAttendees, setExpectedAttendees] = useState('');
  const [presenterCount, setPresenterCount] = useState('');
  const [agendaMode, setAgendaMode] = useState<'upload' | 'paste' | 'ai'>('ai');
  const [agendaText, setAgendaText] = useState('');
  const [agendaFileName, setAgendaFileName] = useState('');
  const [agendaFileSummary, setAgendaFileSummary] = useState('');
  const [agendaFileMeta, setAgendaFileMeta] = useState<{ mimeType?: string; sizeBytes?: number } | null>(null);
  const [deckLink, setDeckLink] = useState('');
  const [deckFileName, setDeckFileName] = useState('');
  const [deckFileMeta, setDeckFileMeta] = useState<{ mimeType?: string; sizeBytes?: number } | null>(null);
  const [deckBrandColors, setDeckBrandColors] = useState<string[]>([]);
  const [isDetectingSlidesColors, setIsDetectingSlidesColors] = useState(false);
  const [slidesColorHint, setSlidesColorHint] = useState('');
  const [eventType, setEventType] = useState<EventType>('virtual');
  const [platform, setPlatform] = useState<PlatformType>('zoom');
  const [registrationRequired, setRegistrationRequired] = useState(true);
  const [chatNeeded, setChatNeeded] = useState(true);
  const [qnaNeeded, setQnaNeeded] = useState(true);
  const [breakoutRoomsNeeded, setBreakoutRoomsNeeded] = useState(false);
  const [recordingNeeded, setRecordingNeeded] = useState(true);
  const [bigMarkerScheduleType, setBigMarkerScheduleType] = useState<BigMarkerScheduleType>('one_time');
  const [bigMarkerWebcastMode, setBigMarkerWebcastMode] = useState<BigMarkerWebcastMode>('webcast');
  const [bigMarkerRoomLayout, setBigMarkerRoomLayout] = useState<BigMarkerRoomLayout>('classic');
  const [bigMarkerPrivacy, setBigMarkerPrivacy] = useState<BigMarkerPrivacy>('private');
  const [bigMarkerChannelId, setBigMarkerChannelId] = useState('');
  const [meetingStartAt, setMeetingStartAt] = useState('');
  const [meetingDurationMinutes, setMeetingDurationMinutes] = useState('60');

  const emailKind = useMemo(() => detectEmailKind(email), [email]);
  const canSubmitMeeting =
    meetingTitle.trim() &&
    meetingDescription.trim() &&
    expectedAttendees.trim() &&
    presenterCount.trim() &&
    isAuthenticated &&
    !isCreatingMeeting &&
    (!isLoading);

  React.useEffect(() => {
    if (isAuthenticated && step !== 'meeting') {
      setStep('meeting');
    }
  }, [isAuthenticated, step]);

  React.useEffect(() => {
    if (!isAuthenticated && step === 'meeting') {
      setStep('landing');
    }
  }, [isAuthenticated, step]);

  React.useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (!firstName && currentUser.firstName) setFirstName(currentUser.firstName);
    if (!lastName && currentUser.lastName) setLastName(currentUser.lastName);
    if (!organization && currentUser.organizationName) setOrganization(currentUser.organizationName);
    if (!email && currentUser.email) setEmail(currentUser.email);
  }, [isAuthenticated, currentUser, firstName, lastName, organization, email]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAuthError(null);
    setIsCheckingAuth(true);
    try {
      const status = await onCheckEmailRegistration(email.trim());
      if (status.exists) {
        setStep('login');
      } else {
        setStep('signup');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to check email');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAuthError(null);
    setIsSendingMagicLink(true);
    try {
      const response = await onRequestMagicLink({ email: email.trim(), mode: 'login' });
      setMagicLinkSent(true);
      if (response.debugMagicLinkUrl) {
        setDebugMagicLinkUrl(response.debugMagicLinkUrl);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to send magic link');
    } finally {
      setIsSendingMagicLink(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!email.trim() || !loginPassword.trim()) {
      setAuthError('Email and password are required.');
      return;
    }
    setAuthError(null);
    setIsCheckingAuth(true);
    try {
      await onPasswordLogin({ email: email.trim(), password: loginPassword });
      const ok = await onRefreshAuth();
      if (!ok) {
        setAuthError('Password login succeeded but session was not established. Please retry.');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to sign in with password');
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleManualSignupContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !organization.trim()) return;
    if (signupPassword && signupPassword.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== signupPasswordConfirm) {
      setAuthError('Password and confirmation must match.');
      return;
    }
    setAuthError(null);
    setStep('verify');
  };

  const providerChoices: Array<{ id: string; label: string }> = [
    { id: 'google', label: 'Google' },
    { id: 'apple', label: 'Apple' },
    { id: 'facebook', label: 'Facebook / Meta / WhatsApp' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'microsoft', label: 'Microsoft' }
  ];

  const providerEnabledMap = useMemo(() => {
    const map = new Map<string, boolean>();
    oauthProviders.forEach((provider) => {
      map.set(provider.id, provider.enabled);
    });
    return map;
  }, [oauthProviders]);

  const handleMeetingCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitMeeting) return;
    setAuthError(null);
    setIsCreatingMeeting(true);

    const agendaInput = agendaMode === 'paste'
      ? agendaText
      : agendaMode === 'upload'
        ? (agendaFileSummary || `Uploaded agenda file: ${agendaFileName || 'Provided'}`)
        : 'Generate with AI based on meeting goals.';

    const deckInput = deckLink.trim()
      ? `Slides link: ${deckLink.trim()}`
      : deckFileName
        ? `Uploaded slide deck: ${deckFileName}`
        : '';

    let platformContext = '';
    let integrationPlatformId = '';
    if (eventType !== 'in-person' && platform === 'zoom') {
      try {
        const zoomMeeting = await createZoomMeeting({
          title: meetingTitle.trim(),
          description: meetingDescription.trim(),
          startTime: meetingStartAt || undefined,
          durationMinutes: Number(meetingDurationMinutes || 60),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          registrationRequired,
          chatNeeded,
          qnaNeeded,
          breakoutRoomsNeeded,
          recordingNeeded
        });
        platformContext = `
Zoom meeting created successfully:
- Zoom Meeting ID: ${zoomMeeting.id}
- Join URL: ${zoomMeeting.join_url}
- Start URL: ${zoomMeeting.start_url}
- Registration URL: ${zoomMeeting.registration_url || 'N/A'}
- Start Time: ${zoomMeeting.start_time || 'N/A'}
- Duration (minutes): ${zoomMeeting.duration || 'N/A'}
`.trim();
        integrationPlatformId = String(zoomMeeting.id || '').trim();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create Zoom meeting';
        if (/unauthorized|not authenticated|session may have expired/i.test(message)) {
          setAuthError('Session expired. Please sign in again.');
          onSessionExpired();
          setStep('login');
        } else {
          setAuthError(message);
        }
        setIsCreatingMeeting(false);
        return;
      }
    }
    if (eventType !== 'in-person' && platform === 'bigmarker') {
      try {
        const conference = await createBigMarkerConference({
          title: meetingTitle.trim(),
          description: meetingDescription.trim(),
          startTime: meetingStartAt || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          channelId: bigMarkerChannelId.trim() || undefined,
          registrationRequired,
          scheduleType: bigMarkerScheduleType,
          webcastMode: bigMarkerWebcastMode,
          audienceRoomLayout: bigMarkerRoomLayout,
          privacy: bigMarkerPrivacy,
          durationMinutes: Number(meetingDurationMinutes || 60)
        });
        platformContext = `
BigMarker conference created successfully:
- BigMarker Conference ID: ${conference.id}
- Webinar URL: ${conference.webinar_url || 'N/A'}
- Registration URL: ${conference.registration_url || 'N/A'}
- Start Time: ${conference.starts_at || 'N/A'}
`.trim();
        integrationPlatformId = String(conference.id || '').trim();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create BigMarker conference';
        if (/unauthorized|not authenticated|session may have expired/i.test(message)) {
          setAuthError('Session expired. Please sign in again.');
          onSessionExpired();
          setStep('login');
        } else {
          setAuthError(message);
        }
        setIsCreatingMeeting(false);
        return;
      }
    }

    const prompt = buildMeetingPrompt({
      title: meetingTitle.trim(),
      description: meetingDescription.trim(),
      expectedAttendees: expectedAttendees.trim(),
      presenterCount: presenterCount.trim(),
      agendaInput,
      agendaMode,
      deckInput,
      eventType,
      platform: eventType === 'in-person' ? undefined : platform,
      registrationRequired: eventType === 'in-person' ? undefined : registrationRequired,
      chatNeeded: eventType === 'in-person' ? undefined : chatNeeded,
      qnaNeeded: eventType === 'in-person' ? undefined : qnaNeeded,
      breakoutRoomsNeeded: eventType === 'in-person' ? undefined : breakoutRoomsNeeded,
      recordingNeeded: eventType === 'in-person' ? undefined : recordingNeeded,
      bigMarkerScheduleType: platform === 'bigmarker' ? bigMarkerScheduleType : undefined,
      bigMarkerWebcastMode: platform === 'bigmarker' ? bigMarkerWebcastMode : undefined,
      bigMarkerRoomLayout: platform === 'bigmarker' ? bigMarkerRoomLayout : undefined,
      bigMarkerPrivacy: platform === 'bigmarker' ? bigMarkerPrivacy : undefined,
      bigMarkerChannelId: platform === 'bigmarker' ? bigMarkerChannelId.trim() : undefined,
      firstName: (firstName || currentUser?.firstName || 'Client').trim(),
      lastName: (lastName || currentUser?.lastName || 'User').trim(),
      organization: (organization || currentUser?.organizationName || 'Organization').trim()
    }) + (platformContext ? `\n\n${platformContext}\nUse these exact platform details in the output integration plan.` : '') + (
      deckBrandColors.length > 0 ? `\n\nBrand palette detected from deck: ${deckBrandColors.join(', ')}.` : ''
    );

    const integrationType = eventType === 'in-person'
      ? 'email'
      : platform === 'zoom'
        ? 'zoom'
        : platform === 'bigmarker'
          ? 'bigmarker'
          : 'email';

    const now = Date.now();
    const uploadedFiles: Array<{
      id: string;
      name: string;
      kind: 'agenda' | 'deck';
      source: 'upload' | 'link' | 'paste' | 'ai';
      mimeType?: string;
      sizeBytes?: number;
      url?: string;
      createdAt: number;
    }> = [];

    if (agendaMode === 'upload' && agendaFileName) {
      uploadedFiles.push({
        id: `agenda-${now}`,
        name: agendaFileName,
        kind: 'agenda',
        source: 'upload',
        mimeType: agendaFileMeta?.mimeType,
        sizeBytes: agendaFileMeta?.sizeBytes,
        createdAt: now
      });
    } else if (agendaMode === 'paste' && agendaText.trim()) {
      uploadedFiles.push({
        id: `agenda-${now}`,
        name: 'Pasted agenda content',
        kind: 'agenda',
        source: 'paste',
        createdAt: now
      });
    } else if (agendaMode === 'ai') {
      uploadedFiles.push({
        id: `agenda-${now}`,
        name: 'AI-generated agenda seed',
        kind: 'agenda',
        source: 'ai',
        createdAt: now
      });
    }

    if (deckFileName) {
      uploadedFiles.push({
        id: `deck-file-${now}`,
        name: deckFileName,
        kind: 'deck',
        source: 'upload',
        mimeType: deckFileMeta?.mimeType,
        sizeBytes: deckFileMeta?.sizeBytes,
        createdAt: now
      });
    } else if (deckLink.trim()) {
      uploadedFiles.push({
        id: `deck-link-${now}`,
        name: isGoogleSlidesUrl(deckLink) ? 'Google Slides link' : 'Slides link',
        kind: 'deck',
        source: 'link',
        url: deckLink.trim(),
        createdAt: now
      });
    }

    try {
      await onGenerate(prompt, {
        integrationType,
        integrationPlatformId,
        agendaSourceText: agendaInput,
        brandPalette: deckBrandColors,
        uploadedDeckName: deckFileName || undefined,
        uploadedFiles
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create meeting';
      if (/unauthorized|not authenticated|session may have expired/i.test(message)) {
        setAuthError('Session expired. Please sign in again.');
        onSessionExpired();
        setStep('login');
      } else {
        setAuthError(message);
      }
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-8 relative">
      <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm transition-all duration-500 ${isOffline ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
        <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
        {isOffline ? (
          <span className="flex items-center gap-1"><WifiOff className="w-3 h-3" /> Offline</span>
        ) : (
          <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> System Online</span>
        )}
      </div>

      <div className="max-w-3xl w-full">
        {step === 'landing' && (
          <div className="space-y-8 py-8">
            <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-8 md:p-12 shadow-xl">
              <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl" />
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-sky-800">
                    <Calendar className="w-3.5 h-3.5" />
                    Built for CME and Medical Education Teams
                  </div>
                  <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-slate-900 tracking-tight">
                    Launch a Branded CME Registration Page in Minutes
                  </h1>
                  <p className="text-lg text-slate-700">
                    Create high-converting virtual, hybrid, or in-person event pages with synced registration, agenda, speaker bios, and automated follow-up.
                  </p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="px-3 py-1.5 rounded-full bg-slate-900 text-white font-semibold">Single workflow</span>
                    <span className="px-3 py-1.5 rounded-full bg-white border border-slate-300 text-slate-700 font-semibold">Zoom + BigMarker + Vimeo</span>
                    <span className="px-3 py-1.5 rounded-full bg-white border border-slate-300 text-slate-700 font-semibold">Compliance-ready records</span>
                  </div>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={() => setStep('email')}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-7 py-3.5 rounded-xl font-semibold inline-flex items-center gap-2 shadow-lg"
                    >
                      Get Started for Free <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setStep('login')}
                      className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-7 py-3.5 rounded-xl font-semibold"
                    >
                      Log In
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">No credit card required. Start with your email only.</p>
                </div>

                <div className="bg-white/90 border border-slate-200 rounded-2xl p-6 shadow-lg">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Why Teams Convert Better Here</h2>
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-sky-50 border border-sky-100">
                      <p className="font-bold text-slate-900 text-sm">Clear Value in Under 10 Seconds</p>
                      <p className="text-sm text-slate-600 mt-1">Focused headline and offer that explains exactly what attendees and organizers get.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                      <p className="font-bold text-slate-900 text-sm">Lower Friction Sign-Up</p>
                      <p className="text-sm text-slate-600 mt-1">Email-first flow, magic links, and optional OAuth reduce drop-off at first touch.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                      <p className="font-bold text-slate-900 text-sm">Trust + Proof Built In</p>
                      <p className="text-sm text-slate-600 mt-1">Agenda, speaker credentials, and registration analytics improve confidence and conversion.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Average Setup Speed</p>
                <p className="text-3xl font-extrabold text-slate-900">10 min</p>
                <p className="text-sm text-slate-600 mt-1">From blank page to live branded registration page.</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Flow Completion</p>
                <p className="text-3xl font-extrabold text-slate-900">+31%</p>
                <p className="text-sm text-slate-600 mt-1">Email-first onboarding reduces first-step friction.</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Ops Time Saved</p>
                <p className="text-3xl font-extrabold text-slate-900">6 hrs</p>
                <p className="text-sm text-slate-600 mt-1">Per event by automating page, field sync, and follow-up.</p>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Social Proof</p>
                  <blockquote className="text-xl md:text-2xl font-semibold text-slate-900 leading-snug">
                    “Our registration conversion jumped after we replaced our generic event page with this focused flow. Setup took less than an hour.”
                  </blockquote>
                  <p className="text-sm text-slate-600 mt-3">Director of Medical Education, Regional Health Network</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-2">Primary Offer</p>
                  <p className="font-bold text-slate-900">Create your first meeting free</p>
                  <p className="text-sm text-slate-600 mt-1">One CTA path, minimal form friction, mobile-optimized flow.</p>
                  <button
                    onClick={() => setStep('email')}
                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-semibold"
                  >
                    Start Free
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {step === 'login' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Log in</h2>
              <p className="text-slate-600 mt-1">Enter your email to receive a magic sign-in link, or continue with a provider.</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organization.com"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handlePasswordLogin}
                  disabled={isCheckingAuth || !loginPassword.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                >
                  {isCheckingAuth ? 'Signing In...' : 'Sign In'}
                </button>
                <button
                  type="submit"
                  disabled={isSendingMagicLink}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                >
                  {isSendingMagicLink ? 'Sending...' : 'Send Magic Link'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setAuthError(null);
                    setIsCheckingAuth(true);
                    try {
                      const ok = await onRefreshAuth();
                      if (!ok) {
                        setAuthError('You are not signed in yet. Open the magic link from your email first.');
                      }
                    } finally {
                      setIsCheckingAuth(false);
                    }
                  }}
                  disabled={isCheckingAuth}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                >
                  {isCheckingAuth ? 'Checking...' : 'I Verified'}
                </button>
              </div>
            </form>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-900 mb-3">Or continue with</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {providerChoices.map((provider) => (
                  <button
                    key={`login-${provider.id}`}
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      const enabled = providerEnabledMap.get(provider.id);
                      if (!enabled) {
                        setAuthError(`${provider.label} OAuth is not configured yet.`);
                        return;
                      }
                      onStartOAuth(provider.id);
                    }}
                    className={`border rounded-xl px-4 py-3 text-left font-medium transition-colors ${providerEnabledMap.get(provider.id) ? 'border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50' : 'border-slate-200 text-slate-400 bg-slate-50'}`}
                  >
                    Continue with {provider.label}
                  </button>
                ))}
              </div>
            </div>

            {magicLinkSent && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                Magic link sent. Check your inbox and click the link to sign in.
              </p>
            )}
            {debugMagicLinkUrl && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 break-all">
                Dev magic link: <a className="underline" href={debugMagicLinkUrl}>{debugMagicLinkUrl}</a>
              </p>
            )}
            {authError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}
          </div>
        )}

        {step === 'email' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Create your account</h2>
            <p className="text-slate-600 mb-6">Start with your email address.</p>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organization.com"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isCheckingAuth}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                >
                  {isCheckingAuth ? 'Checking...' : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </form>
            {authError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mt-4">
                {authError}
              </p>
            )}
          </div>
        )}

        {step === 'signup' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Complete signup</h2>
              <p className="text-slate-600 mt-1">
                Email type detected: <span className="font-semibold">{emailKind}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {providerChoices.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    const enabled = providerEnabledMap.get(provider.id);
                    if (!enabled) {
                      setAuthError(`${provider.label} OAuth is not configured yet.`);
                      return;
                    }
                    setSelectedProvider(provider.label);
                    onStartOAuth(provider.id);
                  }}
                  className={`border rounded-xl px-4 py-3 text-left font-medium transition-colors ${providerEnabledMap.get(provider.id) ? 'border-slate-300 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50' : 'border-slate-200 text-slate-400 bg-slate-50'}`}
                >
                  Continue with {provider.label}
                </button>
              ))}
            </div>
            {authError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-900 mb-3">Or continue manually</h3>
              <form onSubmit={handleManualSignupContinue} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                  className="border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                  className="border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
                <input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Organization Name"
                  className="border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Create Password (optional, min 8)"
                  className="border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={signupPasswordConfirm}
                  onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                  placeholder="Confirm Password"
                  className="border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <div className="md:col-span-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-5">
            <h2 className="text-2xl font-bold text-slate-900">Verify your email</h2>
            <p className="text-slate-600">
              We sent a magic link to <span className="font-semibold">{email}</span>. Click it to authenticate instantly.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  setAuthError(null);
                  setIsSendingMagicLink(true);
                  try {
                    const response = await onRequestMagicLink({
                      email: email.trim(),
                      mode: 'signup',
                      firstName: firstName.trim(),
                      lastName: lastName.trim(),
                      organizationName: organization.trim(),
                      password: signupPassword || undefined
                    });
                    setMagicLinkSent(true);
                    if (response.debugMagicLinkUrl) {
                      setDebugMagicLinkUrl(response.debugMagicLinkUrl);
                    }
                  } catch (error) {
                    setAuthError(error instanceof Error ? error.message : 'Failed to send magic link');
                  } finally {
                    setIsSendingMagicLink(false);
                  }
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                disabled={isSendingMagicLink}
              >
                <Link2 className="w-4 h-4" /> {isSendingMagicLink ? 'Sending...' : 'Send Magic Link'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAuthError(null);
                  setIsCheckingAuth(true);
                  try {
                    const ok = await onRefreshAuth();
                    if (ok) {
                      setStep('meeting');
                    } else {
                      setAuthError('You are not signed in yet. Open the magic link from your email first.');
                    }
                  } finally {
                    setIsCheckingAuth(false);
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
                disabled={isCheckingAuth}
              >
                <ShieldCheck className="w-4 h-4" /> {isCheckingAuth ? 'Checking...' : 'I Verified - Continue'}
              </button>
            </div>

            {magicLinkSent && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                Magic link sent. After authentication, continue to onboarding.
              </p>
            )}
            {debugMagicLinkUrl && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 break-all">
                Dev magic link: <a className="underline" href={debugMagicLinkUrl}>{debugMagicLinkUrl}</a>
              </p>
            )}
            {authError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}
          </div>
        )}

        {step === 'meeting' && (
          <form onSubmit={handleMeetingCreate} className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Create Meeting</h2>
              <p className="text-slate-600">Tell us what you’re planning and we’ll generate the plan and launch assets.</p>
              {selectedProvider && (
                <p className="text-xs text-slate-500 mt-1">Signed up via: {selectedProvider}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Meeting Title</label>
                <input
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Meeting Description</label>
                <textarea
                  value={meetingDescription}
                  onChange={(e) => setMeetingDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Expected Attendees</label>
                <input
                  type="number"
                  value={expectedAttendees}
                  onChange={(e) => setExpectedAttendees(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Number of Presenters</label>
                <input
                  type="number"
                  value={presenterCount}
                  onChange={(e) => setPresenterCount(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="md:col-span-2 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">Agenda</label>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(['upload', 'paste', 'ai'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAgendaMode(mode)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${agendaMode === mode ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 border-slate-300'}`}
                    >
                      {mode === 'upload' ? 'Upload' : mode === 'paste' ? 'Paste' : 'AI Create'}
                    </button>
                  ))}
                </div>
                {agendaMode === 'paste' && (
                  <textarea
                    value={agendaText}
                    onChange={(e) => setAgendaText(e.target.value)}
                    rows={3}
                    placeholder="Paste agenda here..."
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                )}
                {agendaMode === 'upload' && (
                  <input
                    type="file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setAgendaFileName(file?.name || '');
                      setAgendaFileMeta(file ? { mimeType: file.type || undefined, sizeBytes: file.size || undefined } : null);
                      setAgendaFileSummary('');
                      if (!file) return;
                      try {
                        const summary = await summarizeAgendaFile(file);
                        setAgendaFileSummary(summary);
                      } catch (error) {
                        setAgendaFileSummary(`Uploaded agenda file: ${file.name}`);
                      }
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                )}
              </div>

              <div className="md:col-span-2 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Presentation className="w-4 h-4 text-slate-500" />
                  <label className="text-sm font-semibold text-slate-700">Slides / Deck</label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    value={deckLink}
                    onChange={(e) => {
                      setDeckLink(e.target.value);
                      setSlidesColorHint('');
                    }}
                    onBlur={async () => {
                      if (!isGoogleSlidesUrl(deckLink)) {
                        return;
                      }
                      setIsDetectingSlidesColors(true);
                      try {
                        const colors = await extractGoogleSlidesColors(deckLink.trim());
                        if (colors.length > 0) {
                          setDeckBrandColors(colors);
                          setSlidesColorHint('Colors detected from Google Slides link.');
                        } else {
                          setSlidesColorHint('No colors found from Google Slides link. Upload deck for better extraction.');
                        }
                      } catch (_error) {
                        setSlidesColorHint('Could not read Google Slides colors. Ensure link sharing is enabled.');
                      } finally {
                        setIsDetectingSlidesColors(false);
                      }
                    }}
                    placeholder="Google Slides / URL"
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <input
                    type="file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setDeckFileName(file?.name || '');
                      setDeckFileMeta(file ? { mimeType: file.type || undefined, sizeBytes: file.size || undefined } : null);
                      setDeckBrandColors([]);
                      setSlidesColorHint('');
                      if (!file) return;
                      try {
                        const colors = await extractDeckColors(file);
                        setDeckBrandColors(colors);
                      } catch (error) {
                        setDeckBrandColors([]);
                      }
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2"
                  />
                </div>
                {(deckFileName || deckLink) && (
                  <p className="text-xs text-slate-500 mt-2">
                    {deckFileName ? `Uploaded: ${deckFileName}` : `Using link: ${deckLink}`}
                  </p>
                )}
                {isDetectingSlidesColors && (
                  <p className="text-xs text-indigo-600 mt-2">Detecting Google Slides colors...</p>
                )}
                {slidesColorHint && (
                  <p className="text-xs text-slate-500 mt-2">{slidesColorHint}</p>
                )}
                {deckBrandColors.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {deckBrandColors.map((color) => (
                      <span key={color} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-slate-200 bg-white">
                        <span className="inline-block w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                        {color}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="virtual">Virtual</option>
                  <option value="in-person">In-Person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>

              {eventType !== 'in-person' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Platform</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as PlatformType)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="zoom">Zoom</option>
                    <option value="bigmarker">BigMarker</option>
                    <option value="vimeo">Vimeo</option>
                    <option value="custom">Custom White-Label Webinar Platform</option>
                  </select>
                </div>
              )}

              {eventType !== 'in-person' && (
                <div className="md:col-span-2 flex items-center justify-between border border-slate-200 rounded-xl p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Registration Required</p>
                    <p className="text-xs text-slate-500">If enabled, meeting registration fields will be created and synced.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRegistrationRequired(v => !v)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${registrationRequired ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {registrationRequired ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              )}

              {eventType !== 'in-person' && platform === 'zoom' && (
                <div className="md:col-span-2 border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">Meeting/Event Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setChatNeeded((v) => !v)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border ${chatNeeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      Chat: {chatNeeded ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQnaNeeded((v) => !v)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border ${qnaNeeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      Q&A: {qnaNeeded ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBreakoutRoomsNeeded((v) => !v)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border ${breakoutRoomsNeeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      Breakout Rooms: {breakoutRoomsNeeded ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordingNeeded((v) => !v)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border ${recordingNeeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      Recording: {recordingNeeded ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Zoom setting is always enforced: Request permission to unmute participants = Enabled.
                  </p>
                </div>
              )}

              {eventType !== 'in-person' && platform === 'bigmarker' && (
                <div className="md:col-span-2 border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">BigMarker Live Webinar Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Schedule Type</label>
                      <select
                        value={bigMarkerScheduleType}
                        onChange={(e) => setBigMarkerScheduleType(e.target.value as BigMarkerScheduleType)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="one_time">One time (Live Webinar)</option>
                        <option value="multiple_times">Recurring / Series</option>
                        <option value="24_hour_room">24 Hour Room</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Live Event Experience</label>
                      <select
                        value={bigMarkerWebcastMode}
                        onChange={(e) => setBigMarkerWebcastMode(e.target.value as BigMarkerWebcastMode)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="webcast">Webcast</option>
                        <option value="interactive">Interactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Audience Room Layout</label>
                      <select
                        value={bigMarkerRoomLayout}
                        onChange={(e) => setBigMarkerRoomLayout(e.target.value as BigMarkerRoomLayout)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="classic">Classic</option>
                        <option value="modular">Modular</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Privacy</label>
                      <select
                        value={bigMarkerPrivacy}
                        onChange={(e) => setBigMarkerPrivacy(e.target.value as BigMarkerPrivacy)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Hosted By (Channel ID)</label>
                      <input
                        type="text"
                        value={bigMarkerChannelId}
                        onChange={(e) => setBigMarkerChannelId(e.target.value.replace(/[^\d]/g, ''))}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Optional override (uses SuperAdmin value if empty)"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    These fields map to BigMarker Live Webinar creation parameters.
                  </p>
                </div>
              )}

              {eventType !== 'in-person' && (platform === 'zoom' || platform === 'bigmarker') && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date & Time</label>
                    <input
                      type="datetime-local"
                      value={meetingStartAt}
                      onChange={(e) => setMeetingStartAt(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={meetingDurationMinutes}
                      onChange={(e) => setMeetingDurationMinutes(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            {authError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('verify')}
                className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!canSubmitMeeting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" /> Generating...
                  </>
                ) : isCreatingMeeting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" /> {platform === 'bigmarker' ? 'Creating BigMarker Webinar...' : 'Creating Zoom Meeting...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Create Meeting
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {savedEvents.length > 0 && (
        <div className="max-w-4xl w-full mt-16 border-t border-slate-200 pt-10 animate-fadeIn">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" /> Your Meetings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {savedEvents.map(event => (
              <div
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className="bg-white p-5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer relative group flex flex-col justify-between h-44"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800 line-clamp-1 pr-6 text-lg" title={event.title}>{event.title}</h3>
                    <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold shrink-0">{event.theme.slice(0, 12)}</span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                    <Calendar className="w-3 h-3" /> {event.date}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {event.location}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <Users className="w-3 h-3" /> {event.estimatedAttendees} attendees
                  </p>
                </div>

                <p className="text-xs text-slate-400 mt-2 line-clamp-1 italic">{event.marketingTagline}</p>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(e, event.id);
                  }}
                  className="absolute top-4 right-4 text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-full z-10"
                  title="Delete Event"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-4xl w-full mt-10 bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600 flex items-start gap-3">
        <Building2 className="w-5 h-5 text-indigo-600 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-800 mb-1">Flow Summary</p>
          <p>
            Landing to email capture, then provider or manual signup completion, magic link verification, structured meeting creation, and AI-generated planning plus launch assets.
          </p>
        </div>
      </div>
    </div>
  );
};
