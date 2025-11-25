
import React, { useRef, useEffect } from 'react';
import type { ContextMenu as ContextMenuType } from '../types';

interface ContextMenuProps extends ContextMenuType {
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ position, options, title, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Use timeout to prevent the menu from closing immediately on the same click that opened it.
        setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const menuStyle: React.CSSProperties = {
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 50,
    };

    return (
        <div ref={menuRef} style={menuStyle} className="glass-panel rounded-xl p-2 min-w-[240px] animate-in fade-in zoom-in-95 duration-100">
            {title && <h3 className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 mb-1">{title}</h3>}
            <ul className="space-y-1">
                {options.map((option, index) => (
                    <li key={index}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                option.action();
                            }}
                            disabled={option.disabled}
                            className="w-full text-left p-2 flex items-center space-x-3 rounded-lg hover:bg-white/10 hover:shadow-[0_0_15px_rgba(0,243,255,0.1)] disabled:text-slate-600 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all group"
                        >
                            {option.icon && <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 rounded-md group-hover:bg-neon-blue/20 group-hover:text-neon-blue transition-colors">{option.icon}</div>}
                            <div>
                                <p className="text-sm font-medium text-slate-200 group-hover:text-white">{option.label}</p>
                                {option.description && <p className="text-xs text-slate-500 group-hover:text-slate-400">{option.description}</p>}
                            </div>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};