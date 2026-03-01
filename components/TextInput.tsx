import React from 'react';
import { Clipboard, FileText } from 'lucide-react';

interface TextInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-neutral-50 p-8 border border-neutral-200 shadow-sm focus-within:border-neutral-400 transition-colors">
        <div className="flex items-center gap-2 mb-4 text-neutral-500">
           <FileText size={16} />
           <span className="text-xs uppercase tracking-widest font-semibold">Additional Text Context (Optional)</span>
        </div>
        <textarea
          className="w-full h-48 p-4 text-xs font-mono bg-white border border-neutral-200 focus:border-black focus:ring-0 outline-none resize-y transition-colors"
          placeholder="Paste raw text here if you are not uploading a file, or add extra notes..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};