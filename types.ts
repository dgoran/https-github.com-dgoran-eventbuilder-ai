
export interface Speaker {
  id: string;
  name: string;
  role: string;
  bio: string;
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description: string;
  durationMinutes: number;
  type: 'keynote' | 'break' | 'workshop' | 'networking' | 'panel' | 'other';
  imageKeyword?: string;
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
}

export interface EventPlan {
  id: string; // Added for persistence
  createdAt: number; // Added for sorting
  title: string;
  description: string;
  theme: string;
  targetAudience: string;
  estimatedAttendees: number;
  date: string;
  location: string; // Will default to "Online / Webinar"
  imageKeyword: string; // For generating placeholder images
  speakers: Speaker[];
  agenda: AgendaItem[];
  tasks: Task[];
  budget: EventBudget;
  marketingTagline: string;
  websiteHtml?: string;
  integrationConfig?: IntegrationConfig;
  registrants?: Registrant[];
}

export interface IntegrationConfig {
  type: 'zoom' | 'bigmarker' | 'email' | 'none';
  platformId?: string; // Webinar ID
}

export interface AdminSettings {
  zoomApiKey?: string;
  bigmarkerApiKey?: string;
  sendgridApiKey?: string;
  smtpHost?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  VIEWING = 'VIEWING',
  ADMIN = 'ADMIN', // Added Admin state
  ERROR = 'ERROR'
}
