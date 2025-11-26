
import { EventPlan, AdminSettings, Registrant } from '../types';
import { getApiUrl } from './config';

// Helper to generate ID if missing
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

export const saveEvent = async (event: EventPlan): Promise<void> => {
  // Ensure event has an ID before saving
  if (!event.id) {
    event.id = generateId();
  }

  try {
    // Try to update first (Upsert logic simulated by client)
    const updateResponse = await fetch(getApiUrl(`/api/events/${event.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    if (updateResponse.status === 404) {
      // If not found, create new
      const createResponse = await fetch(getApiUrl('/api/events'), {
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
    const response = await fetch(getApiUrl('/api/events'));
    if (!response.ok) throw new Error('Failed to fetch events');
    const events: EventPlan[] = await response.json();
    return events;
  } catch (error) {
    console.error("Error fetching events from API:", error);
    return [];
  }
};

export const deleteEvent = async (id: string): Promise<boolean> => {
  if (!id) return false;
  const targetId = String(id).trim();
  
  try {
    const response = await fetch(getApiUrl(`/api/events/${targetId}`), {
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

    await fetch(getApiUrl(`/api/events/${eventId}/registrants`), {
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
    await fetch(getApiUrl('/api/admin/config'), {
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
    const response = await fetch(getApiUrl('/api/admin/config'));
    if (!response.ok) return { zoomApiKey: '', bigmarkerApiKey: '', sendgridApiKey: '', smtpHost: '' };
    return await response.json();
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return { zoomApiKey: '', bigmarkerApiKey: '', sendgridApiKey: '', smtpHost: '' };
  }
};
