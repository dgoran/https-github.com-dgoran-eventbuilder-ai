
import React from 'react';
import { Play, Check, ArrowRight } from 'lucide-react';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-indigo-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                                E
                            </div>
                            <span className="font-bold text-xl text-slate-900 tracking-tight">EventBuilder<span className="text-indigo-600">.ai</span></span>
                        </div>

                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">Features</a>
                            <a href="#solutions" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">Solutions</a>
                            <a href="#pricing" className="text-slate-600 hover:text-indigo-600 font-medium transition-colors">Pricing</a>
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={onLogin}
                                className="text-slate-600 hover:text-indigo-600 font-bold transition-colors"
                            >
                                Log In
                            </button>
                            <button
                                onClick={onGetStarted}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full font-bold shadow-lg shadow-indigo-200 transition-all hover:scale-105 active:scale-95"
                            >
                                Get Started for Free
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">

                        {/* Text Content */}
                        <div className="relative z-10 animate-fade-in-up">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 font-bold text-sm mb-8 border border-indigo-100">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                New: AI-Powered Agenda Generation
                            </div>

                            <h1 className="text-5xl lg:text-7xl font-extrabold text-slate-900 leading-[1.1] mb-8 tracking-tight">
                                Create World-Class <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
                                    Virtual Events
                                </span>
                                <br /> in Seconds.
                            </h1>

                            <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-lg">
                                Automate your event planning workflow. From agenda creation to landing pages and registration — let AI handle the heavy lifting while you focus on the content.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    onClick={onGetStarted}
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-slate-200 transition-all hover:translate-y-[-2px] flex items-center justify-center gap-3"
                                >
                                    Start Building Now <ArrowRight className="w-5 h-5" />
                                </button>
                                <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 group">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all">
                                        <Play className="w-3 h-3 text-slate-900 fill-current ml-0.5" />
                                    </div>
                                    Watch Demo
                                </button>
                            </div>

                            <div className="mt-12 flex items-center gap-4 text-sm text-slate-500 font-medium">
                                <div className="flex -space-x-3">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden">
                                            <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" />
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <div className="flex text-yellow-500 gap-0.5">
                                        {'★'.repeat(5)}
                                    </div>
                                    <p>Trusted by 10,000+ Event Planners</p>
                                </div>
                            </div>
                        </div>

                        {/* Visual */}
                        <div className="relative z-0">
                            <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>
                            <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-pink-500/10 rounded-full blur-[100px]"></div>

                            <div className="relative bg-white/50 backdrop-blur-sm border border-white/50 rounded-2xl p-4 shadow-2xl transform rotate-[-2deg] hover:rotate-0 transition-all duration-700">
                                <img
                                    src="https://images.unsplash.com/photo-1540575467063-17e6fc8c62d8?auto=format&fit=crop&q=80&w=2600"
                                    alt="Event Dashboard Preview"
                                    className="rounded-xl shadow-lg border border-slate-100 w-full"
                                />

                                {/* Floating Elements */}
                                <div className="absolute -right-8 top-20 bg-white p-4 rounded-xl shadow-xl animate-float border border-slate-100">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                            <Check className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Status</p>
                                            <p className="font-bold text-slate-900">Registration Live</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="absolute -left-6 bottom-32 bg-white p-4 rounded-xl shadow-xl animate-float-delayed border border-slate-100 max-w-[200px]">
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">AI Suggestion</p>
                                    <p className="text-sm font-medium text-slate-800">"Your agenda needs a networking break at 2:00 PM."</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* Social Proof */}
            <section className="py-12 border-y border-slate-100 bg-slate-50/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="text-slate-500 font-semibold mb-8 uppercase tracking-widest text-sm">Powering events for innovative companies</p>
                    <div className="flex flex-wrap justify-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        {['Acme Corp', 'GlobalTech', 'Nebula', 'FoxRun', 'Circle'].map((logo) => (
                            <span key={logo} className="font-bold text-2xl text-slate-800">{logo}</span>
                        ))}
                    </div>
                </div>
            </section>

        </div>
    );
};
