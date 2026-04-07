'use client';

import { useState, useRef, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CommandEntry {
  command: string;
  response: string;
  timestamp: number;
  success: boolean;
}

export function CommandTerminal() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const executeCommand = async () => {
    if (!input.trim() || loading) return;

    const command = input.trim();
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setHistory(prev => [...prev, {
        command,
        response: data.response || 'No response',
        timestamp: Date.now(),
        success: data.success !== false,
      }]);
    } catch {
      setHistory(prev => [...prev, {
        command,
        response: 'Failed to connect to Syndex API',
        timestamp: Date.now(),
        success: false,
      }]);
    }

    setLoading(false);
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-cyan-400">SYNDEX COMMAND</span>
        <span className="text-xs text-[var(--text-secondary)]">Natural language treasury control</span>
      </div>

      {/* History */}
      <div ref={scrollRef} className="h-48 overflow-y-auto mb-3 space-y-2 font-mono text-xs">
        {history.length === 0 && (
          <div className="text-[var(--text-secondary)] italic">
            <p>Try commands like:</p>
            <p className="mt-1 text-cyan-400/60">&gt; show network status</p>
            <p className="text-cyan-400/60">&gt; move 50 USDt from banker to strategist</p>
            <p className="text-cyan-400/60">&gt; pause the patron agent</p>
            <p className="text-cyan-400/60">&gt; what&apos;s the total yield earned?</p>
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i}>
            <div className="text-cyan-400">
              <span className="text-[var(--text-secondary)]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              {' > '}{entry.command}
            </div>
            <div className={entry.success ? 'text-green-400/80 ml-2' : 'text-red-400/80 ml-2'}>
              {entry.response}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-yellow-400 animate-pulse ml-2">thinking...</div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <span className="text-cyan-400 font-mono text-sm self-center">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && executeCommand()}
          placeholder="Enter command..."
          disabled={loading}
          className="flex-1 bg-transparent border-b border-[var(--border)] text-sm font-mono outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-cyan-400 transition-colors py-1"
        />
        <button
          onClick={executeCommand}
          disabled={loading || !input.trim()}
          className="px-3 py-1 text-xs font-bold bg-cyan-400/10 text-cyan-400 rounded border border-cyan-400/30 hover:bg-cyan-400/20 transition-colors disabled:opacity-30"
        >
          RUN
        </button>
      </div>
    </div>
  );
}
