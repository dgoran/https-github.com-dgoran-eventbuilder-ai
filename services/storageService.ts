
import { EventPlan, AdminSettings, Registrant } from '../types';
import { getApiUrl } from './config';

// Helper to generate ID if missing
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

// Helper for robust fetching with exponential backoff
const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3, delay = 500): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    // Retry on 5xx server errors (common during cold starts)
    if (!response.ok && response.status >= 500 && retries > 0) {
      throw new Error(`Server Error: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (retries <= 0) throw error;
    
    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry with increased delay (exponential backoff)
    console.log(`Retrying API call to ${url}... attempts left: ${retries}`);
    return fetchWithRetry(url, options, retries - 1, delay * 2);
  }
};

export const checkServerHealth = async (): Promise<boolean> => {
  try {
    // Short timeout for health check
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(getApiUrl('/api/health'), { 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (e) {
    return false;
  }
};

export const saveEvent = async (event: EventPlan): Promise<void> => {
  // Ensure event has an ID before saving
  if (!event.id) {
    event.id = generateId();
  }

  try {
    // Try to update first (Upsert logic simulated by client)
    const updateResponse = await fetchWithRetry(getApiUrl(`/api/events/${event.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    if (updateResponse.status === 404) {
      // If not found, create new
      const createResponse = await fetchWithRetry(getApiUrl('/api/events'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      if (!createResponse.ok) throw new Error('Failed to create event');
    } else if (!updateResponse.ok) {
      throw new Error('Failed to update event');
    }
  } catch (error) {
    console.error("Error saving event to API:", error);
    throw error;
  }
};

export const getEvents = async (): Promise<EventPlan[]> => {
  try {
    const response = await fetchWithRetry(getApiUrl('/api/events'));
    if (!response.ok) throw new Error('Failed to fetch events');
    const events: EventPlan[] = await response.json();
    return events;
  } catch (error) {
    console.error("Error fetching events from API:", error);
    throw error; // Rethrow to let caller handle offline state
  }
};

export const deleteEvent = async (id: string): Promise<boolean> => {
  if (!id) return false;
  const targetId = String(id).trim();
  
  try {
    const response = await fetchWithRetry(getApiUrl(`/api/events/${targetId}`), {
      method: 'DELETE'
    });
    return response.ok;
  } catch (error) {
    console.error("Error deleting event from API:", error);
    return false;
  }
};

export const addRegistrant = async (eventId: string, data: { name: string; email: string; company?: string }): Promise<void> => {
  try {
    const newRegistrant: Registrant = {
      id: generateId(),
      name: data.name,
      email: data.email,
      company: data.company,
      registeredAt: Date.now()
    };

    await fetchWithRetry(getApiUrl(`/api/events/${eventId}/registrants`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRegistrant)
    });
    console.log(`Added registrant ${data.email} to event ${eventId}`);
  } catch (error) {
    console.error("Error adding registrant via API:", error);
  }
};

export const saveAdminSettings = async (settings: AdminSettings): Promise<void> => {
  try {
    await fetchWithRetry(getApiUrl('/api/admin/config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  } catch (error) {
    console.error("Error saving admin settings:", error);
  }
};

export const getAdminSettings = async (): Promise<AdminSettings> => {
  try {
    const response = await fetchWithRetry(getApiUrl('/api/admin/config'));
    if (!response.ok) return { zoomApiKey: '', bigmarkerApiKey: '', sendgridApiKey: '', smtpHost: '' };
    return await response.json();
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return { zoomApiKey: '', bigmarkerApiKey: '', sendgridApiKey: '', smtpHost: '' };
  }
};
