import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  fetchExtensions,
  fetchExtensionRegistry,
  installExtension,
  toggleExtension,
  uninstallExtension,
  Extension
} from '../services/api'
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
  PowerIcon,
  Squares2X2Icon,
  TrashIcon
} from '@heroicons/react/24/outline'

// Mapeamento de ícones para exibição
const iconMap: Record<string, any> = {
  Cpu: <CpuChipIcon className="w-8 h-8 text-blue-500" />,
  Search: <GlobeAltIcon className="w-8 h-8 text-indigo-500" />,
  music: <MusicalNoteIcon className="w-8 h-8 text-green-500" />,
  calendar: <CalendarIcon className="w-8 h-8 text-red-500" />,
  network: <GlobeAltIcon className="w-8 h-8 text-indigo-500" />,
  MessageSquare: <CommandLineIcon className="w-8 h-8 text-accent" />
}

import SecurityConfirm from '../components/floating/SecurityConfirm'

export default function ExtensionsView() {
  const location = useLocation()
  const [installed, setInstalled] = useState<Extension[]>([])
  const [available, setAvailable] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  // Default to 'store' if no user extensions are installed, otherwise 'installed'
  const [activeTab, setActiveTab] = useState<'store' | 'installed' | 'system'>('installed')

  // Security Modal State
  const [securityModal, setSecurityModal] = useState<{
    isOpen: boolean
    ext?: Extension
  }>({ isOpen: false })

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

  useEffect(() => {
    const tab = (location.state as any)?.tab
    if (tab === 'store' || tab === 'installed' || tab === 'system') {
      setActiveTab(tab)
    }
  }, [location.state])

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
      setSecurityModal({ isOpen: true, ext })
      return
    }

    try {
      await toggleExtension(ext.id, newStatus)
      await loadData()
    } catch (err) {
      alert('Erro ao alterar status: ' + err)
    }
  }

  const confirmToggle = async () => {
    const ext = securityModal.ext
    if (!ext) return

    try {
      await toggleExtension(ext.id, true)
      setSecurityModal({ isOpen: false })
      await loadData()
    } catch (err) {
      alert('Erro ao alterar status: ' + err)
    }
  }

  const handleUninstall = async (ext: Extension) => {
    if (
      !window.confirm(`Tem certeza que deseja remover permanentemente a extensão "${ext.name}"?`)
    ) {
      return
    }

    try {
      await uninstallExtension(ext.id)
      await loadData()
    } catch (err) {
      alert('Erro ao desinstalar: ' + err)
    }
  }

  const isInstalled = (id: string) => installed.some((ext) => ext.id === id)

  const systemExtensions = installed.filter((ext) => ext.category === 'builtin')
  const userExtensions = installed.filter((ext) => ext.category !== 'builtin')

  return (
    <div className="flex-1 h-full bg-bg overflow-hidden flex flex-col">
      {/* Header Area (Fixed) */}
      <div className="p-6 pb-0 space-y-6 border-b border-border bg-bg z-10 flex-shrink-0">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-text flex items-center gap-3">
              <PuzzlePieceIcon className="w-8 h-8 text-accent" />
              Central de Extensões
            </h1>
            <p className="text-text-muted text-sm">
              Gerencie e instale novas capacidades para sua assistente.
            </p>
          </div>
          <button
            onClick={loadData}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-text-muted hover:text-text"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'installed'
                ? 'border-accent text-accent bg-accent/5 rounded-t-lg'
                : 'border-transparent text-text-muted hover:text-text hover:bg-white/5 rounded-t-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <Squares2X2Icon className="w-4 h-4" />
              Minhas Extensões
              <span className="ml-1 text-[10px] bg-white/10 px-1.5 rounded-full">
                {userExtensions.length}
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('store')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'store'
                ? 'border-accent text-accent bg-accent/5 rounded-t-lg'
                : 'border-transparent text-text-muted hover:text-text hover:bg-white/5 rounded-t-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <CloudArrowDownIcon className="w-4 h-4" />
              Explorar (Loja)
            </div>
          </button>

          <button
            onClick={() => setActiveTab('system')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'system'
                ? 'border-accent text-accent bg-accent/5 rounded-t-lg'
                : 'border-transparent text-text-muted hover:text-text hover:bg-white/5 rounded-t-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <CpuChipIcon className="w-4 h-4" />
              Sistema
            </div>
          </button>
        </div>
      </div>

      {/* Main Content Area (Scrollable) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* TAB: SYSTEM EXTENSIONS */}
          {activeTab === 'system' && (
            <div className="border border-border/10 rounded-lg overflow-hidden bg-card/20">
              <div className="p-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4" /> Componentes Principais
                </h3>
                <span className="text-[10px] text-text-muted">
                  {systemExtensions.length} módulos ativos
                </span>
              </div>
              <div className="divide-y divide-border/5">
                {systemExtensions.map((ext) => (
                  <div
                    key={ext.id}
                    className="flex items-center justify-between p-3 px-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-md bg-bg border border-border">
                        {iconMap[ext.icon || ''] ? (
                          React.cloneElement(iconMap[ext.icon || ''], {
                            className: 'w-4 h-4 opacity-80'
                          })
                        ) : (
                          <PuzzlePieceIcon className="w-4 h-4 text-accent opacity-80" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-text text-xs">{ext.name}</h3>
                          <span className="text-[10px] text-text-muted italic px-1.5 py-0 bg-white/5 rounded-full border border-white/5">
                            v{ext.version}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate max-w-xl">
                          {ext.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {ext.error && (
                        <span className="text-[10px] text-red-400 font-bold uppercase animate-pulse">
                          Falha
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider bg-accent/5 text-accent/50 border border-accent/10 cursor-default">
                        <ShieldCheckIcon className="w-3 h-3" />
                        CORE
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: INSTALLED EXTENSIONS */}
          {activeTab === 'installed' && (
            <>
              {userExtensions.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center p-20 text-center gap-4 opacity-60">
                  <div className="p-4 rounded-full bg-white/5 border border-white/5">
                    <Squares2X2Icon className="w-10 h-10 text-text-muted" />
                  </div>
                  <div>
                    <p className="text-text font-bold">Nenhuma extensão instalada</p>
                    <p className="text-sm text-text-muted mt-1">
                      Vá até a aba "Loja" para explorar novas funcionalidades.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('store')}
                    className="text-xs text-accent hover:underline"
                  >
                    Ir para Loja &rarr;
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {userExtensions.map((ext) => (
                    <div
                      key={ext.id}
                      className={`group p-4 rounded-lg bg-card border transition-all flex flex-col gap-3 ${ext.enabled ? 'border-border/10 shadow-md shadow-accent/5' : 'border-border/10 opacity-70 grayscale'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="p-2 rounded-lg bg-bg border border-border">
                          {iconMap[ext.icon || ''] || (
                            <PuzzlePieceIcon className="w-6 h-6 text-accent" />
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {ext.author === 'WesleyQDev' ? (
                            <div className="flex items-center gap-1 text-[9px] text-accent font-bold uppercase tracking-tighter">
                              <CheckBadgeIcon className="w-3 h-3" />
                              Confiavel
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[9px] text-orange-400 font-bold uppercase tracking-tighter">
                              Terceiro
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-text flex items-center gap-2">
                          {ext.name}
                          {!ext.enabled && (
                            <span className="text-[9px] px-1 py-0 rounded bg-white/5 text-text-muted">
                              Off
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-text-muted line-clamp-2 mt-1 leading-relaxed">
                          {ext.description}
                        </p>
                        {ext.error && (
                          <div className="mt-2 text-[9px] text-red-400 bg-red-400/5 p-1.5 rounded border border-red-400/10">
                            <strong>Erro:</strong> {ext.error}
                          </div>
                        )}
                      </div>

                      <div className="mt-auto pt-2 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">
                            {ext.category}
                          </span>
                          <span className="text-[10px] text-text-muted italic">
                            v{ext.version || '1.0.0'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleToggle(ext)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${ext.enabled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-accent/10 text-accent hover:bg-accent/20'}`}
                          >
                            <PowerIcon className="w-3 h-3" />
                            {ext.enabled ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => handleUninstall(ext)}
                            className="p-1 rounded-md text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-all border border-transparent hover:border-red-500/20"
                            title="Desinstalar"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB: STORE / REGISTRY */}
          {activeTab === 'store' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {available
                .filter((ext) => !isInstalled(ext.id))
                .map((ext) => (
                  <div
                    key={ext.id}
                    className="group p-4 rounded-lg bg-card border border-border/10 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all flex flex-col gap-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="p-2 rounded-lg bg-bg border border-border group-hover:bg-accent/5 transition-colors">
                        <CloudArrowDownIcon className="w-6 h-6 text-text-muted group-hover:text-accent" />
                      </div>
                      {ext.is_official && (
                        <span className="text-[9px] text-accent font-bold uppercase tracking-widest bg-accent/10 px-1.5 py-0.5 rounded border border-accent/10">
                          Oficial
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-text group-hover:text-accent transition-colors">
                        {ext.name}
                      </h3>
                      <p className="text-xs text-text-muted line-clamp-2 mt-1">
                        {ext.description || 'Sem descrição presente no manifesto.'}
                      </p>
                    </div>

                    <div className="mt-auto space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted uppercase font-bold tracking-tighter">
                          Autor: {ext.author || 'Desconhecido'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleInstall(ext)}
                        disabled={installing === ext.id}
                        className="w-full py-1.5 bg-accent text-white rounded-md text-xs font-bold hover:brightness-110 disabled:opacity-50 transition-all shadow-md shadow-accent/10 flex items-center justify-center gap-2"
                      >
                        {installing === ext.id ? (
                          <>
                            <ArrowPathIcon className="w-3 h-3 animate-spin" />
                            Instalando...
                          </>
                        ) : (
                          <>
                            <CloudArrowDownIcon className="w-3 h-3" />
                            Baixar e Instalar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              {available.filter((ext) => !isInstalled(ext.id)).length === 0 && !loading && (
                <div className="col-span-full p-10 border-2 border-dashed border-border/10 rounded-lg flex flex-col items-center gap-2 opacity-50">
                  <CloudArrowDownIcon className="w-8 h-8" />
                  <p className="text-xs text-text-muted italic">
                    Todas as extensões do registro já estão instaladas.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SecurityConfirm
        isOpen={securityModal.isOpen}
        extensionName={securityModal.ext?.name || ''}
        extensionAuthor={securityModal.ext?.author || ''}
        onConfirm={confirmToggle}
        onCancel={() => setSecurityModal({ isOpen: false })}
      />
    </div>
  )
}
