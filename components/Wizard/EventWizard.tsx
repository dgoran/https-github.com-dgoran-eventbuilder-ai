
import React, { useState } from 'react';
import { WizardData } from '../../types';
import { Calendar, Users, Mic, Layers, ArrowRight, ArrowLeft } from 'lucide-react';

interface EventWizardProps {
    onComplete: (data: WizardData) => void;
    onCancel: () => void;
}

const STEPS = ['Basics', 'Content', 'Logistics'];

export const EventWizard: React.FC<EventWizardProps> = ({ onComplete, onCancel }) => {
    const [step, setStep] = useState(0);
    const [data, setData] = useState<WizardData>({
        title: '',
        description: '',
        attendees: 50,
        presenters: 1,
        eventType: 'virtual',
        platformType: 'zoom',
        requiresRegistration: true
    });

    const updateData = (updates: Partial<WizardData>) => {
        setData(prev => ({ ...prev, ...updates }));
    };

    const nextStep = () => {
        if (step < STEPS.length - 1) setStep(step + 1);
        else onComplete(data);
    };

    const prevStep = () => {
        if (step > 0) setStep(step - 1);
        else onCancel();
    };

    const renderStepIndicator = () => (
        <div className="flex justify-center mb-8">
            {STEPS.map((label, idx) => (
                <div key={label} className="flex items-center">
                    <div className={`flex flex-col items-center mx-4 ${idx === step ? 'text-indigo-600' : 'text-slate-400'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 transition-all ${idx === step ? 'bg-indigo-600 text-white' : (idx < step ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500')}`}>
                            {idx < step ? '✓' : idx + 1}
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                    </div>
                    {idx < STEPS.length - 1 && <div className="w-10 h-0.5 bg-slate-200 mb-4" />}
                </div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden p-8 animate-fade-in-up">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-900">Create New Event</h1>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
                </div>

                {renderStepIndicator()}

                <div className="min-h-[400px]">
                    {/* Step 1: Basics */}
                    {step === 0 && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Event Title</label>
                                <input
                                    type="text"
                                    value={data.title}
                                    onChange={e => updateData({ title: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-lg"
                                    placeholder="e.g. Q4 All Hands, Product Launch..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                                <textarea
                                    value={data.description}
                                    onChange={e => updateData({ description: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                                    placeholder="What is this event about?"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Expected Attendees</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                        <input
                                            type="number"
                                            value={data.attendees}
                                            onChange={e => updateData({ attendees: parseInt(e.target.value) })}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Number of Presenters</label>
                                    <div className="relative">
                                        <Mic className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                        <input
                                            type="number"
                                            value={data.presenters}
                                            onChange={e => updateData({ presenters: parseInt(e.target.value) })}
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Content */}
                    {step === 1 && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Agenda</label>
                                <p className="text-xs text-slate-500 mb-2">Paste your agenda OR upload a file (PDF/Text) for AI to generate the schedule.</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <textarea
                                        value={data.agendaText}
                                        onChange={e => updateData({ agendaText: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none h-40 font-mono text-sm resize-none"
                                        placeholder="09:00 - Welcome..."
                                    />

                                    <div
                                        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${data.agendaFileName ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:bg-slate-50'}`}
                                        onClick={() => document.getElementById('agenda-upload')?.click()}
                                    >
                                        <div className="w-10 h-10 bg-white text-indigo-600 rounded-full flex items-center justify-center shadow-sm mb-3">
                                            <Layers className="w-5 h-5" />
                                        </div>
                                        {data.agendaFileName ? (
                                            <div>
                                                <p className="text-sm font-bold text-indigo-700 truncate max-w-[150px]">{data.agendaFileName}</p>
                                                <p className="text-xs text-indigo-500 mt-1">File attached</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">Upload Agenda File</p>
                                                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT</p>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            id="agenda-upload"
                                            className="hidden"
                                            accept=".pdf,.txt,.md,.doc,.docx"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (ev) => {
                                                        const content = ev.target?.result as string;
                                                        // For PDF we might need base64, for text just text. 
                                                        // simplistic approach: store as base64 for everything to be safe or text if text type.
                                                        // Actually Gemini API handles base64 for PDFs.
                                                        updateData({
                                                            agendaFileName: file.name,
                                                            agendaFile: content // Data URL
                                                        });
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Upload Slides (Optional)</label>
                                <div
                                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer group"
                                    onClick={() => document.getElementById('deck-upload')?.click()}
                                >
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Layers className="w-6 h-6" />
                                    </div>
                                    {data.deckName ? (
                                        <div>
                                            <p className="text-sm font-bold text-indigo-600 truncate max-w-[200px] mx-auto">{data.deckName}</p>
                                            <p className="text-xs text-slate-400 mt-1">Click to replace</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="text-sm font-medium text-slate-600">Drag & drop PPTX, Keynote or PDF</p>
                                            <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        id="deck-upload"
                                        className="hidden"
                                        accept=".pdf,.pptx,.key"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                updateData({ deckName: file.name });
                                                // In a real app, we'd read the file here or upload it
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Logistics */}
                    {step === 2 && (
                        <div className="space-y-8 animate-fade-in">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-4">Event Format</label>
                                <div className="grid grid-cols-3 gap-4">
                                    {['virtual', 'hybrid', 'in-person'].map(formattedType => (
                                        <button
                                            key={formattedType}
                                            onClick={() => updateData({ eventType: formattedType as any })}
                                            className={`p-4 rounded-xl border-2 font-bold capitalize transition-all ${data.eventType === formattedType ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-200 text-slate-600'}`}
                                        >
                                            {formattedType}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {data.eventType !== 'in-person' && (
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-4">Webinar Platform</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {['zoom', 'bigmarker', 'vimeo', 'custom'].map(platform => (
                                            <button
                                                key={platform}
                                                onClick={() => updateData({ platformType: platform as any })}
                                                className={`p-4 rounded-xl border-2 font-bold capitalize transition-all flex items-center gap-2 ${data.platformType === platform ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-200 text-slate-600'}`}
                                            >
                                                {platform === 'zoom' && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                                                {platform === 'bigmarker' && <div className="w-2 h-2 rounded-full bg-red-500"></div>}
                                                {platform === 'vimeo' && <div className="w-2 h-2 rounded-full bg-sky-500"></div>}
                                                {platform === 'custom' && <div className="w-2 h-2 rounded-full bg-purple-500"></div>}
                                                {platform}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <input
                                    type="checkbox"
                                    id="reg"
                                    checked={data.requiresRegistration}
                                    onChange={e => updateData({ requiresRegistration: e.target.checked })}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                                <label htmlFor="reg" className="font-medium text-slate-700 cursor-pointer">Require Registration</label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-between pt-8 border-t border-slate-100">
                    <button
                        onClick={prevStep}
                        className="px-6 py-2.5 rounded-lg font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
                    </button>
                    <button
                        onClick={nextStep}
                        className="px-8 py-2.5 rounded-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                        disabled={!data.title}
                    >
                        {step === STEPS.length - 1 ? 'Generate Event' : 'Next Step'} <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

            </div>
        </div>
    );
};
