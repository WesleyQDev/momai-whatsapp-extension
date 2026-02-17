import { useState, useEffect } from 'react'
import FloatingCard from './FloatingCard'
import HelpCard from './HelpCard'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'general' | 'brain' | 'updates' | 'economy' | 'voice'
type Theme = 'dark' | 'light'

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
  const { t, setLocale } = useI18n()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [isLoading, setIsLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [theme, setTheme] = useState<Theme>(
    (document.documentElement.getAttribute('data-theme') as Theme) || 'dark'
  )

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
    wake_word_sensitivity: 5,
    locale: 'pt-BR',
    daily_briefing_enabled: false
  })

  const [installStatus, setInstallStatus] = useState<
    'checking' | 'installed' | 'missing' | 'installing' | 'error'
  >('checking')
  const [installProgress, setInstallProgress] = useState(0)
  const [localDetails, setLocalDetails] = useState<{
    cpu_name?: string
    detected_hardware?: string
    recommended_build?: string
    available_builds?: Record<
      string,
      { label: string; version: string; size_mb: number; description: string }
    >
    latest_version?: string
    installed_version?: string
    installed_build?: string
    installed_backends?: string[]
    current_local_backend?: string
  }>({})
  const [gamingApps, setGamingApps] = useState<any[]>([])
  const [newApp, setNewApp] = useState({ name: '', executable: '' })

  useEffect(() => {
    loadSettings()
    checkLocalStatus()
    loadGamingApps()

    const handleModelChange = (e: any) => {
      const detail = e.detail
      if (detail) {
        setSettings((prev) => ({ ...prev, ai_provider: detail }))
      }
    }

    const handleSetupProgress = (e: any) => {
      setInstallProgress(e.detail.percent)
    }

    const handleSetupComplete = () => {
      setInstallStatus('installed')
      setInstallProgress(100)
      checkLocalStatus()
    }

    window.addEventListener('ai_model_changed', handleModelChange)
    window.addEventListener('momai_setup_progress', handleSetupProgress)
    window.addEventListener('momai_setup_complete', handleSetupComplete)
    return () => {
      window.removeEventListener('ai_model_changed', handleModelChange)
      window.removeEventListener('momai_setup_progress', handleSetupProgress)
      window.removeEventListener('momai_setup_complete', handleSetupComplete)
    }
  }, [])

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('momai_theme', newTheme)
  }

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
    setInstallProgress(0)
    try {
      const res = await api.post('/setup/install-engine', { backend })
      if (res.data.status === 'error') {
        setInstallStatus('error')
        alert(res.data.message)
      }
    } catch (error) {
      setInstallStatus('error')
    }
  }

  const loadGamingApps = async () => {
    try {
      const res = await api.get('/system/gaming-apps')
      setGamingApps(res.data)
    } catch (error) {
      console.error('Erro ao carregar apps de jogo:', error)
    }
  }

  const handleAddGamingApp = async () => {
    if (!newApp.name || !newApp.executable) return
    try {
      await api.post('/system/gaming-apps', newApp)
      setNewApp({ name: '', executable: '' })
      loadGamingApps()
    } catch (error) {
      alert(t('settings.economy.addAppError'))
    }
  }

  const handleDeleteGamingApp = async (id: number) => {
    try {
      await api.delete(`/system/gaming-apps/${id}`)
      loadGamingApps()
    } catch (error) {
      alert(t('settings.economy.removeAppError'))
    }
  }

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings')
      setSettings(res.data)
      if (res.data.locale) {
        setLocale(res.data.locale)
      }
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
      if (field === 'locale') {
        setLocale(value)
      }
      if (saveNow) saveSettings(newState)
      return newState
    })
    return Promise.resolve()
  }

  const voiceCatalog = [
    {
      langKey: 'settings.voice.lang.ptBR',
      code: 'p',
      voices: [
        { id: 'pf_dora', name: 'Dora', trait: 'female', suggested: true },
        { id: 'pm_alex', name: 'Alex', trait: 'male' },
        { id: 'pm_santa', name: 'Santa', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.enUS',
      code: 'a',
      voices: [
        { id: 'af_heart', name: 'Heart', trait: 'female' },
        { id: 'af_bella', name: 'Bella', trait: 'female' },
        { id: 'am_adam', name: 'Adam', trait: 'male' },
        { id: 'am_fenrir', name: 'Fenrir', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.enUK',
      code: 'b',
      voices: [
        { id: 'bf_alice', name: 'Alice', trait: 'female' },
        { id: 'bm_george', name: 'George', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.es',
      code: 'e',
      voices: [
        { id: 'ef_dora', name: 'Dora', trait: 'female' },
        { id: 'em_alex', name: 'Alex', trait: 'male' }
      ]
    },
    {
      langKey: 'settings.voice.lang.it',
      code: 'i',
      voices: [
        { id: 'if_sara', name: 'Sara', trait: 'female' },
        { id: 'im_nicola', name: 'Nicola', trait: 'male' }
      ]
    }
  ]

  const [expandedLang, setExpandedLang] = useState<string | null>('p')

  if (isLoading)
    return (
      <FloatingCard title={t('settings.loadingTitle')} onClose={onClose} width="max-w-2xl">
        <div className="p-10 text-center text-text-muted text-sm font-medium">
          {t('settings.loadingBody')}
        </div>
      </FloatingCard>
    )

  const icons = {
    general: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    ),
    updates: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    economy: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    voice: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    )
  }

  return (
    <FloatingCard title={t('settings.title')} onClose={onClose} width="max-w-4xl">
      <div className="flex h-[520px] -mx-6 -my-6 bg-card">
        {/* SIDEBAR */}
        <div className="w-44 border-r border-border bg-sidebar p-4 flex flex-col gap-1">
          {[
            { id: 'general', label: t('settings.tabs.general'), icon: icons.general },
            { id: 'brain', label: t('settings.tabs.brain'), icon: icons.brain },
            { id: 'voice', label: t('settings.tabs.voice'), icon: icons.voice },
            { id: 'economy', label: t('settings.tabs.economy'), icon: icons.economy },
            { id: 'updates', label: t('settings.tabs.updates'), icon: icons.updates }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-accent/10 text-accent shadow-sm' : 'text-text-muted hover:bg-text/5 hover:text-text'}`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'updates' &&
                localDetails.installed_version !== localDetails.latest_version &&
                localDetails.latest_version && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                )}
            </button>
          ))}
          
          <div className="flex-1" />
          
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 text-text-muted hover:bg-text/5 hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Ajuda
          </button>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {activeTab === 'general' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.general.title')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.general.subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.general.userLabel')}
                    </label>
                    <input
                      type="text"
                      value={settings.user_name}
                      onChange={(e) => updateField('user_name', e.target.value)}
                      onBlur={() => saveSettings(settings)}
                      className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text focus:border-accent/40 outline-none transition-all"
                      placeholder={t('settings.general.userPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.general.themeLabel')}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => changeTheme('dark')}
                        className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'dark' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                        {t('settings.general.theme.dark')}
                      </button>
                      <button
                        onClick={() => changeTheme('light')}
                        className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'light' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.07" x2="5.64" y2="17.66" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                        {t('settings.general.theme.light')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.language.uiLabel')}
                    </span>
                    <select
                      value={settings.locale}
                      onChange={(e) => updateField('locale', e.target.value, true)}
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none"
                    >
                      <option value="pt-BR">{t('settings.language.ptBR')}</option>
                      <option value="en-US">{t('settings.language.enUS')}</option>
                    </select>
                  </div>
                </div>

                {/* Manutencao e Resets */}
                <div className="space-y-4 pt-6 border-t border-border/40">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest text-red-500/60">
                    {t('settings.general.maintenanceTitle')}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        updateField('tutorial_completed', false, true)
                        alert(t('settings.general.resetTutorialSuccess') || 'Tutorial reiniciado!')
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-[11px] font-black uppercase rounded-lg hover:bg-accent hover:text-white transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      {t('settings.general.resetTutorial')}
                    </button>

                    <button
                      onClick={() => {
                        updateField('onboarding_completed', false, true)
                        alert(t('settings.general.resetOnboardingSuccess') || 'Setup reiniciado!')
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-text/5 text-text/40 text-[11px] font-black uppercase rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                      </svg>
                      {t('settings.general.resetOnboarding')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'brain' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-black text-text uppercase tracking-tight">
                    {t('settings.brain.title')}
                  </h2>
                  <p className="text-[10px] text-text-muted font-bold uppercase tracking-wide opacity-70">
                    {t('settings.brain.localCoreSubtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-accent/5 border border-accent/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[9px] font-black text-accent uppercase tracking-widest">
                    {t('settings.brain.active')}
                  </span>
                </div>
              </div>

              <div className="space-y-5">
                {/* Persona Section */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.general.personaLabel')}
                  </label>
                  <textarea
                    value={settings.assistant_persona}
                    onChange={(e) => updateField('assistant_persona', e.target.value)}
                    onBlur={() => saveSettings(settings)}
                    className="w-full h-32 bg-input border border-border/60 rounded-lg px-4 py-3 text-sm text-text focus:border-accent/40 outline-none resize-none transition-all leading-relaxed placeholder:text-text-muted/30"
                    placeholder={t('settings.general.personaPlaceholder')}
                  />
                </div>

                {/* Modelo Ativo */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.brain.activeModel')}
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-border/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-text uppercase tracking-tight">
                        {settings.ai_model === 'default' ? 'Qwen 3 4B Instruct' : settings.ai_model}
                      </span>
                      <span className="text-[9px] text-text-muted font-medium opacity-60">
                        unsloth/Qwen3-4B-Instruct-2507-GGUF
                      </span>
                    </div>
                    <span className="text-[8px] font-black text-text-muted/60 uppercase border border-border/40 px-1.5 py-0.5 rounded">
                      Q6_K GGUF
                    </span>
                  </div>
                </div>

                {/* Hardware e Configuração */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                        {t('settings.brain.hardware')}
                      </label>
                      {localDetails.current_local_backend && (
                        <span className={`text-[8px] font-black uppercase ${localDetails.current_local_backend === 'cpu' ? 'text-text-muted' : 'text-green-500'}`}>
                          {localDetails.current_local_backend === 'cpu' ? 'CPU' : 'GPU'}
                        </span>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-black/10 border border-border/40 min-h-[50px] flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-text uppercase truncate">
                        {localDetails.detected_hardware || t('settings.brain.searching')}
                      </span>
                      <span className="text-[8px] text-text-muted font-medium truncate opacity-60">
                        {localDetails.cpu_name || '...'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.brain.acceleration')}
                    </label>
                    <div className="relative">
                      <select
                        value={settings.local_backend}
                        onChange={(e) => updateField('local_backend', e.target.value, true).then(checkLocalStatus)}
                        className="w-full h-[50px] bg-black/10 border border-border/40 rounded-lg px-3 text-[10px] font-bold text-text outline-none appearance-none hover:border-accent/40"
                      >
                        <option value="auto" className="bg-[#1a1a1a]">{t('settings.brain.backend.auto')}</option>
                        <option value="cuda" className="bg-[#1a1a1a]">{t('settings.brain.backend.cuda')}</option>
                        <option value="vulkan" className="bg-[#1a1a1a]">{t('settings.brain.backend.vulkan')}</option>
                        <option value="cpu" className="bg-[#1a1a1a]">{t('settings.brain.backend.cpu')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.tabs.voice')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  Gerencie as capacidades de fala e escuta.
                </p>
              </div>

              {/* Recursos de Voz */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-text uppercase tracking-wider">{t('settings.general.dailyBriefingLabel')}</span>
                      <span className="text-[10px] text-text-muted font-medium">{t('settings.general.dailyBriefingSubtitle')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateField('daily_briefing_enabled', !settings.daily_briefing_enabled, true)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${settings.daily_briefing_enabled ? 'bg-accent' : 'bg-text-muted/20'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${settings.daily_briefing_enabled ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.voice.catalogLabel')}
                  </label>
                  <div className="flex gap-4 h-[220px]">
                    <div className="w-[160px] space-y-1.5 overflow-y-auto custom-scrollbar pr-2">
                      {voiceCatalog.map((catalog) => (
                        <button
                          key={catalog.code}
                          onClick={() => setExpandedLang(catalog.code)}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-[9px] font-black uppercase tracking-tight transition-all ${expandedLang === catalog.code ? 'bg-accent/10 border-accent/40 text-accent shadow-sm' : 'bg-black/10 border-transparent text-text-muted hover:bg-black/20'}`}
                        >
                          {t(catalog.langKey)}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 p-2.5 rounded-xl bg-black/10 border border-border/40 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-1 gap-1">
                        {voiceCatalog.find((c) => c.code === expandedLang)?.voices.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => updateField('tts_voice', v.id, true)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-[10px] font-bold transition-all ${settings.tts_voice === v.id ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-input border-border/40 text-text-muted hover:bg-black/20'}`}
                          >
                            <div className="flex flex-col items-start gap-0.5">
                              <span>{v.suggested ? t('settings.voice.nameSuggested', { name: v.name }) : v.name}</span>
                              <span className="text-[7px] uppercase font-black tracking-tighter opacity-60">{t(`settings.voice.trait.${v.trait}`)}</span>
                            </div>
                            {settings.tts_voice === v.id && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.updates.title')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.updates.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-xl border bg-input border-border flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-black text-text uppercase tracking-tight">{t('settings.updates.coreTitle')}</span>
                      <span className="text-[10px] text-text-muted font-medium">{t('settings.updates.coreVersion', { version: '0.1.0' })}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">{t('settings.updates.systemUpToDate')}</span>
                </div>

                <div className="p-5 rounded-xl border bg-input border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${localDetails.installed_version !== localDetails.latest_version && localDetails.latest_version ? 'bg-accent/20 text-accent animate-pulse' : 'bg-black/20 text-text-muted'}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-black text-text uppercase tracking-tight">{t('settings.updates.engineTitle')}</span>
                        <span className="text-[10px] text-text-muted font-medium">{localDetails.installed_version ? t('settings.updates.engineInstalled', { version: localDetails.installed_version }) : t('settings.updates.engineNotInstalled')}</span>
                      </div>
                    </div>
                    {installStatus === 'installing' ? (
                      <span className="text-[10px] font-black text-accent uppercase tracking-widest animate-pulse">{t('settings.updates.updating', { percent: installProgress })}</span>
                    ) : localDetails.installed_version !== localDetails.latest_version && localDetails.latest_version ? (
                      <button onClick={() => handleInstallEngine(settings.local_backend === 'auto' ? undefined : settings.local_backend)} className="px-4 py-2 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20">{t('settings.updates.updateTo', { version: localDetails.latest_version })}</button>
                    ) : (
                      <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">{t('settings.updates.engineUpToDate')}</span>
                    )}
                  </div>
                  {installStatus === 'installing' && (
                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-300 ease-out" style={{ width: `${installProgress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'economy' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-text tracking-tight uppercase">{t('settings.economy.title')}</h2>
                  <span className="text-[10px] font-black bg-accent text-white px-2 py-0.5 rounded-md tracking-tighter">{t('settings.economy.badge')}</span>
                </div>
                <p className="text-[11px] text-text-muted font-medium">{t('settings.economy.subtitle')}</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-accent/5 border border-border/20 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 12h4M14 8h-4v8h4M15 12h3" /><rect x="2" y="6" width="20" height="12" rx="2" /></svg>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-[12px] font-black text-text uppercase">{t('settings.economy.monitoringTitle')}</span>
                    <p className="text-[10px] text-text-muted leading-relaxed">{t('settings.economy.monitoringBody')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">{t('settings.economy.addTrigger')}</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder={t('settings.economy.appNamePlaceholder')} value={newApp.name} onChange={(e) => setNewApp((prev) => ({ ...prev, name: e.target.value }))} className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40" />
                    <input type="text" placeholder={t('settings.economy.appExePlaceholder')} value={newApp.executable} onChange={(e) => setNewApp((prev) => ({ ...prev, executable: e.target.value }))} className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40" />
                    <button onClick={handleAddGamingApp} className="px-4 bg-accent text-white rounded-lg text-xs font-black uppercase hover:opacity-90 transition-all">{t('settings.economy.addButton')}</button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">{t('settings.economy.monitoredApps')}</label>
                  <div className="grid grid-cols-1 gap-2">
                    {gamingApps.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-border rounded-xl">
                        <span className="text-[11px] text-text-muted font-medium italic">{t('settings.economy.emptyApps')}</span>
                      </div>
                    ) : (
                      gamingApps.map((app) => (
                        <div key={app.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-border">
                          <div className="flex flex-col"><span className="text-[12px] font-bold text-text">{app.name}</span><span className="text-[10px] text-accent font-mono">{app.executable}</span></div>
                          <button onClick={() => handleDeleteGamingApp(app.id)} className="p-2 text-text-muted hover:text-red-500 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}
    </FloatingCard>
  )
}
