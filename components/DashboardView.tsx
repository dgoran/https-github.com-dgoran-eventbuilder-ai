import React from 'react';
import { EventPlan } from '../types';
import { Button, Card } from './UIComponents';

interface DashboardViewProps {
  events: EventPlan[];
  setView: (view: 'dashboard' | 'create' | 'preview' | 'admin') => void;
  setWizardStep: (step: 1 | 2 | 3) => void;
  setCurrentEvent: (event: EventPlan | null) => void;
  handleEditEvent: (event: EventPlan) => void;
  setTopic: (topic: string) => void;
  setGeneratedContent: (content: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  events,
  setView,
  setWizardStep,
  setCurrentEvent,
  handleEditEvent,
  setTopic,
  setGeneratedContent
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Hero Section with Glassmorphism */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 to-accent-500/10"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-400/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-400/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="flex justify-between items-center mb-12">
            <div>
              <h1 className="text-display font-display font-bold text-gradient mb-2">
                WebinarHost
              </h1>
              <p className="text-lg text-slate-600">Create stunning webinar experiences</p>
            </div>
            <div className="flex gap-4">
              <Button
                variant="secondary"
                onClick={() => setView('admin')}
                className="glass-strong hover-lift"
              >
                <i className="fas fa-cog mr-2"></i> Admin
              </Button>
            </div>
          </div>

          {/* Stats Cards - Glassmorphism */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="glass-strong rounded-2xl p-6 hover-lift">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Total Events</p>
                  <p className="text-3xl font-bold text-slate-900">{events.length}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-brand rounded-xl flex items-center justify-center">
                  <i className="fas fa-calendar text-white text-xl"></i>
                </div>
              </div>
            </div>

            <div className="glass-strong rounded-2xl p-6 hover-lift">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Total Registrants</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {events.reduce((sum, e) => sum + (e.registrants?.length || 0), 0)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-accent rounded-xl flex items-center justify-center">
                  <i className="fas fa-users text-white text-xl"></i>
                </div>
              </div>
            </div>

            <div className="glass-strong rounded-2xl p-6 hover-lift">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Page Views</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {events.reduce((sum, e) => sum + (e.pageViews || 0), 0)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-success rounded-xl flex items-center justify-center">
                  <i className="fas fa-eye text-white text-xl"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Events Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-display font-bold text-slate-900">Your Events</h2>
          <Button
            onClick={() => {
              setWizardStep(1);
              setView('create');
              setTopic('');
              setGeneratedContent(null);
            }}
            className="bg-gradient-brand hover:shadow-neon transition-all duration-300 btn-press"
          >
            <i className="fas fa-plus mr-2"></i> New Event
          </Button>
        </div>

        {events.length === 0 ? (
          <div className="glass-strong rounded-3xl p-16 text-center animate-fade-in">
            <div className="w-20 h-20 bg-gradient-brand rounded-full flex items-center justify-center mx-auto mb-6 animate-float">
              <i className="fas fa-rocket text-white text-3xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-3">No events yet</h3>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              Get started by creating your first webinar event with AI-powered content generation.
            </p>
            <Button
              onClick={() => {
                setWizardStep(1);
                setView('create');
                setTopic('');
                setGeneratedContent(null);
              }}
              className="bg-gradient-brand hover:shadow-neon transition-all duration-300"
            >
              Create Your First Event
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event, index) => (
              <div
                key={event.id}
                className={`group relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-lift transition-all duration-300 hover:-translate-y-2 animate-fade-in ${index === 0 ? 'md:col-span-2 md:row-span-2' : ''
                  }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Cover Image */}
                <div className={`relative overflow-hidden ${index === 0 ? 'h-80' : 'h-48'}`}>
                  <img
                    src={event.headerImageUrl || event.coverImage || `https://picsum.photos/seed/${event.imageKeyword}/1200/600`}
                    alt={event.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>

                  {/* Integration Badge */}
                  <div className="absolute top-4 right-4 glass-strong px-3 py-1.5 rounded-full text-xs font-bold text-white backdrop-blur-md">
                    {event.integrationConfig?.type === 'none' || !event.integrationConfig ? 'Native' : event.integrationConfig?.type}
                  </div>

                  {/* Featured Badge for first event */}
                  {index === 0 && (
                    <div className="absolute top-4 left-4 bg-gradient-accent px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-neon-accent">
                      <i className="fas fa-star mr-1"></i> Featured
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className={`font-bold text-slate-900 mb-3 line-clamp-2 ${index === 0 ? 'text-2xl' : 'text-xl'}`}>
                    {event.title}
                  </h3>

                  {index === 0 && (
                    <p className="text-slate-600 mb-4 line-clamp-2">{event.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
                    <span className="flex items-center">
                      <i className="far fa-calendar mr-2 text-brand-500"></i>
                      {event.date || 'No date'}
                    </span>
                    <span className="flex items-center">
                      <i className="far fa-user mr-2 text-accent-500"></i>
                      {event.registrants?.length || 0} Reg.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      className="flex-1 text-sm hover-lift btn-press"
                      onClick={() => handleEditEvent(event)}
                    >
                      <i className="fas fa-edit mr-2"></i> Edit
                    </Button>
                    <Button
                      className="flex-1 text-sm bg-gradient-brand hover:shadow-neon btn-press"
                      onClick={() => {
                        setCurrentEvent(event);
                        setView('preview');
                      }}
                    >
                      <i className="fas fa-eye mr-2"></i> View
                    </Button>
                  </div>
                </div>

                {/* Hover Glow Effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-brand-500/10 to-accent-500/10"></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button - Mobile */}
      <button
        onClick={() => {
          setWizardStep(1);
          setView('create');
          setTopic('');
          setGeneratedContent(null);
        }}
        className="md:hidden fixed bottom-8 right-8 w-16 h-16 bg-gradient-brand rounded-full shadow-lift hover:shadow-neon flex items-center justify-center text-white text-2xl animate-float btn-press z-50"
      >
        <i className="fas fa-plus"></i>
      </button>
    </div>
  );
};