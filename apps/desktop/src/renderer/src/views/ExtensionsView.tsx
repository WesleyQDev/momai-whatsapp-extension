import { useState, useEffect } from 'react'
import { fetchExtensions, fetchExtensionRegistry, installExtension, toggleExtension, Extension } from '../services/api'
import {
  PuzzlePieceIcon,
  CheckBadgeIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  GlobeAltIcon,
  MusicalNoteIcon,
  CalendarIcon,
  CommandLineIcon,
  PowerIcon
} from '@heroicons/react/24/outline'

// Mapeamento de ícones para exibição
const iconMap: Record<string, any> = {
  Cpu: <CpuChipIcon className="w-8 h-8 text-blue-500" />,
  music: <MusicalNoteIcon className="w-8 h-8 text-green-500" />,
  calendar: <CalendarIcon className="w-8 h-8 text-red-500" />,
  network: <GlobeAltIcon className="w-8 h-8 text-indigo-500" />,
  MessageSquare: <CommandLineIcon className="w-8 h-8 text-accent" />
}

export default function ExtensionsView() {
  const [installed, setInstalled] = useState<Extension[]>([])
  const [available, setAvailable] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [installedData, registryData] = await Promise.all([
        fetchExtensions(),
        fetchExtensionRegistry()
      ])
      setInstalled(installedData)
      setAvailable(registryData)
    } catch (err) {
      console.error('Erro ao carregar extensões:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleInstall = async (ext: any) => {
    setInstalling(ext.id)
    try {
      await installExtension(ext.id, ext.download_url)
      await loadData()
    } catch (err) {
      alert('Erro ao instalar extensão: ' + err)
    } finally {
      setInstalling(null)
    }
  }

  const handleToggle = async (ext: Extension) => {
    const newStatus = !ext.enabled
    
    if (newStatus && ext.category !== 'builtin') {
      const confirm = window.confirm(
        `AVISO DE SEGURANÇA:\n\nEsta extensão (${ext.name}) executará código Python no seu computador. Ative apenas se confiar no autor.\n\nDeseja continuar?`
      )
      if (!confirm) return
    }

    try {
      await toggleExtension(ext.id, newStatus)
      await loadData()
    } catch (err) {
      alert('Erro ao alterar status: ' + err)
    }
  }

  const isInstalled = (id: string) => installed.some((ext) => ext.id === id)

  return (
    <div className="flex-1 h-full bg-bg overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex justify-between items-end border-b border-border pb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-text flex items-center gap-3">
              <PuzzlePieceIcon className="w-10 h-10 text-accent" />
              Central de Extensões
            </h1>
            <p className="text-text-muted text-lg">
              Gerencie e instale novas capacidades para sua assistente.
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-text-muted hover:text-text"
          >
            <ArrowPathIcon className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Installed Extensions */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text flex items-center gap-2">
            <ShieldCheckIcon className="w-6 h-6 text-green-500" />
            Minhas Extensões
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {installed.map((ext) => (
              <div
                key={ext.id}
                className={`p-5 rounded-2xl bg-card border transition-all flex flex-col gap-4 ${ext.enabled ? 'border-border/10 shadow-lg shadow-accent/5' : 'border-border/10 opacity-60 grayscale'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-xl bg-bg border border-border">
                    {iconMap[ext.icon || ''] || <PuzzlePieceIcon className="w-8 h-8 text-accent" />}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {ext.author === 'WesleyQDev' || ext.category === 'builtin' ? (
                      <div className="flex items-center gap-1 text-[10px] text-accent font-bold uppercase tracking-tighter">
                        <CheckBadgeIcon className="w-4 h-4" />
                        Confiavel
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-orange-400 font-bold uppercase tracking-tighter">
                        Terceiro
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-text flex items-center gap-2">
                    {ext.name}
                    {!ext.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-text-muted">Inativo</span>}
                  </h3>
                  <p className="text-sm text-text-muted line-clamp-2">{ext.description}</p>
                </div>
                <div className="mt-auto pt-2 flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-text-muted uppercase font-bold tracking-widest">{ext.category}</span>
                      <span className="text-xs text-text-muted italic">v{ext.version || '1.0.0'}</span>
                   </div>
                   <button 
                    onClick={() => handleToggle(ext)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ext.enabled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-accent/10 text-accent hover:bg-accent/20'}`}
                   >
                     <PowerIcon className="w-4 h-4" />
                     {ext.enabled ? 'Desativar' : 'Ativar'}
                   </button>
                </div>
              </div>
            ))}
            {installed.length === 0 && !loading && (
              <p className="text-text-muted italic">Nenhuma extensão instalada ainda.</p>
            )}
          </div>
        </section>

        {/* Marketplace / Registry */}
        <section className="space-y-4 pt-4">
          <h2 className="text-xl font-semibold text-text flex items-center gap-2">
            <CloudArrowDownIcon className="w-6 h-6 text-accent" />
            Loja MomAI (Nuvem)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {available
              .filter((ext) => !isInstalled(ext.id))
              .map((ext) => (
                <div
                  key={ext.id}
                  className="p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all flex flex-col gap-4 opacity-80 hover:opacity-100"
                >
                  <div className="flex justify-between items-start">
                    <div className="p-3 rounded-xl bg-bg opacity-50">
                      <CloudArrowDownIcon className="w-8 h-8 text-text-muted" />
                    </div>
                    {ext.is_official && (
                      <span className="text-[10px] text-accent font-bold uppercase tracking-tighter">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-text">{ext.name}</h3>
                    <p className="text-sm text-text-muted">{ext.description || 'Sem descrição.'}</p>
                  </div>
                  <button
                    onClick={() => handleInstall(ext)}
                    disabled={installing === ext.id}
                    className="w-full mt-4 py-2 bg-accent text-white rounded-lg font-bold hover:brightness-110 disabled:opacity-50 transition-all"
                  >
                    {installing === ext.id ? 'Instalando...' : 'Baixar e Instalar'}
                  </button>
                </div>
              ))}
            {available.length === 0 && !loading && (
              <p className="text-text-muted italic">Não foi possível carregar o registro remoto.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}