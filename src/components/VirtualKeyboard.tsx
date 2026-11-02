import React, { useState } from 'react';
import { Send, CornerDownLeft, Delete, Terminal, Minimize2, ChevronUp } from 'lucide-react';

interface VirtualKeyboardProps {
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendKeyCombo: (keys: string[]) => void;
  lang: 'bn' | 'en';
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  onSendText,
  onSendKey,
  onSendKeyCombo,
  lang,
}) => {
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<{ ctrl: boolean; alt: boolean; shift: boolean }>({
    ctrl: false,
    alt: false,
    shift: false,
  });

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendText(inputText);
      setInputText('');
    }
  };

  const handleKeyClick = (key: string) => {
    if (activeModifiers.ctrl || activeModifiers.alt || activeModifiers.shift) {
      const keys: string[] = [];
      if (activeModifiers.ctrl) keys.push('Control');
      if (activeModifiers.alt) keys.push('Alt');
      if (activeModifiers.shift) keys.push('Shift');
      keys.push(key);
      onSendKeyCombo(keys);
      setActiveModifiers({ ctrl: false, alt: false, shift: false });
    } else {
      onSendKey(key);
    }
  };

  const toggleModifier = (mod: 'ctrl' | 'alt' | 'shift') => {
    setActiveModifiers((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  return (
    <div className="bg-slate-900/95 border-t border-slate-700/80 backdrop-blur-md shadow-2xl transition-all">
      {/* Quick Input Bar (Direct Typing on Phone) */}
      <form onSubmit={handleTextSubmit} className="p-2.5 flex items-center gap-2 max-w-4xl mx-auto">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              lang === 'bn'
                ? 'ফোনে টাইপ করুন এবং Send চাপুন (Text / URL)...'
                : 'Type text or command to send to remote browser...'
            }
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-sans shadow-inner"
          />
          {inputText && (
            <button
              type="button"
              onClick={() => setInputText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-medium px-4 py-2.5 rounded-xl text-sm flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">{lang === 'bn' ? 'পাঠান' : 'Send'}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2.5 rounded-xl border transition-colors shrink-0 ${
            isExpanded
              ? 'bg-sky-500/20 border-sky-400 text-sky-300'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
          title={lang === 'bn' ? 'ভার্চুয়াল কীবোর্ড অন/অফ' : 'Toggle Virtual Remote Keyboard'}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </form>

      {/* Expandable Virtual Mobile & Windows Keyboard */}
      {isExpanded && (
        <div className="px-2.5 pb-3 pt-1 border-t border-slate-800/80 max-w-4xl mx-auto space-y-2 select-none animate-in fade-in duration-200">
          {/* Windows / Remote Desktop Quick Shortcuts */}
          <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pb-1">
            <button
              type="button"
              onClick={() => onSendKeyCombo(['Control', 'Alt', 'Delete'])}
              className="px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-rose-950/60 border border-rose-800/70 text-rose-300 hover:bg-rose-900/60 active:scale-95 transition-transform"
            >
              Ctrl+Alt+Del
            </button>
            <button
              type="button"
              onClick={() => onSendKeyCombo(['Alt', 'F4'])}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-amber-950/60 border border-amber-800/70 text-amber-300 hover:bg-amber-900/60 active:scale-95 transition-transform"
            >
              Alt+F4
            </button>
            <button
              type="button"
              onClick={() => onSendKeyCombo(['Control', 'a'])}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 active:scale-95 transition-transform"
            >
              Select All (Ctrl+A)
            </button>
            <button
              type="button"
              onClick={() => onSendKeyCombo(['Control', 'c'])}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 active:scale-95 transition-transform"
            >
              Copy (Ctrl+C)
            </button>
            <button
              type="button"
              onClick={() => onSendKeyCombo(['Control', 'v'])}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 active:scale-95 transition-transform"
            >
              Paste (Ctrl+V)
            </button>
            <button
              type="button"
              onClick={() => onSendKey('F5')}
              className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 active:scale-95 transition-transform"
            >
              Reload (F5)
            </button>
          </div>

          {/* Special Function Row */}
          <div className="grid grid-cols-7 gap-1">
            <button
              type="button"
              onClick={() => handleKeyClick('Escape')}
              className="py-2 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 active:scale-95"
            >
              ESC
            </button>
            <button
              type="button"
              onClick={() => handleKeyClick('Tab')}
              className="py-2 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 active:scale-95"
            >
              TAB
            </button>
            <button
              type="button"
              onClick={() => handleKeyClick('Meta')}
              className="py-2 text-xs font-medium bg-sky-950/70 border border-sky-800 text-sky-300 rounded-lg hover:bg-sky-900 active:scale-95 flex items-center justify-center gap-1"
            >
              <span>⊞</span> Win
            </button>
            <button
              type="button"
              onClick={() => toggleModifier('ctrl')}
              className={`py-2 text-xs font-medium rounded-lg border active:scale-95 ${
                activeModifiers.ctrl
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              CTRL
            </button>
            <button
              type="button"
              onClick={() => toggleModifier('alt')}
              className={`py-2 text-xs font-medium rounded-lg border active:scale-95 ${
                activeModifiers.alt
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              ALT
            </button>
            <button
              type="button"
              onClick={() => toggleModifier('shift')}
              className={`py-2 text-xs font-medium rounded-lg border active:scale-95 ${
                activeModifiers.shift
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              SHIFT
            </button>
            <button
              type="button"
              onClick={() => handleKeyClick('Backspace')}
              className="py-2 text-xs font-medium bg-red-950/50 text-red-300 border border-red-800/60 rounded-lg hover:bg-red-900/60 active:scale-95 flex items-center justify-center"
            >
              <Delete className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Navigation & Common Actions Row */}
          <div className="flex gap-1 items-center">
            <button
              type="button"
              onClick={() => handleKeyClick(' ')}
              className="flex-1 py-2 text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-700 active:scale-95 font-mono"
            >
              SPACE (␣)
            </button>
            <button
              type="button"
              onClick={() => handleKeyClick('Enter')}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg active:scale-95 flex items-center gap-1 shadow-sm"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              <span>ENTER</span>
            </button>
            {/* Arrows */}
            <div className="flex gap-1 ml-1">
              <button
                type="button"
                onClick={() => handleKeyClick('ArrowLeft')}
                className="w-8 py-2 text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 active:scale-95"
              >
                ◀
              </button>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => handleKeyClick('ArrowUp')}
                  className="w-8 h-4 text-[9px] bg-slate-800 text-slate-200 border border-slate-700 rounded hover:bg-slate-700 active:scale-95 flex items-center justify-center"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyClick('ArrowDown')}
                  className="w-8 h-4 text-[9px] bg-slate-800 text-slate-200 border border-slate-700 rounded hover:bg-slate-700 active:scale-95 flex items-center justify-center"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleKeyClick('ArrowRight')}
                className="w-8 py-2 text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-700 active:scale-95"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
