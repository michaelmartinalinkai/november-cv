
import React, { useState } from 'react';
import { Button } from './Button';
import { Lock, ArrowRight, Mail } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);

  // HARDCODED PASSWORD CONFIGURATION
  const ACCESS_PASSWORD = process.env.REACT_APP_PASSWORD || "november2025";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ACCESS_PASSWORD) {
      onLogin(email);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#26392D] text-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#EE8D70] rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md p-6 relative z-10">
        <div className="flex flex-col items-center mb-12">
          {/* Container wraps tightly around the widest element (The Logo) */}
          <div className="inline-flex flex-col items-center">
            
            {/* Logo Row: Text Only */}
            <div className="flex items-center gap-4 mb-4">
              <h1 className="font-serif text-6xl tracking-tighter leading-none font-semibold">NOVÉMBER.</h1>
            </div>
            
            {/* The Line: 1px height, Neon Green color, width matches the container */}
            <div className="w-full h-[1px] bg-[#D3FF2F]"></div>
            
            <p className="mt-4 text-[10px] tracking-[0.4em] uppercase text-[#D3FF2F] font-bold">
              Internal Conversion System
            </p>
          </div>
        </div>

        {/* Login Box - White Background */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white p-10 shadow-2xl rounded-sm">
          
          {/* Email Input */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mail size={14} className="text-neutral-400 group-focus-within:text-[#EE8D70] transition-colors" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="YOUR EMAIL (FOR SIGNATURE)"
              className="w-full bg-neutral-50 border border-neutral-200 py-4 pl-12 pr-4 text-sm text-[#26392D] outline-none focus:border-[#EE8D70] focus:bg-white transition-all placeholder:text-neutral-400 placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest"
              autoFocus
            />
          </div>

          {/* Password Input */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock size={14} className="text-neutral-400 group-focus-within:text-[#EE8D70] transition-colors" />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              placeholder="ENTER ACCESS PASSWORD"
              className="w-full bg-neutral-50 border border-neutral-200 py-4 pl-12 pr-4 text-sm text-[#26392D] outline-none focus:border-[#EE8D70] focus:bg-white transition-all placeholder:text-neutral-400 placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest"
            />
          </div>

          {error && (
            <div className="text-[#EE8D70] text-[10px] uppercase tracking-widest text-center animate-pulse font-bold bg-[#EE8D70]/10 py-3 border border-[#EE8D70]/20">
              Incorrect Password provided
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full py-4 mt-2 group shadow-md hover:shadow-lg">
            Login to System <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </form>

        <div className="mt-12 text-center">
            <p className="text-[9px] text-white/20 uppercase tracking-widest">
                POWERED BY LINKAI — DESIGNED FOR NOVÉMBER. &copy; 2025
            </p>
        </div>
      </div>
    </div>
  );
};
