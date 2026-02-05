
import React, { useState } from 'react';
import { Mail, Check, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { User } from '../../types';

interface AuthFlowProps {
    onComplete: (user: User) => void;
    onCancel: () => void;
}

type Step = 'EMAIL' | 'DETAILS' | 'VERIFY';

export const AuthFlow: React.FC<AuthFlowProps> = ({ onComplete, onCancel }) => {
    const [step, setStep] = useState<Step>('EMAIL');
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [orgName, setOrgName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Real backend call to send magic link
    const sendMagicLink = async (toEmail: string) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: toEmail,
                    firstName,
                    lastName,
                    orgName
                })
            });
            if (!res.ok) throw new Error('Failed to send link');
        } catch (e) {
            console.error(e);
            setError('Could not send login link. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        setStep('DETAILS');
    };

    const handleDetailsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName || !lastName || !orgName) return;

        await sendMagicLink(email);
        setStep('VERIFY');
    };

    const [tokenInput, setTokenInput] = useState('');

    const handleVerify = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!tokenInput) return;

        setIsLoading(true);
        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenInput })
            });

            if (!res.ok) throw new Error('Invalid token');

            const data = await res.json();
            onComplete(data.user);
        } catch (error) {
            setError('Invalid or expired token');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSSO = async (provider: string) => {
        setIsLoading(true);

        if (provider === 'Google') {
            window.location.href = '/api/auth/google';
            return;
        }
        if (provider === 'Microsoft') {
            window.location.href = '/api/auth/microsoft';
            return;
        }
        if (provider === 'LinkedIn') {
            window.location.href = '/api/auth/linkedin';
            return;
        }

        // Fallback or other providers
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsLoading(false);

        onComplete({
            email: `user@${provider.toLowerCase()}.com`,
            name: 'Demo User',
            orgName: 'Acme Corp',
            isAuthenticated: true,
            token: 'mock-sso-token'
        });
    };

    const SSOButton = ({ provider, color, icon, onClick }: { provider: string, color: string, icon?: React.ReactNode, onClick: () => void }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={isLoading}
            className={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-all hover:scale-[1.01] hover:shadow-sm mb-3 disabled:opacity-50 disabled:pointer-events-none`}
        >
            {icon}
            <span>Continue with {provider}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">

                {/* Header */}
                <div className="px-8 pt-8 pb-4">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">
                            {step === 'EMAIL' && 'Welcome to EventBuilder'}
                            {step === 'DETAILS' && 'Tell us about yourself'}
                            {step === 'VERIFY' && 'Check your email'}
                        </h2>
                        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none">&times;</button>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex gap-2 mb-2">
                        <div className={`h-1.5 rounded-full flex-1 transition-all ${step === 'EMAIL' ? 'bg-indigo-600' : 'bg-indigo-200'}`} />
                        <div className={`h-1.5 rounded-full flex-1 transition-all ${step === 'DETAILS' ? 'bg-indigo-600' : (step === 'VERIFY' ? 'bg-indigo-200' : 'bg-slate-100')}`} />
                        <div className={`h-1.5 rounded-full flex-1 transition-all ${step === 'VERIFY' ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                    </div>
                </div>

                <div className="px-8 pb-8">
                    {step === 'EMAIL' && (
                        <form onSubmit={handleEmailSubmit} className="space-y-6">
                            <div className="space-y-4">
                                <SSOButton
                                    onClick={() => handleSSO('Google')}
                                    provider="Google"
                                    color="white"
                                    icon={<span className="font-bold text-blue-500">G</span>}
                                />
                                <SSOButton
                                    onClick={() => handleSSO('Microsoft')}
                                    provider="Microsoft"
                                    color="white"
                                    icon={<span className="font-bold text-slate-600">M</span>}
                                />
                                <div className="relative flex items-center py-2">
                                    <div className="flex-grow border-t border-slate-200"></div>
                                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Or with email</span>
                                    <div className="flex-grow border-t border-slate-200"></div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                        placeholder="name@company.com"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all hover:translate-y-[-1px] shadow-lg shadow-indigo-200"
                            >
                                Continue
                            </button>
                        </form>
                    )}

                    {step === 'DETAILS' && (
                        <form onSubmit={handleDetailsSubmit} className="space-y-5 animate-fade-in-right">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Organization Name</label>
                                <input
                                    type="text"
                                    required
                                    value={orgName}
                                    onChange={(e) => setOrgName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Next Step <ArrowRight className="w-5 h-5" /></>}
                            </button>
                        </form>
                    )}

                    {step === 'VERIFY' && (
                        <div className="text-center animate-fade-in-right">
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Mail className="w-10 h-10 text-green-600" />
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mb-2">We sent you a magic link</h3>
                            <p className="text-slate-600 mb-8">
                                Check your inbox at <span className="font-bold text-slate-900">{email}</span> and click the link to sign in instantly.
                            </p>

                            <form onSubmit={handleVerify} className="space-y-4">
                                <div className="text-left">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Login Code (from link)</label>
                                    <input
                                        type="text"
                                        value={tokenInput}
                                        onChange={(e) => setTokenInput(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-center font-mono text-lg tracking-widest uppercase"
                                        placeholder="PASTE TOKEN HERE"
                                    />
                                    <p className="text-xs text-slate-500 mt-2 text-center">
                                        * In production, clicking the email link handles this automatically. For this demo, copy the token from the server console.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !tokenInput}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Verify & Login</span>}
                                </button>
                            </form>

                            <p className="mt-6 text-xs text-slate-400">
                                Did not receive it? <button className="text-indigo-600 hover:underline">Resend</button>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
