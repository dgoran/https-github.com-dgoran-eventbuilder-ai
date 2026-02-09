import { EventPlan, IntegrationConfig } from "../types";
import { getApiAuthHeaders, getApiUrl } from "./config";

async function postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      message = errorBody.error || message;
    } catch (e) {
      // Keep default message if body is not JSON
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const generateEvent = async (userPrompt: string): Promise<EventPlan> => {
  const result = await postJson<EventPlan>("/api/ai/generate-event", { userPrompt });
  return result;
};

export const updateEvent = async (currentPlan: EventPlan, instruction: string): Promise<EventPlan> => {
  const result = await postJson<EventPlan>("/api/ai/update-event", { currentPlan, instruction });
  return result;
};

export const generateWebsiteCode = async (eventPlan: EventPlan, integration: IntegrationConfig): Promise<string> => {
  const result = await postJson<{ html: string }>("/api/ai/generate-website", { eventPlan, integration });
  return result.html;
};

export const extractGoogleSlidesColors = async (slidesUrl: string): Promise<string[]> => {
  const result = await postJson<{ colors: string[] }>("/api/ai/extract-slides-colors", { slidesUrl });
  return Array.isArray(result.colors) ? result.colors : [];
};

export interface ZoomMeetingCreateInput {
  title: string;
  description?: string;
  startTime?: string;
  durationMinutes?: number;
  timezone?: string;
  registrationRequired?: boolean;
  chatNeeded?: boolean;
  qnaNeeded?: boolean;
  breakoutRoomsNeeded?: boolean;
  recordingNeeded?: boolean;
}

export interface ZoomMeetingCreateResult {
  id: string | number;
  join_url: string;
  start_url: string;
  password?: string;
  registration_url?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
}

export const createZoomMeeting = async (payload: ZoomMeetingCreateInput): Promise<ZoomMeetingCreateResult> => {
  try {
    return await postJson<ZoomMeetingCreateResult>('/api/zoom/create-meeting', payload as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Zoom meeting';
    if (/unauthorized|not authenticated/i.test(message)) {
      throw new Error('Unauthorized: your session may have expired. Please log in again and retry.');
    }
    throw error;
  }
};

export interface BigMarkerConferenceCreateInput {
  title: string;
  description?: string;
  startTime?: string;
  timezone?: string;
  channelId?: string;
  registrationRequired?: boolean;
  scheduleType?: 'one_time' | 'multiple_times' | '24_hour_room';
  webcastMode?: 'interactive' | 'webcast' | 'automatic' | 'required' | 'optional';
  audienceRoomLayout?: 'classic' | 'modular';
  privacy?: 'public' | 'private';
  durationMinutes?: number;
}

export interface BigMarkerConferenceCreateResult {
  id: string | number;
  title?: string;
  webinar_url?: string;
  registration_url?: string;
  starts_at?: string;
  timezone?: string;
}

export const createBigMarkerConference = async (payload: BigMarkerConferenceCreateInput): Promise<BigMarkerConferenceCreateResult> => {
  try {
    return await postJson<BigMarkerConferenceCreateResult>('/api/bigmarker/create-conference', payload as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create BigMarker conference';
    if (/unauthorized|not authenticated/i.test(message)) {
      throw new Error('Unauthorized: your session may have expired. Please log in again and retry.');
    }
    throw error;
  }
};
