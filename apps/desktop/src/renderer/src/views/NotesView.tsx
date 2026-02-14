import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  listMemoryNotes,
  getMemoryNote,
  createMemoryNote,
  updateMemoryNote,
  deleteMemoryNote,
  importMemoryNotes,
  NoteSummary
} from '../services/api'
import {
  PencilSquareIcon,
  FolderPlusIcon,
  DocumentPlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ChevronRightIcon,
  InboxIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import { useI18n } from '../i18n'
import ConfirmationCard from '../components/floating/ConfirmationCard'

// --- Main Component ---

export default function NotesView() {
  const { t } = useI18n()
  
  // State
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  
  // Context Menu & Renaming State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, noteId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  
  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Refs
  const lastSaved = useRef({ title: '', content: '' })
  const saveTimer = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  // Memoized Filtered List
  const filteredNotes = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) =>
      [note.title, note.preview || ''].some((value) => value.toLowerCase().includes(query))
    )
  }, [filterText, notes])

  // Data Actions
  const loadNotes = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listMemoryNotes()
      setNotes(data)
      if (!activeId && data.length > 0) await selectNote(data[0].id)
    } catch (err) {
      setError(t('notes.errors.load'))
    } finally {
      setIsLoading(false)
    }
  }

  const selectNote = async (noteId: string) => {
    setActiveId(noteId)
    setIsLoading(true)
    setError(null)
    try {
      const note = await getMemoryNote(noteId)
      setTitle(note.title)
      setContent(note.content)
      lastSaved.current = { title: note.title, content: note.content }
    } catch (err) {
      setError(t('notes.errors.open'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadNotes() }, [])

  // Auto-Save Logic
  useEffect(() => {
    if (!activeId) return
    if (title === lastSaved.current.title && content === lastSaved.current.content) return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      try {
        setIsSaving(true)
        const updated = await updateMemoryNote(activeId, { title, content })
        lastSaved.current = { title: updated.title, content: updated.content }
        setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, title: updated.title, updated_at: new Date().toISOString() } : n))
      } catch (err) {
        setError(t('notes.errors.save'))
      } finally {
        setIsSaving(false)
      }
    }, 1000)

    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [activeId, title, content])

  const handleCreateNote = async () => {
    setError(null)
    try {
      const note = await createMemoryNote(t('notes.newNoteTitleDefault'), '')
      setNotes(prev => [note, ...prev])
      await selectNote(note.id)
    } catch (err) { setError(t('notes.errors.create')) }
  }

  const handleDeleteNote = (id?: string) => {
    const targetId = id || activeId
    if (!targetId) return
    setDeleteConfirmId(targetId)
  }

  const confirmDeleteNote = async () => {
    if (!deleteConfirmId) return
    const targetId = deleteConfirmId
    setDeleteConfirmId(null)
    setError(null)
    try {
      await deleteMemoryNote(targetId)
      const updated = notes.filter(n => n.id !== targetId)
      setNotes(updated)
      if (activeId === targetId) {
        if (updated.length > 0) await selectNote(updated[0].id)
        else { setActiveId(null); setTitle(''); setContent(''); }
      }
    } catch (err) { setError(t('notes.errors.delete')) }
  }

  // --- Context Menu Handlers ---

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, noteId })
  }

  const handleStartRename = (noteId: string, currentTitle: string) => {
    setRenamingId(noteId)
    setRenameValue(currentTitle)
    setContextMenu(null)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const handleFinishRename = async () => {
    if (!renamingId) return
    if (!renameValue.trim() || renameValue === notes.find(n => n.id === renamingId)?.title) {
      setRenamingId(null)
      return
    }
    
    try {
      // Optimistic update
      setNotes(prev => prev.map(n => n.id === renamingId ? { ...n, title: renameValue } : n))
      if (activeId === renamingId) setTitle(renameValue)
      
      await updateMemoryNote(renamingId, { title: renameValue })
    } catch (err) {
      setError(t('notes.errors.save'))
    } finally {
      setRenamingId(null)
    }
  }

  const handleKeyDownRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishRename()
    if (e.key === 'Escape') setRenamingId(null)
  }

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    try {
      const payload = await Promise.all(
        Array.from(files)
          .filter((file) => file.name.toLowerCase().endsWith('.md'))
          .map(async (file) => ({
            name: file.webkitRelativePath || file.name,
            content: await file.text()
          }))
      )
      if (payload.length === 0) return
      await importMemoryNotes(payload)
      await loadNotes()
    } catch (err) {
      setError(t('notes.errors.import'))
    }
  }

  // --- Editor Extensions & Theme ---

  const markdownHighlighting = useMemo(() => {
    const textColor = 'rgb(var(--text-primary))'
    return HighlightStyle.define([
      // Heading styles
      { tag: tags.heading1, fontSize: '2.2em', fontWeight: '800', lineHeight: '1.2', letterSpacing: '-0.02em', color: textColor },
      { tag: tags.heading2, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3', color: textColor },
      { tag: tags.heading3, fontSize: '1.35em', fontWeight: '700', lineHeight: '1.4', color: textColor },
      { tag: tags.heading4, fontSize: '1.15em', fontWeight: '600', color: textColor },
      // Text styles
      { tag: tags.strong, fontWeight: '700', color: textColor },
      { tag: tags.emphasis, fontStyle: 'italic' },
      // Markdown markers
      { tag: [tags.processingInstruction, tags.punctuation, tags.meta, tags.modifier], class: 'cm-md-marker' },
      // Links
      { tag: tags.link, textDecoration: 'underline', opacity: '0.8' },
      { tag: tags.url, textDecoration: 'underline', opacity: '0.7' },
    ])
  }, [])

  const editorExtensions = useMemo(() => [
    markdown(),
    syntaxHighlighting(markdownHighlighting),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { 
        backgroundColor: 'transparent !important',
        height: '100%'
      },
      '&.cm-focused': {
        outline: 'none'
      },
      '.cm-scroller': {
        fontFamily: 'inherit',
        fontSize: '16px',
        lineHeight: '1.8',
        overflow: 'auto',
        padding: '20px 0'
      },
      '.cm-content': {
        color: 'rgb(var(--text-primary))',
        caretColor: 'rgb(var(--text-primary)) !important',
        backgroundColor: 'transparent !important'
      },
      '.cm-md-marker': {
        display: 'none'
      },
      '.cm-activeLine .cm-md-marker': {
        display: 'inline',
        opacity: '0.3',
        marginRight: '4px'
      },
      // Heading styles - using CodeMirror's built-in header classes
      '.cm-line:not(.cm-activeLine) .cm-header': {
        marginLeft: '-0.3em'
      },
      '.cm-header': {
        fontWeight: '700'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { 
        backgroundColor: 'rgb(var(--accent) / 0.25) !important'
      },
      '.cm-cursor': { borderLeftColor: 'rgb(var(--text-primary)) !important' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-gutters': { display: 'none' }
    })
  ], [markdownHighlighting])

  return (
    <div 
      className="flex-1 h-full bg-bg text-text flex font-sans overflow-hidden transition-colors duration-300"
      onClick={() => setContextMenu(null)}
    >
      
      {/* 1. Sidebar - Minimalist & Functional */}
      {!isSidebarCollapsed && (
        <aside className="w-72 border-r border-border/5 bg-sidebar flex flex-col shrink-0 transition-all duration-300">
          
          {/* Sidebar Header: Search & Toolbar */}
          <div className="p-3 space-y-2">
             <div className="relative group">
                 <input 
                   value={filterText}
                   onChange={e => setFilterText(e.target.value)}
                   placeholder="Buscar notas..."
                   className="w-full bg-input/50 hover:bg-input border border-transparent focus:border-border/20 rounded-lg pl-9 pr-3 py-2 text-xs font-medium focus:outline-none transition-all placeholder:text-text-muted/40"
                 />
                 <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/40 group-focus-within:text-accent transition-colors" />
             </div>
             
             {/* Toolbar Actions */}
             <div className="flex items-center gap-1">
                <button 
                  onClick={handleCreateNote}
                  className="p-2 text-text-muted hover:text-accent hover:bg-white/5 rounded-lg transition-all"
                  title={t('notes.newNote')}
                >
                  <PencilSquareIcon className="w-5 h-5 stroke-[1.5]" />
                </button>
                
                <div className="w-px h-4 bg-border/10 mx-1"></div>

                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-text-muted hover:text-text hover:bg-white/5 rounded-lg transition-all"
                  title={t('notes.importFiles')}
                >
                  <DocumentPlusIcon className="w-5 h-5 stroke-[1.5]" />
                </button>
                <button 
                  onClick={() => folderInputRef.current?.click()}
                  className="p-2 text-text-muted hover:text-text hover:bg-white/5 rounded-lg transition-all"
                  title={t('notes.importFolder')}
                >
                  <FolderPlusIcon className="w-5 h-5 stroke-[1.5]" />
                </button>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-0.5" onClick={() => setContextMenu(null)}>
            {isLoading && notes.length === 0 ? (
              <div className="p-4 text-center text-xs opacity-30 italic">{t('notes.loading')}</div>
            ) : filteredNotes.map(note => (
              <div key={note.id} onContextMenu={(e) => handleContextMenu(e, note.id)}>
                {renamingId === note.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleFinishRename}
                    onKeyDown={handleKeyDownRename}
                    className="w-full bg-input border border-accent/50 rounded-lg px-3 py-2 text-[13px] font-medium text-text outline-none mb-0.5"
                    autoFocus
                  />
                ) : (
                  <button 
                    onClick={() => selectNote(note.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group relative border border-transparent ${
                      note.id === activeId 
                        ? 'bg-accent/10 text-accent font-semibold' 
                        : 'text-text-muted hover:bg-white/5 hover:text-text'
                    }`}
                  >
                    <div className="text-[13px] truncate">{note.title || t('notes.untitled')}</div>
                    {/* Minimalist active indicator */}
                    {note.id === activeId && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-accent rounded-r-full"></div>}
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Context Menu Component */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-card border border-border/10 rounded-lg shadow-xl py-1 min-w-[140px] flex flex-col animate-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => handleStartRename(contextMenu.noteId, notes.find(n => n.id === contextMenu.noteId)?.title || '')}
            className="text-left px-3 py-2 text-xs text-text hover:bg-white/5 flex items-center gap-2"
          >
            <PencilIcon className="w-3.5 h-3.5 opacity-70" />
            Renomear
          </button>
          <button 
            onClick={() => { handleDeleteNote(contextMenu.noteId); setContextMenu(null); }}
            className="text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
          >
            <TrashIcon className="w-3.5 h-3.5 opacity-70" />
            Excluir
          </button>
        </div>
      )}

      {/* 2. Main Editor Content */}
      <main className="flex-1 flex flex-col bg-bg relative transition-colors duration-300" onClick={() => setContextMenu(null)}>
        <header className="h-14 border-b border-border/5 flex items-center px-6 justify-between gap-6 bg-bg/50 backdrop-blur-sm z-20">
          <div className="flex items-center gap-3 flex-1 overflow-hidden">
             <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 text-text-muted hover:text-text transition-colors rounded-md hover:bg-white/5"
             >
                {isSidebarCollapsed ? <ArrowsPointingOutIcon className="w-4 h-4" /> : <ArrowsPointingInIcon className="w-4 h-4" />}
             </button>
             
             <div className="h-4 w-px bg-border/10"></div>
             
             <div className="flex items-center gap-2 text-[11px] font-medium text-text-muted/60 tracking-wide overflow-hidden whitespace-nowrap">
                <span className="opacity-50 hover:opacity-100 transition-opacity cursor-default">MomAI</span>
                <ChevronRightIcon className="w-3 h-3 opacity-30" />
                <span className="opacity-50 hover:opacity-100 transition-opacity cursor-default">{t('notes.sidebar.title')}</span>
                {activeId && (
                  <>
                    <ChevronRightIcon className="w-3 h-3 opacity-30" />
                    <span className="font-bold px-1.5 py-0.5 truncate max-w-[300px] text-text">{title || t('notes.untitled')}</span>
                  </>
                )}
             </div>
          </div>

          <div className="flex items-center gap-4">
              {/* Saving Indicator */}
              {activeId && (
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all duration-500 ${isSaving ? 'bg-accent/10 text-accent' : 'bg-transparent text-text-muted/30'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isSaving ? 'bg-accent animate-pulse' : 'bg-current'}`}></div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{isSaving ? t('notes.syncing') : 'Saved'}</span>
                  </div>
              )}

              <div className="flex items-center gap-3">
                 {activeId && (
                   <button 
                    onClick={() => handleDeleteNote(activeId)} 
                    className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                    title={t('notes.deleteTooltip')}
                   >
                      <TrashIcon className="w-4 h-4" />
                   </button>
                 )}
              </div>
          </div>
        </header>

        {/* Error Notification */}
        {error && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-xs font-medium backdrop-blur-md shadow-xl">
             {error}
          </div>
        )}

        <div className="flex-1 relative overflow-hidden flex mt-4 h-full">
           {activeId ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar w-full">
                <div className="max-w-4xl mx-auto py-4 px-8 flex flex-col min-h-full">
                   <input
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     placeholder={t('notes.untitled')}
                     className="w-full bg-transparent text-4xl font-bold text-text mb-4 outline-none placeholder:text-text-muted/20 border-none p-0"
                   />
                   <div className="h-px bg-border/20 w-full mb-4 shrink-0"></div>
                   <CodeMirror
                     value={content}
                     onChange={(value) => setContent(value)}
                     extensions={editorExtensions}
                     basicSetup={{
                       lineNumbers: false,
                       foldGutter: false,
                        highlightActiveLine: true,
                       highlightSelectionMatches: false,
                       bracketMatching: false,
                       closeBrackets: false
                     }}
                      onCreateEditor={(view) => { 
                        editorViewRef.current = view
                      }}
                     className="w-full bg-transparent"
                   />
                </div>
              </div>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                <InboxIcon className="w-20 h-20 mb-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.5em]">{t('notes.emptySelect')}</span>
             </div>
           )}
        </div>
      </main>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleImport(e.target.files)} />
      {/* @ts-ignore */}
      <input ref={folderInputRef} type="file" webkitdirectory="" multiple className="hidden" onChange={e => handleImport(e.target.files)} />

      {deleteConfirmId && (
        <ConfirmationCard
          title={t('notes.confirmDelete')}
          message={t('notes.confirmDeleteMessage') || 'Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.'}
          options={['Confirmar', 'Cancelar']}
          onSelect={(opt) => opt === 'Confirmar' ? confirmDeleteNote() : setDeleteConfirmId(null)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}
