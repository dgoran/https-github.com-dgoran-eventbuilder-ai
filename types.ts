
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

export interface EventPlan {
  id: string;
  createdAt: number;
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
  type: 'zoom' | 'bigmarker' | 'email' | 'none';
  platformId?: string;
  customFields?: FormField[]; // Fields synced from the platform
  // Compatibility fields for preview components
  apiKey?: string;
  proxyUrl?: string;
  isMock?: boolean;
}

export interface AdminSettings {
  zoomApiKey?: string;
  bigmarkerApiKey?: string;
  sendgridApiKey?: string;
  smtpHost?: string;
}

export interface SystemConfig {
  geminiApiKey: string;
  bigMarkerApiKey: string;
  zoomApiKey: string;
  vimeoApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
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