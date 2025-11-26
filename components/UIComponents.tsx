import React from 'react';
import { X } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading,
  disabled,
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center font-semibold rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-lg"
  };

  const variants = {
    primary: "border-transparent text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 hover:shadow-lg hover:shadow-blue-500/30 focus:ring-blue-500",
    secondary: "border-gray-200 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-200 hover:shadow-md",
    danger: "border-transparent text-white bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 focus:ring-red-500 shadow-red-500/30 hover:shadow-lg hover:shadow-red-500/40",
    ghost: "border-transparent text-blue-600 bg-transparent hover:bg-blue-50 focus:ring-blue-500 shadow-none hover:text-blue-700"
  };

  return (
    <button
      className={`${baseStyle} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">{label}</label>}
      <input
        className={`appearance-none block w-full px-5 py-4 border ${error ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:border-brand-500 focus:ring-brand-100'} rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-4 transition-all duration-300 text-base bg-gray-50 focus:bg-white ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600 animate-fade-in">{error}</p>}
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode, className?: string, title?: string, actions?: React.ReactNode }> = ({ children, className = '', title, actions }) => {
  return (
    <div className={`bg-white shadow-xl shadow-gray-200/50 rounded-3xl border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-brand-500/10 ${className}`}>
      {(title || actions) && (
        <div className="px-8 py-6 flex justify-between items-center border-b border-gray-50 bg-white">
          {title && <h3 className="text-xl font-display font-bold text-gray-900">{title}</h3>}
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className="px-8 py-8">
        {children}
      </div>
    </div>
  );
};

// Glassmorphism Card Component
export const GlassCard: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`glass-strong rounded-2xl p-6 backdrop-blur-xl transition-all duration-300 hover:shadow-glass-lg ${className}`}>
      {children}
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform transition-all animate-scale-in border border-gray-100">
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h3 className="font-display font-bold text-xl text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
};