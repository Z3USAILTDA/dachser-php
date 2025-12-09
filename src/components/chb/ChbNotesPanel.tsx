import { useState } from 'react';
import { ChbNote } from '@/types/chb';
import { stepTitles } from '@/data/chbMocks';
import { MessageSquare, User, Clock, Send } from 'lucide-react';

interface ChbNotesPanelProps {
  stepId: number;
  notes: ChbNote[];
  onAddNote: (content: string) => void;
}

export function ChbNotesPanel({ stepId, notes, onAddNote }: ChbNotesPanelProps) {
  const [newNote, setNewNote] = useState('');

  const handleSubmit = () => {
    if (newNote.trim()) {
      onAddNote(newNote.trim());
      setNewNote('');
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">
        Observações — {stepTitles[stepId]}
      </h3>

      <div className="space-y-4">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Digite uma observação interna..."
          className="w-full h-32 p-4 rounded-xl bg-black/40 border border-white/10 
            text-white placeholder-white/30 resize-none
            focus:outline-none focus:border-amber-500/50"
        />
        
        <button
          onClick={handleSubmit}
          disabled={!newNote.trim()}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-black font-medium
            hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          Salvar observação
        </button>
      </div>

      {notes.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-white/10">
          <h4 className="text-sm font-medium text-white/60">Observações anteriores</h4>
          
          {notes.map((note) => (
            <div key={note.id} className="p-4 rounded-xl bg-black/30 border border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-amber-500 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {note.user}
                </span>
                <span className="text-xs text-white/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {note.date}
                </span>
              </div>
              <p className="text-sm text-white/80">{note.content}</p>
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !newNote && (
        <div className="p-8 text-center rounded-xl bg-black/30 border border-white/10">
          <MessageSquare className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">Nenhuma observação registrada.</p>
        </div>
      )}
    </div>
  );
}
