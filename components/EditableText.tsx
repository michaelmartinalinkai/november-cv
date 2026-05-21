import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';

interface EditableTextProps {
    value: string;
    onChange: (newValue: string) => void;
    isEditing: boolean;
    className?: string;
    style?: React.CSSProperties;
    multiline?: boolean;
}

export const EditableText: React.FC<EditableTextProps> = ({
    value,
    onChange,
    isEditing,
    className,
    style,
    multiline = false
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const elementRef = useRef<HTMLElement>(null);

    // Sync external value changes to the DOM when not focused
    useEffect(() => {
        if (elementRef.current && !isFocused && elementRef.current.innerText !== value) {
            elementRef.current.innerText = value;
        }
    }, [value, isFocused]);

    const handleBlur = () => {
        setIsFocused(false);
        if (!elementRef.current) return;
        const currentText = elementRef.current.innerText || '';
        if (currentText !== value) {
            onChange(currentText);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!multiline && e.key === 'Enter') {
            e.preventDefault();
            elementRef.current?.blur();
        }
    };

    // Force plain text paste across all browsers — strips HTML formatting, preserves \n for multi-line
    const handlePaste = (e: React.ClipboardEvent) => {
        if (!isEditing) return;
        e.preventDefault();
        let text = e.clipboardData.getData('text/plain') || '';
        // For single-line fields, strip ALL newlines (replace with spaces) — prevents weird wrapping
        if (!multiline) {
            text = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        }
        // document.execCommand is deprecated but the most reliable cross-browser way to insert text
        // inside a contentEditable while preserving cursor position
        try {
            document.execCommand('insertText', false, text);
        } catch {
            // Fallback for browsers where execCommand is disabled — manually insert at selection
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));
                range.collapse(false);
            }
        }
    };

    const Tag = 'span';

    return (
        <Tag
            ref={elementRef as any}
            contentEditable={isEditing}
            suppressContentEditableWarning
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className={clsx(
                className,
                isEditing && 'outline-none cursor-text',
                isEditing && isFocused && 'ring-2 ring-[#e3fd01]/50 rounded-sm bg-[#e3fd01]/10',
                isEditing && !isFocused && 'hover:bg-black/5 rounded-sm transition-colors'
            )}
            style={{
                ...style,
                minWidth: isEditing ? '20px' : 'auto',
                display: isEditing ? 'inline-block' : 'inline',
                whiteSpace: 'pre-wrap', // pre-wrap is needed to preserve spaces in contentEditable
                wordBreak: 'break-word'
            }}
        >
            {/* We only inject children on first render; after that contentEditable manages it, unless re-synced in useEffect */}
            {value}
        </Tag>
    );
};
