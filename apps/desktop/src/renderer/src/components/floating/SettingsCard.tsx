import { useState, useEffect } from 'react'
import FloatingCard from './FloatingCard'
import { api } from '../../services/api'

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'general' | 'brain' | 'voice'

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [isLoading, setIsLoading] = useState(true)

  // State for form fields
  const [settings, setSettings] = useState({
    user_name: '',
    assistant_persona: '',
    ai_provider: 'local',
    ai_model: '',
    local_backend: 'auto',
    api_keys: { groq: '', gemini: '' },
    tts_voice: '',
    tts_enabled: false,
    wake_word_enabled: true,
    wake_word_sensitivity: 5
  })

  const [installStatus, setInstallStatus] = useState<
    'checking' | 'installed' | 'missing' | 'installing' | 'error'
  >('checking')
  const [installProgress, setInstallProgress] = useState(0)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [localDetails, setLocalDetails] = useState<{
    cpu_name?: string
    detected_hardware?: string
    recommended_build?: string
    available_builds?: Record<string, { label: string, version: string, size_mb: number, description: string }>
    latest_version?: string
    installed_version?: string
    installed_build?: string
    installed_backends?: string[]
    current_local_backend?: string
  }>({})

  useEffect(() => {
    loadSettings()
    checkLocalStatus()

    const handleModelChange = (e: any) => {
      const detail = e.detail
      if (detail) {
        setSettings((prev) => ({ ...prev, ai_provider: detail }))
      }
    }

    // WebSocket Listener for installation progress
    const ws = new WebSocket('ws://127.0.0.1:8000/ws')
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'setup_progress') {
        setInstallProgress(msg.data.percent)
      } else if (msg.type === 'setup_complete') {
        setInstallStatus('installed')
        setInstallProgress(100)
        setInstallingId(null)
        checkLocalStatus() // Refresh details
      }
    }

    window.addEventListener('ai_model_changed', handleModelChange)
    return () => {
      window.removeEventListener('ai_model_changed', handleModelChange)
      ws.close()
    }
  }, [])

  const checkLocalStatus = async () => {
    try {
      const res = await api.get('/setup/status')
      setLocalDetails(res.data)
      if (res.data.engine_installed) {
        setInstallStatus('installed')
      } else {
        setInstallStatus('missing')
      }
    } catch (error) {
      console.error('Erro ao verificar status local:', error)
      setInstallStatus('error')
    }
  }

  const handleInstallEngine = async (backend?: string) => {
    setInstallStatus('installing')
    setInstallingId(backend || null)
    setInstallProgress(0)
    try {
      const res = await api.post('/setup/install-engine', { backend })
      if (res.data.status === 'error') {
        setInstallStatus('error')
        setInstallingId(null)
        alert(res.data.message)
      }
    } catch (error) {
      setInstallStatus('error')
      setInstallingId(null)
    }
  }

  const handleUninstallEngine = async (backend?: string) => {
    if (!confirm('Deseja realmente remover os binários deste motor local?')) return
    
    try {
      await api.delete('/setup/uninstall-engine', { params: { backend } })
      checkLocalStatus()
    } catch (error) {
      alert('Erro ao desinstalar motor local.')
    }
  }

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings')
      setSettings(res.data)
    } catch (error) {
      console.error('Erro ao carregar configs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async (newSettings: typeof settings) => {
    try {
      return await api.patch('/settings', newSettings)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      throw error
    }
  }

  const updateField = (field: string, value: any, saveNow = false) => {
    setSettings((prev) => {
      const newState = { ...prev, [field]: value }
      if (saveNow) saveSettings(newState)
      return newState
    })

    if (saveNow) {
      const newState = { ...settings, [field]: value }
      return saveSettings(newState)
    }
    return Promise.resolve()
  }

  const updateApiKey = (provider: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      api_keys: { ...prev.api_keys, [provider]: value }
    }))
  }

  const voices = [
    { id: 'pt-BR-FranciscaNeural', name: 'Francisca (Suave)' },
    { id: 'pt-BR-AntonioNeural', name: 'Antonio (Calmo)' },
    { id: 'pt-BR-ThalitaNeural', name: 'Thalita (Jovial)' }
  ]

  if (isLoading)
    return (
      <FloatingCard title="Configurações" onClose={onClose}>
        <div className="p-4 text-center text-text-muted">Carregando...</div>
      </FloatingCard>
    )

  // Ícones para o Menu Lateral
  const icons = {
    general: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
        <path d="M12 12 2.1 12.1"></path>
      </svg>
    ),
    voice: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    )
  }

  return (
    <FloatingCard title="Painel de Controle" onClose={onClose} width="max-w-7xl">
      <div className="flex h-[600px] -mx-6 -my-6">
        {/* SIDEBAR */}
        <div className="w-48 border-r border-white/5 bg-white/[0.01] p-4 flex flex-col gap-1.5">
          <div className="px-3 mb-4">
            <span className="text-[10px] font-black text-text-muted/40 uppercase tracking-[0.2em]">
              Configurações
            </span>
          </div>

          {[
            { id: 'general', label: 'Geral', icon: icons.general },
            { id: 'brain', label: 'Inteligência', icon: icons.brain },
            { id: 'voice', label: 'Voz e Fala', icon: icons.voice }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${activeTab === tab.id ? 'bg-accent/10 text-accent shadow-sm' : 'text-text-muted hover:bg-white/5 hover:text-text'}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT AREA - Desktop Density */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-bg">
          {/* GERAL */}
          {activeTab === 'general' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-1 border-b border-white/5 pb-6">
                <h2 className="text-xl font-black text-white tracking-tight uppercase">Configurações Gerais</h2>
                <p className="text-xs text-text-muted font-medium">Gerencie sua identidade e a personalidade base da assistente.</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Identidade do Usuário</label>
                    <div className="relative group">
                      <input
                        type="text"
                        value={settings.user_name}
                        onChange={(e) => updateField('user_name', e.target.value)}
                        onBlur={() => saveSettings(settings)}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-sm text-text focus:border-accent/40 focus:bg-white/[0.04] outline-none transition-all"
                        placeholder="Como devo chamar você?"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.01] border border-white/5 group">
                    <div className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight">Ativação por Voz</span>
                        <span className="text-[10px] text-text-muted font-medium">Diga "Sistema" para ouvir.</span>
                      </div>
                    </div>
                    <button
                      onClick={() => updateField('wake_word_enabled', !settings.wake_word_enabled, true)}
                      className={`w-11 h-5.5 rounded-full flex items-center px-1 transition-all duration-500 ${settings.wake_word_enabled ? 'bg-accent' : 'bg-white/10'}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-transform duration-500 ${settings.wake_word_enabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] ml-1">Personalidade (Persona)</label>
                  <textarea
                    value={settings.assistant_persona}
                    onChange={(e) => updateField('assistant_persona', e.target.value)}
                    onBlur={() => saveSettings(settings)}
                    className="w-full h-48 bg-white/[0.02] border border-white/10 rounded-xl px-4 py-4 text-sm text-text focus:border-accent/40 focus:bg-white/[0.04] outline-none resize-none transition-all leading-relaxed font-medium"
                    placeholder="Instruções de comportamento..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* BRAIN */}
          {activeTab === 'brain' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 pb-8">
              <div className="space-y-1 border-b border-white/5 pb-6">
                <h2 className="text-xl font-black text-white tracking-tight uppercase">Motores de Inteligência</h2>
                <p className="text-xs text-text-muted font-medium">Configure processamento local ou chaves de nuvem.</p>
              </div>

              {/* 1. MomLocal Core Section */}
              <div className="p-8 rounded-3xl border bg-white/[0.01] border-white/5 flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    </div>
                    <div className="flex flex-col">
                      <h4 className="text-lg font-black text-white uppercase tracking-wider">MomLocal Core</h4>
                      <span className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em]">Offline Llama.cpp Inference</span>
                    </div>
                  </div>
                  {settings.ai_provider === 'local' ? (
                    <div className="px-4 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-accent animate-pulse" /> Startup Active
                    </div>
                  ) : (
                    <button onClick={() => updateField('ai_provider', 'local', true)} className="px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-white text-[10px] font-bold uppercase transition-all">Set as Default</button>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  {/* Seletor de Performance Unificado */}
                  <div className="flex flex-col gap-3 p-1.5 bg-black/40 border border-white/5 rounded-2xl">
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Modo de Processamento</span>
                      <span className="text-[9px] font-bold text-accent/60 italic">Afeta a velocidade de resposta</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'auto', label: 'Auto', sub: 'Smart', icon: <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/> },
                        { id: 'cuda', label: 'NVIDIA', sub: 'GPU Boost', icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/> },
                        { id: 'vulkan', label: 'Vulkan', sub: 'AMD/Intel', icon: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/> },
                        { id: 'cpu', label: 'CPU', sub: 'Eco Mode', icon: <path d="M4 4h16v16H4zM9 9h6v6H9zM15 2v2M9 2v2M15 20v2M9 20v2M20 15h2M20 9h2M2 15h2M2 9h2"/> }
                      ].map(mode => {
                        const isSelected = settings.local_backend === mode.id;
                        const isRecommended = mode.id === 'auto';
                        const isInstalled = mode.id === 'auto' || localDetails.installed_backends?.includes(mode.id);

                        return (
                          <button
                            key={mode.id}
                            onClick={() => updateField('local_backend', mode.id, true).then(checkLocalStatus)}
                            className={`relative flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all duration-300 border ${
                              isSelected 
                                ? 'bg-accent/10 border-accent/40 text-accent shadow-[0_0_20px_rgba(139,92,246,0.1)]' 
                                : 'bg-white/[0.02] border-transparent text-text-muted hover:bg-white/[0.05] hover:text-text'
                            }`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{mode.icon}</svg>
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] font-black uppercase tracking-tight">{mode.label}</span>
                              <span className="text-[7px] font-bold opacity-50 uppercase tracking-widest">{mode.sub}</span>
                            </div>
                            {isRecommended && !isSelected && <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-pulse" />}
                            {!isInstalled && mode.id !== 'auto' && <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center backdrop-blur-[1px]"><span className="text-[7px] font-black text-white/40 uppercase tracking-widest -rotate-12">Not Ready</span></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Hardware Column */}
                    <div className="lg:col-span-5 space-y-4">
                      <span className="text-[10px] font-black text-text-muted/40 uppercase tracking-[0.3em] ml-1">Hardware System</span>
                      <div className="grid gap-3">
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/20 border border-white/5">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-text-muted/50 shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></div>
                          <div className="flex flex-col min-w-0"><span className="text-[8px] font-black text-text-muted/50 uppercase tracking-widest">CPU</span><span className="text-[12px] font-bold text-text/90 truncate">{localDetails.cpu_name || 'Detecting...'}</span></div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/20 border border-white/5">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-text-muted/50 shrink-0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2"/></svg></div>
                          <div className="flex flex-col min-w-0"><span className="text-[8px] font-black text-text-muted/50 uppercase tracking-widest">GPU</span><span className="text-[12px] font-bold text-text/90 truncate">{localDetails.detected_hardware || 'Not Detected'}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Engines Column */}
                    <div className="lg:col-span-7 space-y-4">
                      <span className="text-[10px] font-black text-text-muted/40 uppercase tracking-[0.3em] ml-1">Build Storage</span>
                      <div className="grid gap-3">
                        {localDetails.available_builds ? Object.entries(localDetails.available_builds)
                          .map(([id, build]) => {
                            const isInstalled = localDetails.installed_backends?.includes(id);
                            const isUpdate = isInstalled && localDetails.latest_version && localDetails.installed_version !== localDetails.latest_version;
                            const isActiveInUse = (settings.local_backend === id) || (settings.local_backend === 'auto' && localDetails.recommended_build === id);
                            const isRec = localDetails.recommended_build === id;
                            const isInc = (id === 'cuda' && localDetails.recommended_build !== 'cuda') || (id === 'vulkan' && localDetails.recommended_build === 'cpu');

                            return (
                              <div key={id} className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 relative ${isActiveInUse ? 'bg-accent/[0.05] border-accent/40 shadow-[0_0_15px_rgba(139,92,246,0.05)]' : isInc ? 'opacity-30 grayscale border-white/5' : 'bg-black/20 border-white/5'}`}>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[12px] font-bold tracking-tight ${isActiveInUse ? 'text-white' : 'text-text-muted'}`}>{build.label}</span>
                                    {isActiveInUse && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                                    {isRec && !isActiveInUse && !isInc && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 text-text-muted/40 border border-white/5">Auto Choice</span>}
                                  </div>
                                  <span className="text-[9px] text-text-muted/40 font-mono uppercase">Build {build.version} • {build.size_mb}MB</span>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  {isInstalled ? (
                                    <div className="flex items-center gap-4">
                                      {isUpdate && <button onClick={() => handleInstallEngine(id)} className="text-[8px] font-black uppercase tracking-widest text-amber-400 animate-pulse">Update</button>}
                                      <button onClick={() => handleUninstallEngine(id)} className="text-[18px] opacity-20 hover:opacity-100 hover:text-red-400 transition-all">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                      </button>
                                    </div>
                                  ) : installStatus === 'installing' && installingId === id ? (
                                    <div className="flex flex-col items-end gap-1.5 w-16">
                                      <span className="text-[9px] font-mono text-accent font-black">{installProgress}%</span>
                                      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-accent transition-all" style={{width: `${installProgress}%`}} /></div>
                                    </div>
                                  ) : (
                                    <button disabled={isInc} onClick={() => handleInstallEngine(id)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isInc ? 'hidden' : 'bg-white/5 border border-white/10 text-text-muted hover:text-white hover:bg-white/10'}`}>
                                      Download
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          }) : <div className="p-4 text-center text-xs text-text-muted italic opacity-50">Loading builds...</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Cloud Providers Section */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                {[
                  { id: 'groq', label: 'Groq Cloud', icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />, color: 'orange', sub: 'Extreme Performance' },
                  { id: 'genai', label: 'Google AI Studio', icon: <><circle cx="12" cy="12" r="10" /><path d="M12 8l4 4-4 4M8 12h7" /></>, color: 'blue', sub: 'Superior Intelligence' }
                ].map(p => (
                  <div key={p.id} className={`p-6 rounded-3xl border transition-all flex flex-col gap-6 ${settings.ai_provider === p.id ? `bg-${p.color}-500/[0.02] border-${p.color}-500/20 shadow-lg` : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${settings.ai_provider === p.id ? `bg-${p.color}-500 text-white` : `bg-${p.color}-500/10 text-${p.color}-400`}`}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{p.icon}</svg>
                        </div>
                        <div className="flex flex-col">
                          <h4 className="text-sm font-black text-white uppercase tracking-wider">{p.label}</h4>
                          <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{p.sub}</span>
                        </div>
                      </div>
                      {settings.ai_provider === p.id ? (
                        <span className={`px-2 py-1 rounded-lg bg-${p.color}-500/10 text-${p.color}-500 text-[8px] font-black uppercase tracking-widest border border-${p.color}-500/20`}>Active</span>
                      ) : (
                        <button onClick={() => updateField('ai_provider', p.id, true)} className="text-[8px] font-black uppercase tracking-widest text-text-muted/40 hover:text-white transition-colors">Set Default</button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] ml-1 opacity-60">API Key</label>
                      <input
                        type="password"
                        value={settings.api_keys?.[p.id === 'genai' ? 'gemini' : p.id] || ''}
                        onChange={(e) => updateApiKey(p.id === 'genai' ? 'gemini' : p.id, e.target.value)}
                        onBlur={() => saveSettings(settings)}
                        className={`w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-text font-mono focus:border-${p.color}-500/40 outline-none transition-all`}
                        placeholder={p.id === 'groq' ? 'gsk_...' : 'AIza...'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VOICE */}
          {activeTab === 'voice' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 pb-8">
              <div className="space-y-1 border-b border-white/5 pb-6">
                <h2 className="text-xl font-black text-white tracking-tight uppercase">Sintese Neural de Voz</h2>
                <p className="text-xs text-text-muted font-medium">Configure a voz e as capacidades de fala da assistente.</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                <div className="xl:col-span-5 space-y-6">
                  <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/5 flex items-center justify-between group transition-all hover:border-white/10">
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[15px] font-black text-white tracking-wide uppercase">TTS Output</span>
                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Ativar Fala</span>
                      </div>
                    </div>
                    <button
                      onClick={() => updateField('tts_enabled', !settings.tts_enabled, true)}
                      className={`w-11 h-5.5 rounded-full flex items-center px-1 transition-all duration-500 ${settings.tts_enabled ? 'bg-accent' : 'bg-white/10'}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-transform duration-500 ${settings.tts_enabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="p-5 rounded-2xl bg-amber-500/[0.02] border border-amber-500/10 flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Privacy Note</span>
                      <p className="text-[11px] text-amber-200/50 leading-relaxed font-medium">A síntese de voz utiliza processamento em nuvem da Microsoft para maior realismo.</p>
                    </div>
                  </div>
                </div>

                <div className={`xl:col-span-7 space-y-4 transition-opacity duration-500 ${!settings.tts_enabled ? 'opacity-20 pointer-events-none' : ''}`}>
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] ml-1 opacity-60">Catálogo de Vozes</label>
                  <div className="grid gap-2">
                    {voices.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => updateField('tts_voice', v.id, true)}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${settings.tts_voice === v.id ? 'bg-accent/[0.03] border-accent/30' : 'bg-black/20 border-white/5 hover:bg-white/[0.02]'}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black ${settings.tts_voice === v.id ? 'bg-accent text-white' : 'bg-white/5 text-text-muted'}`}>{v.name[0]}</div>
                          <span className={`text-sm font-bold tracking-tight ${settings.tts_voice === v.id ? 'text-accent' : 'text-text-muted'}`}>{v.name}</span>
                        </div>
                        {settings.tts_voice === v.id && <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(139,92,246,0.8)]" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </FloatingCard>
  )
}
