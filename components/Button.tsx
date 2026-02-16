import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'dark';
}

export const Button: React.FC<ButtonProps> = ({ className, variant = 'primary', ...props }) => {
  const baseStyles = "px-6 py-3 text-sm tracking-widest uppercase font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";
  
  const variants = {
    // NOVÉMBER. Orange (#EE8D70)
    primary: "bg-[#EE8D70] text-white hover:bg-[#E07C60] border border-transparent shadow-sm",
    // Neutral
    secondary: "bg-white text-[#26392D] hover:bg-neutral-50 border border-neutral-200 shadow-sm",
    // Outline
    outline: "bg-transparent text-[#26392D] border border-[#26392D] hover:bg-[#26392D] hover:text-white",
    // Dark (for Green backgrounds)
    dark: "bg-[#213026] text-white hover:bg-black border border-transparent"
  };

  return (
    <button 
      className={twMerge(baseStyles, variants[variant], className)}
      {...props}
    />
  );
};