import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  DocumentTextIcon,
  FolderArrowDownIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  PencilIcon
} from '@heroicons/react/24/outline'

// Icons for the toolbar
const BoldIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" opacity="0" />
    <path d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75Z" opacity="0" />
    <path fillRule="evenodd" d="M3.5 3a1 1 0 0 0 0 2h.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-.5a1 1 0 0 0 0 2h10a5 5 0 0 0 0-10H6.5V5h4.75A2.75 2.75 0 0 1 14 7.75v.5A2.75 2.75 0 0 1 11.25 11h-.5v2h.5A2.75 2.75 0 0 1 14 15.75v.5A2.75 2.75 0 0 1 11.25 19H6v-3h5.25a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75H6V8h5.25a.75.75 0 0 0 .75-.75v-.5a.75.75 0 0 0-.75-.75H4.5a1 1 0 0 1-1-1Z" clipRule="evenodd" />
  </svg>
)

const ItalicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M5.25 3.75a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5H12.75l-4.5 15h3.75a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1 0-1.5h5.25l4.5-15H6a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
  </svg>
)

const ListBulletIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M2.625 6.75a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875 0A.75.75 0 0 1 8.25 6h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75ZM2.625 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0ZM7.5 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 7.5 12Zm-4.875 5.25a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875 0a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
  </svg>
)

const CodeBracketIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm14.25 6a.75.75 0 0 1-.22.53l-2.25 2.25a.75.75 0 1 1-1.06-1.06L15.44 12l-1.72-1.72a.75.75 0 1 1 1.06-1.06l2.25 2.25c.141.14.22.331.22.53Zm-10.28-.53a.75.75 0 0 0 0 1.06l2.25 2.25a.75.75 0 1 0 1.06-1.06L8.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-2.25 2.25Z" clipRule="evenodd" />
  </svg>
)

const LinkIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 0 0-5.304 0l-4.5 4.5a3.75 3.75 0 0 0 1.035 6.037.75.75 0 0 1-.646 1.353 5.25 5.25 0 0 1-1.449-8.45l4.5-4.5a5.25 5.25 0 1 1 7.424 7.424l-1.757 1.757a.75.75 0 1 1-1.06-1.06l1.757-1.757a3.75 3.75 0 0 0 0-5.304Zm-7.389 4.267a.75.75 0 0 1 1-.353 5.25 5.25 0 0 1 1.449 8.45l-4.5 4.5a5.25 5.25 0 1 1-7.424-7.424l1.757-1.757a.75.75 0 1 1 1.06 1.06l-1.757 1.757a3.75 3.75 0 1 0 5.304 5.304l4.5-4.5a3.75 3.75 0 0 0-1.035-6.037.75.75 0 0 1-.354-1Z" clipRule="evenodd" />
  </svg>
)

const HashtagIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M11.097 1.515a.75.75 0 0 1 .589.882L10.666 7.5h4.47l1.019-5.103a.75.75 0 0 1 1.47.294L16.607 7.5h3.643a.75.75 0 0 1 0 1.5h-3.942l-1.294 6.5h3.236a.75.75 0 0 1 0 1.5h-3.535l-1.02 5.103a.75.75 0 0 1-1.47-.294l1.018-5.103H8.814l-1.02 5.103a.75.75 0 0 1-1.47-.294l1.019-5.103H3.75a.75.75 0 0 1 0-1.5h3.942l1.294-6.5H5.75a.75.75 0 0 1 0-1.5h3.535l1.02-5.103a.75.75 0 0 1 .882-.589Zm-2.583 7.485-1.294 6.5h4.47l1.294-6.5h-4.47Z" clipRule="evenodd" />
  </svg>
)

export default function NotesView() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [previewMode, setPreviewMode] = useState(false)

  const lastSaved = useRef({ title: '', content: '' })
  const saveTimer = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredNotes = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) =>
      [note.title, note.preview || ''].some((value) => value.toLowerCase().includes(query))
    )
  }, [filterText, notes])

  const loadNotes = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listMemoryNotes()
      setNotes(data)
      if (!activeId && data.length > 0) {
        await selectNote(data[0].id)
      }
    } catch (err) {
      setError('Erro ao carregar notas')
    } finally {
      setIsLoading(false)
    }
  }

  const selectNote = async (noteId: string) => {
    setActiveId(noteId)
    setIsLoading(true)
    setError(null)
    setPreviewMode(false)
    try {
      const note = await getMemoryNote(noteId)
      setTitle(note.title)
      setContent(note.content)
      lastSaved.current = { title: note.title, content: note.content }
    } catch (err) {
      setError('Erro ao abrir nota')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadNotes()
  }, [])

  useEffect(() => {
    if (!activeId) return
    if (title === lastSaved.current.title && content === lastSaved.current.content) return

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
    }

    saveTimer.current = window.setTimeout(async () => {
      try {
        setIsSaving(true)
        const updated = await updateMemoryNote(activeId, { title, content })
        lastSaved.current = { title: updated.title, content: updated.content }
        setNotes((prev) =>
          prev.map((note) => (note.id === updated.id ? { ...note, title: updated.title } : note))
        )
      } catch (err) {
        setError('Erro ao salvar nota')
      } finally {
        setIsSaving(false)
      }
    }, 900)

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [activeId, title, content])

  const handleCreateNote = async () => {
    setError(null)
    try {
      const note = await createMemoryNote('Nova nota', '')
      setNotes((prev) => [note, ...prev])
      await selectNote(note.id)
    } catch (err) {
      setError('Erro ao criar nota')
    }
  }

  const handleDeleteNote = async () => {
    if (!activeId) return
    if (!window.confirm('Deseja remover esta nota?')) return

    setError(null)
    try {
      await deleteMemoryNote(activeId)
      const updated = notes.filter((note) => note.id !== activeId)
      setNotes(updated)
      if (updated.length > 0) {
        await selectNote(updated[0].id)
      } else {
        setActiveId(null)
        setTitle('')
        setContent('')
      }
    } catch (err) {
      setError('Erro ao remover nota')
    }
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
      setError('Erro ao importar notas')
    }
  }

  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentText = textarea.value
    const selectedText = currentText.substring(start, end)

    const newText =
      currentText.substring(0, start) +
      before +
      selectedText +
      after +
      currentText.substring(end)

    setContent(newText)

    // Wait for state update then set selection
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  return (
    <div className="flex-1 h-full bg-bg overflow-hidden flex font-sans">
      {/* Sidebar */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border flex flex-col gap-3">
          <div className="flex items-center justify-between text-text">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-accent" />
              <span className="font-bold text-sm tracking-wide">NOTAS</span>
            </div>
            <div className="flex items-center gap-1">
               <button
                onClick={() => fileInputRef.current?.click()}
                title="Importar arquivos"
                className="p-1.5 rounded-md hover:bg-white/5 text-text-muted hover:text-text transition"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                title="Importar pasta"
                className="p-1.5 rounded-md hover:bg-white/5 text-text-muted hover:text-text transition"
              >
                <FolderArrowDownIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-md bg-input border border-border/40 px-3 py-2 text-xs text-text outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/10 transition-all placeholder:text-text-muted/50"
          />
          
          <button
            onClick={handleCreateNote}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-semibold py-2.5 transition-all shadow-lg shadow-accent/20 active:translate-y-0.5"
          >
            <PlusIcon className="w-4 h-4" />
            Nova Nota
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            multiple
            className="hidden"
            onChange={(event) => handleImport(event.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            // @ts-ignore
            webkitdirectory="true"
            onChange={(event) => handleImport(event.target.files)}
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {isLoading && notes.length === 0 ? (
            <div className="p-4 text-xs text-text-muted text-center italic">Carregando notas...</div>
          ) : (
            filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => selectNote(note.id)}
                className={`w-full text-left px-3 py-3 rounded-md transition-all group ${
                  note.id === activeId 
                    ? 'bg-accent/10 text-accent ring-1 ring-accent/20' 
                    : 'text-text-muted hover:bg-white/5 hover:text-text'
                }`}
              >
                <div className="text-xs font-medium truncate flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${note.id === activeId ? 'bg-accent' : 'bg-transparent group-hover:bg-text-muted/30'}`}></span>
                  {note.title || 'Sem Título'}
                </div>
                {note.preview && (
                  <div className="text-[10px] opacity-70 line-clamp-1 ml-3.5 mt-1 font-light">
                    {note.preview}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-bg relative">
        {!activeId ? (
           <div className="flex-1 flex flex-col items-center justify-center text-text-muted/40 gap-4">
             <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
               <PencilIcon className="w-10 h-10" />
             </div>
             <p className="text-sm font-medium">Selecione ou crie uma nota para começar</p>
           </div>
        ) : (
          <>
            {/* Top Bar / Toolbar */}
            <div className="h-14 border-b border-border flex items-center px-4 justify-between gap-4 bg-bg/50 backdrop-blur-sm z-10">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título da nota"
                className="flex-1 bg-transparent text-text text-base font-bold outline-none placeholder:text-border"
              />
              
              <div className="flex items-center gap-1 bg-card/50 rounded-lg p-1 border border-border/20">
                {!previewMode && (
                  <>
                    <ToolbarButton icon={<BoldIcon className="w-4 h-4" />} onClick={() => insertText('**', '**')} tooltip="Negrito" />
                    <ToolbarButton icon={<ItalicIcon className="w-4 h-4" />} onClick={() => insertText('*', '*')} tooltip="Itálico" />
                    <ToolbarButton icon={<HashtagIcon className="w-4 h-4" />} onClick={() => insertText('# ', '')} tooltip="Título" />
                    <ToolbarButton icon={<ListBulletIcon className="w-4 h-4" />} onClick={() => insertText('- ', '')} tooltip="Lista" />
                    <ToolbarButton icon={<CodeBracketIcon className="w-4 h-4" />} onClick={() => insertText('```\n', '\n```')} tooltip="Código" />
                    <ToolbarButton icon={<LinkIcon className="w-4 h-4" />} onClick={() => insertText('[', '](url)')} tooltip="Link" />
                    <div className="w-px h-4 bg-border/50 mx-1" />
                  </>
                )}
                
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className={`p-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-colors ${
                    previewMode 
                      ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                      : 'text-text-muted hover:text-text hover:bg-white/5'
                  }`}
                  title={previewMode ? "Editar" : "Visualizar"}
                >
                  {previewMode ? (
                    <>
                      <PencilIcon className="w-4 h-4" />
                      <span>Editar</span>
                    </>
                  ) : (
                    <>
                      <EyeIcon className="w-4 h-4" />
                      <span>Visualizar</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 border-l border-border/20 pl-4">
                <span className={`text-[10px] transition-colors ${isSaving ? 'text-accent' : 'text-text-muted/40'}`}>
                  {isSaving ? 'Salvando...' : 'Salvo'}
                </span>
                <button
                  onClick={handleDeleteNote}
                  className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/10 transition"
                  title="Excluir nota"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-2 rounded-lg text-xs backdrop-blur-md shadow-xl">
                {error}
              </div>
            )}

            {/* Editor / Preview Content */}
            <div className="flex-1 overflow-auto custom-scrollbar relative">
              {previewMode ? (
                <div className="max-w-4xl mx-auto p-8 prose prose-invert prose-sm prose-h1:text-2xl prose-h1:font-bold prose-p:text-text-muted prose-a:text-accent prose-code:text-accent prose-code:bg-white/5 prose-code:rounded-sm prose-code:px-1 prose-pre:bg-card prose-pre:border prose-pre:border-white/5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Comece a escrever sua nota..."
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-sm text-text font-mono leading-7 p-8 outline-none resize-none placeholder:text-text-muted/20"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ToolbarButton({ icon, onClick, tooltip }: { icon: React.ReactNode, onClick: () => void, tooltip: string }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-white/5 transition-colors"
    >
      <div className="w-4 h-4">
        {icon}
      </div>
    </button>
  )
}
