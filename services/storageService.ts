
import { EventPlan, AdminSettings, Registrant } from '../types';

const EVENTS_KEY = 'eventbuilder_events';
const SETTINGS_KEY = 'eventbuilder_admin_settings';

// Helper to generate ID if missing
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

export const saveEvent = (event: EventPlan): void => {
  const events = getEvents();
  
  // Ensure event has an ID before saving
  if (!event.id) {
    event.id = generateId();
  }

  const index = events.findIndex(e => e.id === event.id);
  if (index >= 0) {
    events[index] = event;
  } else {
    events.push(event);
  }
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
};

export const getEvents = (): EventPlan[] => {
  const stored = localStorage.getItem(EVENTS_KEY);
  if (!stored) return [];
  
  try {
    const events = JSON.parse(stored);
    
    // Data Migration: Ensure all events have IDs and createdAt to prevent delete errors
    let modified = false;
    const migratedEvents = events.map((e: any) => {
      if (!e.id) {
        e.id = generateId();
        modified = true;
      }
      if (!e.createdAt) {
        e.createdAt = Date.now();
        modified = true;
      }
      return e as EventPlan;
    });

    if (modified) {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(migratedEvents));
    }

    return migratedEvents;
  } catch (e) {
    console.error("Error parsing events from storage", e);
    return [];
  }
};

export const deleteEvent = (id: string): void => {
  if (!id) {
    console.error("Cannot delete event without ID");
    return;
  }
  
  const events = getEvents();
  // Filter out the event with the matching ID
  const updatedEvents = events.filter(e => String(e.id) !== String(id));
  
  localStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
  console.log(`Event deleted: ${id}. Remaining: ${updatedEvents.length}`);
};

export const addRegistrant = (eventId: string, data: { name: string; email: string; company?: string }): void => {
  const events = getEvents();
  const index = events.findIndex(e => e.id === eventId);
  
  if (index >= 0) {
    const event = events[index];
    if (!event.registrants) {
      event.registrants = [];
    }
    
    // Prevent duplicates based on email
    const exists = event.registrants.some(r => r.email === data.email);
    if (!exists) {
      const newRegistrant: Registrant = {
        id: generateId(),
        name: data.name,
        email: data.email,
        company: data.company,
        registeredAt: Date.now()
      };
      event.registrants.push(newRegistrant);
      events[index] = event;
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      console.log(`Added registrant ${data.email} to event ${eventId}`);
    }
  }
};

export const saveAdminSettings = (settings: AdminSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getAdminSettings = (): AdminSettings => {
  const stored = localStorage.getItem(SETTINGS_KEY);
  return stored ? JSON.parse(stored) : {
    zoomApiKey: '',
    bigmarkerApiKey: '',
    sendgridApiKey: '',
    smtpHost: ''
  };
};
