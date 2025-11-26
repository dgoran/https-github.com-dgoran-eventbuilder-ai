
import React, { useState, useEffect } from 'react';
import { EventPlan } from '../types';
import { Button, Input } from './UIComponents';

interface EventPreviewProps {
  event: EventPlan;
  onBack: () => void;
  onView: () => void;
  onRegister: (data: { name: string, email: string }) => void;
}

export const EventPreview: React.FC<EventPreviewProps> = ({ event, onBack, onView, onRegister }) => {
  const [registered, setRegistered] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({ name: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{days: number, hours: number, minutes: number, seconds: number} | null>(null);

  const integration = event.integrationConfig || { type: 'none' };
  const coverImage = event.headerImageUrl || event.coverImage || `https://picsum.photos/seed/${event.imageKeyword}/1200/600`;

  useEffect(() => {
    onView();
    const calculateTimeLeft = () => {
      if (!event.date) return null;
      // Heuristic: try to find start time from agenda, default to 9:00 AM if not found
      const startTime = event.agenda?.[0]?.time || '09:00';
      // Basic parsing of time string (e.g. "09:00 AM" or "14:00")
      const timeStr = startTime.replace(/[AP]M/i, '').trim();
      
      const eventDate = new Date(`${event.date} ${timeStr}`);
      if (isNaN(eventDate.getTime())) return null;
      const difference = +eventDate - +new Date();
      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return null;
    };
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    setTimeLeft(calculateTimeLeft());
    return () => clearInterval(timer);
  }, [event.date, event.agenda]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const fullName = (formData.name || '').trim();
      
      if (integration.type === 'bigmarker' && integration.apiKey && integration.platformId) {
        const firstSpaceIndex = fullName.indexOf(' ');
        const firstName = firstSpaceIndex === -1 ? fullName : fullName.substring(0, firstSpaceIndex);
        const lastName = firstSpaceIndex === -1 ? '.' : fullName.substring(firstSpaceIndex + 1);
        
        const customFieldsPayload: Record<string, any> = {};
        if (integration.customFields) {
           integration.customFields.forEach(field => {
             let val = formData[field.id];
             if (val !== undefined && val !== '') {
               if (field.type === 'checkbox') customFieldsPayload[field.id] = val === 'true';
               else customFieldsPayload[field.id] = val;
             }
           });
        }

        const payload = {
              email: formData.email,
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
              custom_fields: customFieldsPayload
        };

        if (integration.isMock) {
             await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
            try {
                const baseUrl = integration.proxyUrl ? integration.proxyUrl.replace(/\/$/, '') : 'https://www.bigmarker.com';
                const endpoint = `${baseUrl}/api/v1/conferences/${integration.platformId}/register`;
                const response = await fetch(endpoint, {
                   method: 'PUT',
                   headers: { 'Content-Type': 'application/json', 'API-KEY': integration.apiKey },
                   body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error("Registration failed");
            } catch (innerError: any) {
                if (innerError.name === 'TypeError' || innerError.message === 'Failed to fetch') {
                    throw new Error("Connection failed. Check CORS settings or use Demo Mode.");
                }
                throw innerError;
            }
        }
      } else if (integration.type === 'none' || integration.type === 'email') {
        // NO INTEGRATION -> SEND EMAIL VIA BACKEND
        try {
            const response = await fetch('/api/send-registration-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    name: fullName,
                    eventTitle: event.title,
                    eventDate: event.date,
                    // eventTime: event.time, // removed
                    customFields: formData 
                })
            });
            const resData = await response.json();
            if (!resData.success) {
                console.warn("Email sending reported failure:", resData.error);
            }
        } catch (emailError) {
            console.error("Failed to trigger email backend:", emailError);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      onRegister({ name: fullName, email: formData.email });
      setRegistered(true);

    } catch (error: any) {
      console.error("Registration error:", error);
      setErrorMessage(error.message || "Issue processing registration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-10 text-center border-t-8 border-brand-600">
           <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-100 mb-6 animate-bounce">
            <i className="fas fa-check text-green-600 text-3xl"></i>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">You're In!</h2>
          <p className="text-gray-600 mb-8 text-lg">
            Thanks for registering for <strong>{event.title}</strong>. 
            {integration.type === 'none' && " We've sent a confirmation email."}
          </p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => { setRegistered(false); setFormData({ name: '', email: '' }); }} variant="secondary">Register Another</Button>
            <Button onClick={onBack} variant="ghost">Return</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
               <div className="h-8 w-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/30">W</div>
               <span className="font-bold text-xl tracking-tight text-gray-900">WebinarHost</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex space-x-8 text-sm font-medium">
                <a href="#agenda" className="text-gray-500 hover:text-brand-600 transition-colors">Agenda</a>
                <a href="#speakers" className="text-gray-500 hover:text-brand-600 transition-colors">Speakers</a>
              </div>
              <Button onClick={onBack} variant="secondary" className="text-sm py-1.5">
                <i className="fas fa-pencil-alt mr-2 text-xs"></i> Edit
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative bg-slate-900 overflow-hidden text-white">
        <div className="absolute inset-0">
          <img className="w-full h-full object-cover opacity-30" src={coverImage} alt="Cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">Live Webinar</span>
              <span className="text-slate-300 text-sm font-medium">{event.date || 'Date TBD'}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6 text-white drop-shadow-sm">{event.title}</h1>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-2xl border-l-4 border-brand-500 pl-4">{event.description}</p>
            {timeLeft && (
              <div className="flex gap-4 mb-10">
                {['days', 'hours', 'minutes', 'seconds'].map((unit) => (
                  <div key={unit} className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-center min-w-[70px] border border-white/10">
                    <div className="text-2xl font-bold font-mono">{String((timeLeft as any)[unit]).padStart(2, '0')}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{unit}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => document.getElementById('register-card')?.scrollIntoView({ behavior: 'smooth' })} className="bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-brand-600/30 transition-all hover:scale-105">Reserve My Spot</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div id="speakers" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center"><i className="fas fa-microphone-alt text-brand-500 mr-3"></i> Featured Speakers</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {(event.speakers || []).map((speaker, idx) => (
                  <div key={idx} className="group relative bg-gray-50 rounded-xl p-6 hover:bg-white hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-100">
                    <div className="flex items-start gap-4">
                      <img src={speaker.imageUrl || speaker.customImageUrl || `https://picsum.photos/seed/${idx}/150`} alt={speaker.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-md" />
                      <div>
                        <h3 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors">{speaker.name}</h3>
                        <p className="text-sm text-brand-600 font-medium mb-2">{speaker.role}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-4 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{speaker.bio}</p>
                  </div>
                ))}
              </div>
            </div>
            <div id="agenda" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center"><i className="fas fa-list-ul text-brand-500 mr-3"></i> Agenda</h2>
              <div className="space-y-0">
                {(event.agenda || []).map((item, idx) => (
                  <div key={idx} className="flex group relative">
                     <div className="flex flex-col items-center mr-6 relative">
                        <div className="w-px h-full bg-gray-200 group-first:bg-gradient-to-b group-first:from-transparent group-first:to-gray-200 group-last:bg-gradient-to-t group-last:from-transparent group-last:to-gray-200"></div>
                        <div className="w-3 h-3 bg-brand-500 rounded-full ring-4 ring-white shadow-sm my-2 absolute"></div>
                        <div className="w-px h-full bg-gray-200"></div>
                     </div>
                     <div className="pb-8 pt-1 w-full">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                          <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                          <span className="inline-block px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-500">{item.time}</span>
                        </div>
                        <p className="text-gray-600 text-sm flex items-center gap-2"><i className="far fa-user text-gray-400"></i> {item.speaker}</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="sticky top-24" id="register-card">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="bg-brand-600 p-6 text-white text-center relative overflow-hidden">
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold">Save Your Spot</h3>
                    <p className="text-brand-100 text-sm mt-1">Free registration • Limited seats</p>
                  </div>
                  <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 rotate-12 scale-150 transform origin-bottom-right"></div>
                </div>
                
                <div className="p-6">
                  <form onSubmit={handleRegister} className="space-y-4">
                    {errorMessage && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">{errorMessage}</div>}
                    <Input label="Full Name *" required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-gray-50" />
                    <Input label="Email Address *" type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="bg-gray-50" />
                    
                    {/* Dynamic Fields */}
                    {(integration.customFields || []).map((field) => {
                       if (['email', 'full_name', 'name'].includes((field.id||'').toLowerCase())) return null;
                       if (field.type === 'select') {
                          return (
                            <div key={field.id} className="space-y-1">
                               <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{field.label} {field.required && '*'}</label>
                               <select required={field.required} value={formData[field.id] || ''} onChange={e => setFormData({...formData, [field.id]: e.target.value})} className="block w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm">
                                 <option value="">Select...</option>
                                 {field.options?.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                               </select>
                            </div>
                          );
                       } else if (field.type === 'checkbox') {
                          return (
                            <div key={field.id} className="flex items-center pt-2">
                               <input type="checkbox" id={field.id} required={field.required} checked={formData[field.id] === 'true'} onChange={e => setFormData({...formData, [field.id]: e.target.checked ? 'true' : 'false'})} className="h-4 w-4 text-brand-600 border-gray-300 rounded" />
                               <label htmlFor={field.id} className="ml-2 text-sm font-medium text-gray-700">{field.label} {field.required && '*'}</label>
                            </div>
                          );
                       }
                       return (
                          <Input key={field.id} label={`${field.label} ${field.required ? '*' : ''}`} required={field.required} value={formData[field.id] || ''} onChange={e => setFormData({...formData, [field.id]: e.target.value})} className="bg-gray-50" />
                       );
                    })}
                    
                    <Button type="submit" className="w-full py-4 text-base" isLoading={isSubmitting}>Complete Registration</Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};