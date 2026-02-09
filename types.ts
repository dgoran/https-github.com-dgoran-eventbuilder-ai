
export interface Speaker {
  id: string;
  name: string;
  role: string;
  bio: string;
  customImageUrl?: string; // Base64 string for user uploaded image
  imageUrl?: string; // Alias for customImageUrl in some components
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description: string;
  durationMinutes: number;
  type: 'keynote' | 'break' | 'workshop' | 'networking' | 'panel' | 'other';
  imageKeyword?: string;
  speaker?: string; // Present in some views
}

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;
}

export interface EventBudget {
  totalBudget: number;
  currency: string;
  items: {
    category: string;
    amount: number;
    label: string;
  }[];
}

export interface Registrant {
  id: string;
  name: string;
  email: string;
  company?: string;
  registeredAt: number;
  customData?: Record<string, string>; // To store extra fields from BigMarker forms
}

export interface UploadedAsset {
  id: string;
  name: string;
  kind: 'agenda' | 'deck';
  source: 'upload' | 'link' | 'paste' | 'ai';
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  createdAt: number;
}

export interface EventPlan {
  id: string;
  createdAt: number;
  landingSubdomain?: string;
  title: string;
  description: string;
  theme: string;
  targetAudience: string;
  estimatedAttendees: number;
  date: string;
  location: string;
  imageKeyword: string;
  headerImageUrl?: string; // Base64 string for custom header
  coverImage?: string; // Alias for headerImageUrl
  speakers: Speaker[];
  agenda: AgendaItem[];
  tasks: Task[];
  budget: EventBudget;
  marketingTagline: string;
  websiteHtml?: string;
  integrationConfig?: IntegrationConfig;
  agendaSourceText?: string;
  brandPalette?: string[];
  uploadedDeckName?: string;
  uploadedFiles?: UploadedAsset[];
  registrants?: Registrant[];
  pageViews?: number;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'checkbox' | 'select';
  required: boolean;
  options?: string[]; // For select lists
}

export interface IntegrationConfig {
  type: 'zoom' | 'bigmarker' | 'custom' | 'email' | 'none';
  platformId?: string;
  customFields?: FormField[]; // Fields synced from the platform
  platformSettings?: {
    startTime?: string;
    timezone?: string;
    durationMinutes?: number;
    registrationRequired?: boolean;
    chatNeeded?: boolean;
    qnaNeeded?: boolean;
    breakoutRoomsNeeded?: boolean;
    recordingNeeded?: boolean;
    requestPermissionToUnmuteParticipants?: boolean;
    channelId?: string;
    scheduleType?: 'one_time' | 'multiple_times' | '24_hour_room';
    webcastMode?: 'interactive' | 'webcast' | 'automatic' | 'required' | 'optional';
    audienceRoomLayout?: 'classic' | 'modular';
    privacy?: 'private' | 'public';
    customProviderName?: string;
    customPlatformUrl?: string;
  };
  // Compatibility fields for preview components
  apiKey?: string;
  proxyUrl?: string;
  isMock?: boolean;
}

export interface AdminSettings {
  zoomApiKey?: string;
  zoomAccountId?: string;
  zoomClientId?: string;
  zoomClientSecret?: string;
  bigMarkerApiKey?: string;
  bigMarkerChannelId?: string;
  vimeoApiKey?: string;
  geminiApiKey?: string;
  sendgridApiKey?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtp2goApiKey?: string;
  smtp2goFrom?: string;
  defaultProxyUrl?: string;
  hasGeminiKey?: boolean;
  hasBigMarkerKey?: boolean;
  hasBigMarkerChannelId?: boolean;
  hasZoomKey?: boolean;
  hasZoomAccountId?: boolean;
  hasZoomClientId?: boolean;
  hasZoomClientSecret?: boolean;
  hasVimeoKey?: boolean;
  hasSmtpPass?: boolean;
  hasSmtp2goKey?: boolean;
  activeEmailRelay?: 'smtp2go' | 'smtp' | 'none';
}

export interface SystemConfig {
  geminiApiKey: string;
  bigMarkerApiKey: string;
  bigMarkerChannelId: string;
  zoomApiKey: string;
  zoomAccountId: string;
  zoomClientId: string;
  zoomClientSecret: string;
  vimeoApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtp2goApiKey: string;
  smtp2goFrom: string;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  VIEWING = 'VIEWING',
  ADMIN = 'ADMIN',
  ERROR = 'ERROR'
}

export interface AIContentResponse {
  title: string;
  description: string;
  agenda: {
    time: string;
    title: string;
    speaker: string;
  }[];
  suggestedSpeakers: {
    name: string;
    role: string;
    bio: string;
  }[];
}
