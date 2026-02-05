
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { EventPlan, IntegrationConfig } from "../types";

// Dynamic API Key Retrieval
// Checks for runtime injection (window.GEMINI_API_KEY from server.js) first, then build-time env var.
const getAiClient = () => {
  let key = '';
  if (typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
    key = (window as any).GEMINI_API_KEY;
  }

  if (!key) {
    key = process.env.GEMINI_API_KEY || '';
  }

  // Fallback or empty init - requests will fail if key is missing, which is handled in catch blocks
  return new GoogleGenAI({ apiKey: key });
};

const eventSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Catchy title of the webinar/live stream" },
    description: { type: Type.STRING, description: "A comprehensive summary of the webinar" },
    theme: { type: Type.STRING, description: "The visual or conceptual theme" },
    imageKeyword: { type: Type.STRING, description: "A single English noun describing the visual theme (e.g., 'technology', 'conference', 'nature') for image generation" },
    targetAudience: { type: Type.STRING, description: "Who this event is for" },
    estimatedAttendees: { type: Type.INTEGER, description: "Projected number of attendees" },
    date: { type: Type.STRING, description: "Suggested date string (e.g., 'October 15, 2024')" },
    location: { type: Type.STRING, description: "Must be 'Live Stream' or 'Webinar Platform'" },
    marketingTagline: { type: Type.STRING, description: "A punchy marketing tagline" },
    speakers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          role: { type: Type.STRING, description: "Job title or Role" },
          bio: { type: Type.STRING, description: "Short 1-sentence bio" }
        },
        required: ["id", "name", "role", "bio"]
      }
    },
    agenda: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          time: { type: Type.STRING, description: "Start time (e.g., '09:00 AM')" },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          durationMinutes: { type: Type.INTEGER },
          type: { type: Type.STRING, enum: ['keynote', 'break', 'workshop', 'networking', 'panel', 'other'] },
          imageKeyword: { type: Type.STRING, description: "A single noun representing this agenda item topic (e.g. 'coffee', 'computer', 'handshake')" }
        },
        required: ["id", "time", "title", "description", "durationMinutes", "type", "imageKeyword"]
      }
    },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['pending', 'in-progress', 'completed'] },
          priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
        },
        required: ["id", "title", "status", "priority"]
      }
    },
    budget: {
      type: Type.OBJECT,
      properties: {
        totalBudget: { type: Type.NUMBER },
        currency: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              label: { type: Type.STRING }
            }
          }
        }
      },
      required: ["totalBudget", "currency", "items"]
    }
  },
  required: ["title", "description", "theme", "imageKeyword", "speakers", "agenda", "tasks", "budget", "marketingTagline"]
};

// Robust ID generator fallback
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

export const generateEvent = async (userPrompt: string, fileData?: { mimeType: string, data: string }): Promise<EventPlan> => {
  try {
    const ai = getAiClient();

    // Construct content parts
    const textPart = {
      text: `Generate a detailed professional LIVE STREAM WEBINAR event plan based on this request: "${userPrompt}". 
      
      CRITICAL INSTRUCTIONS:
      1. This IS A VIRTUAL EVENT/WEBINAR. The location must reflect that (e.g., Zoom, Bigmarker).
      2. Ensure the agenda accounts for virtual attention spans (shorter blocks, interactive polls).
      3. Generate 2-4 fictitious but realistic speakers with diverse backgrounds.
      4. Tasks should focus on "tech check", "speaker lighting", "webinar setup", "email sequences".
      5. Budget should focus on "streaming software", "digital ads", "speaker fees" rather than venue catering.
      6. Provide 'imageKeyword' fields that are simple nouns for fetching placeholder images (e.g. use 'laptop' not 'person using laptop').
      7. IF A FILE IS ATTACHED: Use the content of the attached file as the primary source for the Agenda and Schedule.
      
      Output strictly JSON.`
    };

    const parts: any[] = [textPart];

    if (fileData) {
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.data
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: [{ role: 'user', parts: parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: eventSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed = JSON.parse(text) as EventPlan;
    // Inject ID and CreatedAt on generation
    parsed.id = generateId();
    parsed.createdAt = Date.now();

    return parsed;
  } catch (error) {
    console.error("Error generating event:", error);
    throw error;
  }
};

export const updateEvent = async (currentPlan: EventPlan, instruction: string): Promise<EventPlan> => {
  try {
    const ai = getAiClient();
    // Exclude fields that shouldn't be touched by the AI directly in the prompt context to avoid confusion, 
    // though we handle preservation below.
    const { websiteHtml, headerImageUrl, ...planWithoutHeavyFields } = currentPlan;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: `Current Webinar Plan JSON: ${JSON.stringify(planWithoutHeavyFields)}. 
      
      User Instruction for modification: "${instruction}".
      
      Return the FULLY updated Event Plan JSON structure reflecting the changes requested. 
      Keep existing data that shouldn't change. Maintain the exact same schema.
      Ensure 'speakers' and 'imageKeyword' fields are preserved or updated if relevant.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: eventSchema,
        temperature: 0.4,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const updatedPlan = JSON.parse(text) as EventPlan;

    // Restore preserved fields
    updatedPlan.id = currentPlan.id;
    updatedPlan.createdAt = currentPlan.createdAt;

    // Restore Images & HTML
    if (websiteHtml) updatedPlan.websiteHtml = websiteHtml;
    if (headerImageUrl) updatedPlan.headerImageUrl = headerImageUrl;
    if (currentPlan.integrationConfig) updatedPlan.integrationConfig = currentPlan.integrationConfig;

    // Restore custom speaker images
    updatedPlan.speakers = updatedPlan.speakers.map(s => {
      const existing = currentPlan.speakers.find(ex => ex.id === s.id);
      if (existing && existing.customImageUrl) {
        return { ...s, customImageUrl: existing.customImageUrl };
      }
      return s;
    });

    return updatedPlan;
  } catch (error) {
    console.error("Error updating event:", error);
    throw error;
  }
}

export const generateWebsiteCode = async (eventPlan: EventPlan, integration: IntegrationConfig): Promise<string> => {
  try {
    const ai = getAiClient();
    let integrationInstructions = "";

    // The ID injection allows the site to communicate back to the specific event bucket in the backend
    const commonScript = `
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const form = document.querySelector('form');
          if (form) {
            form.addEventListener('submit', (e) => {
              e.preventDefault();
              const formData = new FormData(form);
              const data = Object.fromEntries(formData.entries());
              
              // Simulate API Submission / Backend Save
              console.log('Submitting registration for event: ${eventPlan.id}', data);
              
              // If running in iframe preview, send to parent (Dashboard) to save to local backend
              if (window.parent) {
                window.parent.postMessage({
                  type: 'EVENT_REGISTRATION',
                  eventId: '${eventPlan.id}',
                  payload: {
                    ...data, // Capture all custom fields
                    name: data.name || (data['first_name'] + ' ' + data['last_name']),
                    email: data.email,
                  }
                }, '*');
              }
              
              const btn = form.querySelector('button');
              const originalText = btn.innerText;
              btn.innerText = 'Registered!';
              btn.disabled = true;
              btn.classList.add('bg-green-600');
              
              alert('Registration confirmed! You have been added to the database.');
            });
          }
        });
      </script>
    `;

    // Dynamic Form Generation Logic for BigMarker
    if (integration.type === 'bigmarker' && integration.customFields && integration.customFields.length > 0) {

      const formFieldsHtml = integration.customFields.map(field => {
        if (field.type === 'checkbox') {
          return `
            <div className="flex items-center mb-4">
              <input type="checkbox" name="${field.id}" id="${field.id}" ${field.required ? 'required' : ''} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300">
              <label for="${field.id}" class="ml-2 text-sm text-gray-700">${field.label}</label>
            </div>`;
        } else {
          return `
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2" for="${field.id}">
                ${field.label} ${field.required ? '*' : ''}
              </label>
              <input 
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" 
                id="${field.id}" 
                name="${field.id}" 
                type="${field.type}" 
                ${field.required ? 'required' : ''}
                placeholder="${field.label}"
              >
            </div>`;
        }
      }).join('');

      integrationInstructions = `
        Use the exact HTML below for the Registration Form inside the registration area. 
        Do not create your own form fields. Use these pre-configured fields that match the BigMarker API:
        
        <form class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
           ${formFieldsHtml}
           <div class="flex items-center justify-between">
            <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full" type="button">
              Register Now
            </button>
          </div>
        </form>

        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'zoom') {
      integrationInstructions = `
        Create a registration form that simulates a Zoom Webinar Registration.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email").
        Button Text: "Register via Zoom".
        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'vimeo') {
      integrationInstructions = `
        Create a registration form that simulates a Vimeo Event Registration.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email").
        Button Text: "Register for Vimeo Stream".
        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'custom') {
      integrationInstructions = `
        Create a registration form for a Custom White Label Webinar Platform.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email"), Job Title (name="job_title"), Company (name="company").
        Button Text: "Secure My Spot".
        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'bigmarker') {
      // Fallback for BigMarker if no fields synced
      integrationInstructions = `
        Create a registration form that simulates a BigMarker Webinar Registration.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email").
        Button Text: "Save my Spot on BigMarker".
        Add the script tag provided below at the end of the body.
      `;
    } else {
      integrationInstructions = `
        Create a generic "No-Code" email registration form.
        Form fields: Name (name="name"), Email (name="email").
        Button Text: "Register Now".
        Add the script tag provided below at the end of the body.
      `;
    }

    const speakersHtml = eventPlan.speakers.map(s => `
      <div class="bg-white p-6 rounded-xl shadow-md flex flex-col items-center text-center">
        <img src="${s.customImageUrl || `https://i.pravatar.cc/150?u=${s.id}`}" alt="${s.name}" class="w-24 h-24 rounded-full mb-4 object-cover border-4 border-indigo-50">
        <h3 class="text-xl font-bold text-slate-900">${s.name}</h3>
        <p class="text-indigo-600 font-medium mb-2">${s.role}</p>
        <p class="text-slate-600 text-sm">${s.bio}</p>
      </div>
    `).join('');

    const heroImageSrc = eventPlan.headerImageUrl || `https://picsum.photos/seed/${eventPlan.imageKeyword}/1200/600`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: `Design a single-file HTML/Tailwind CSS landing page for this LIVE STREAM WEBINAR.
      
      Event Details:
      Title: ${eventPlan.title}
      Theme: ${eventPlan.theme}
      Date: ${eventPlan.date}
      Description: ${eventPlan.description}
      Tagline: ${eventPlan.marketingTagline}
      Agenda Summary: ${eventPlan.agenda.slice(0, 5).map(i => i.time + ' - ' + i.title).join('; ')}...
      
      Integration Requirement:
      ${integrationInstructions}

      Content Requirements:
      1. Hero Section: Headline, Date, and the Registration Form side-by-side or prominent. Use a background image related to '${eventPlan.imageKeyword}'.
      2. Speakers Section: MUST include a specific section titled "Meet the Speakers" that displays these speakers. I will inject the HTML for them, just provide the container structure.
      3. Agenda Section: "What you'll learn".
      4. Footer.

      Technical Requirements:
      - DO NOT use any external CSS files other than Tailwind CDN.
      - Use <script src="https://cdn.tailwindcss.com"></script>
      - Design must be modern, high-conversion, focused on getting people to register.
      - Use "${heroImageSrc}" for the Hero background image (add overlay for text readability).
      - Return ONLY the raw HTML code. Do not include markdown formatting like \`\`\`html.
      
      Embed this raw HTML for the speakers list into the Speakers Section container:
      ${speakersHtml}

      IMPORTANT: Include this exact script logic at the end of the body for the registration handling:
      ${commonScript}
      `,
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");

    // Cleanup markdown if strictly present
    text = text.replace(/^```html/, '').replace(/```$/, '').trim();

    return text;
  } catch (error) {
    console.error("Error generating website:", error);
    throw error;
  }
};
