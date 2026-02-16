import React, { useRef, useState } from 'react';
import { Upload, Plus, Loader2, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from './Button';

interface FileUploaderProps {
  onFilesSelect: (files: File[]) => void;
  onDriveClick?: () => void;
  title?: string;
  subtitle?: string;
  isProcessing?: boolean;
  processingText?: string;
  successFileName?: string | null;
  successText?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFilesSelect, 
  onDriveClick,
  title = "Upload CVs (Batch)",
  subtitle = "PDF, Word (.docx) or Image",
  isProcessing = false,
  processingText = "Processing...",
  successFileName = null,
  successText = "File processed successfully"
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing && !successFileName) {
        setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessing || (successFileName && !e.dataTransfer.files.length)) return; 
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleClick = () => {
    if (!isProcessing) {
        fileInputRef.current?.click();
    }
  };

  // Content Rendering Logic based on State
  const renderContent = () => {
    if (isProcessing) {
      return (
        <div className="flex flex-col items-center animate-fade-in pointer-events-none">
           <Loader2 size={32} className="text-[#EE8D70] animate-spin mb-3" />
           <p className="text-xs text-neutral-600 font-bold">{processingText}</p>
        </div>
      );
    }

    if (successFileName) {
      return (
        <div className="flex flex-col items-center animate-fade-in cursor-pointer" onClick={handleClick}>
           <CheckCircle size={40} className="text-[#4caf50] mb-3" />
           <p className="text-sm text-[#1E3A35] font-bold">{successFileName}</p>
           <p className="text-[10px] text-[#4caf50] uppercase mt-1 tracking-wider">{successText}</p>
           <p className="text-[9px] text-neutral-400 mt-4 hover:underline">Click to replace file</p>
        </div>
      );
    }

    return (
      <>
        <div className={clsx(
            "mb-4 p-4 rounded-full transition-colors duration-300",
            isDragging ? "bg-[#EE8D70] text-white" : "bg-[#26392D]/5 text-[#26392D]"
          )}>
          <Upload size={24} />
        </div>
        
        <h3 className="font-serif text-lg mb-2 text-[#26392D]">{title}</h3>
        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-6">
          {subtitle}
        </p>

        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="primary" onClick={(e) => { e.stopPropagation(); handleClick(); }} className="text-xs py-2 px-6">
            <Plus size={14} className="mr-2 inline" /> Select Files
          </Button>
          {onDriveClick && (
            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); onDriveClick(); }} className="text-xs py-2 px-6">
                <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className="w-4 h-4 mr-2 inline" alt="Drive" />
                Google Drive
            </Button>
          )}
        </div>

        <span className="mt-6 text-[10px] text-neutral-300 uppercase tracking-widest">
          Drag & drop files here
        </span>
      </>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          "relative border border-dashed p-10 transition-all duration-300 group bg-white flex flex-col items-center justify-center text-center shadow-sm min-h-[300px]",
          isDragging ? "border-[#EE8D70] bg-[#EE8D70]/5" : "border-neutral-300 hover:border-[#26392D]/30"
        )}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.txt"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              onFilesSelect(Array.from(e.target.files));
            }
            e.target.value = ''; // Reset
          }}
        />
        
        {renderContent()}
      </div>
    </div>
  );
};