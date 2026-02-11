import { useState, useEffect } from 'react'
import FloatingCard from './FloatingCard'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'

interface SettingsCardProps {
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'general' | 'brain' | 'voice' | 'updates' | 'economy'
type Theme = 'dark' | 'light'

export default function SettingsCard({ onClose, initialTab = 'general' }: SettingsCardProps) {
  const { t, setLocale } = useI18n()
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [isLoading, setIsLoading] = useState(true)
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
    min_interface_chars: 240,
    prebuffer_chars: 120
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

  const handleUninstallEngine = async (backend?: string) => {
    if (!confirm(t('settings.brain.uninstallConfirm'))) return

    try {
      await api.delete('/setup/uninstall-engine', { params: { backend } })
      checkLocalStatus()
    } catch (error) {
      alert(t('settings.brain.uninstallError'))
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
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    ),
    brain: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
        <path d="M12 12 2.1 12.1"></path>
      </svg>
    ),
    voice: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    ),
    updates: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    economy: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                        {t('settings.general.theme.dark')}
                      </button>
                      <button
                        onClick={() => changeTheme('light')}
                        className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-xs font-bold transition-all ${theme === 'light' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-input border-border text-text-muted hover:text-text'}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <circle cx="12" cy="12" r="5" />
                          <line x1="12" y1="1" x2="12" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="23" />
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                          <line x1="1" y1="12" x2="3" y2="12" />
                          <line x1="21" y1="12" x2="23" y2="12" />
                          <line x1="4.22" y1="19.07" x2="5.64" y2="17.66" />
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                        {t('settings.general.theme.light')}
                      </button>
                    </div>
                  </div>
                </div>

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

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.general.languageSection')}
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                          {t('settings.general.minInterface')}
                        </span>
                        <input
                          type="number"
                          min={80}
                          max={2000}
                          value={settings.min_interface_chars}
                          onChange={(e) =>
                            updateField('min_interface_chars', Number(e.target.value))
                          }
                          onBlur={() => saveSettings(settings)}
                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                          {t('settings.general.prebuffer')}
                        </span>
                        <input
                          type="number"
                          min={40}
                          max={500}
                          value={settings.prebuffer_chars}
                          onChange={(e) => updateField('prebuffer_chars', Number(e.target.value))}
                          onBlur={() => saveSettings(settings)}
                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      {t('settings.general.helperText')}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          updateField('tutorial_completed', false, true)
                          alert(
                            t('settings.general.resetTutorialSuccess') || 'Tutorial reiniciado!'
                          )
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-[11px] font-black uppercase rounded-lg hover:bg-accent hover:text-white transition-all"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
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
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        {t('settings.general.resetOnboarding')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'brain' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.brain.title')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.brain.subtitle')}
                </p>
              </div>

              <div className="p-5 rounded-xl border bg-input border-border flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <h4 className="text-[13px] font-black text-text uppercase tracking-wider">
                      {t('settings.brain.localCoreTitle')}
                    </h4>
                    <span className="text-[9px] text-text-muted font-black uppercase tracking-widest opacity-60">
                      {t('settings.brain.localCoreSubtitle')}
                    </span>
                  </div>
                  {settings.ai_provider === 'local' ? (
                    <span className="text-[9px] font-black text-accent uppercase border border-accent/20 px-2 py-0.5 rounded-md bg-accent/5">
                      {t('settings.brain.active')}
                    </span>
                  ) : (
                    <button
                      onClick={() => updateField('ai_provider', 'local', true)}
                      className="text-[9px] font-bold text-text-muted hover:text-text uppercase"
                    >
                      {t('settings.brain.useLocal')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.brain.hardware')}
                    </label>
                    <div className="p-3 rounded-lg bg-black/20 border border-border flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-text uppercase tracking-tight">
                        {localDetails.detected_hardware || t('settings.brain.searching')}
                      </span>
                      <span className="text-[9px] text-text-muted font-medium italic truncate">
                        {t('settings.brain.cpuLabel')} {localDetails.cpu_name || '...'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                      {t('settings.brain.acceleration')}
                    </label>
                    <select
                      value={settings.local_backend}
                      onChange={(e) =>
                        updateField('local_backend', e.target.value, true).then(checkLocalStatus)
                      }
                      className="w-full bg-black/20 border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none"
                    >
                      <option value="auto">{t('settings.brain.backend.auto')}</option>
                      <option value="cuda">{t('settings.brain.backend.cuda')}</option>
                      <option value="vulkan">{t('settings.brain.backend.vulkan')}</option>
                      <option value="cpu">{t('settings.brain.backend.cpu')}</option>
                    </select>
                  </div>
                </div>

                {/* Status de Instalação do Motor Local */}
                <div className="mt-2 pt-4 border-t border-border/40">
                  {installStatus === 'missing' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-text">
                              {t('settings.brain.engineMissing')}
                            </span>
                            <span className="text-[9px] text-text-muted font-medium">
                              {t('settings.brain.versionLabel')}{' '}
                              <span className="text-accent">
                                {localDetails.latest_version || '...'}
                              </span>
                              {' • '}
                              {t('settings.brain.downloadLabel')}{' '}
                              <span className="text-text font-bold italic">
                                {settings.local_backend === 'auto'
                                  ? t('settings.brain.downloadAuto', {
                                      build: localDetails.recommended_build?.toUpperCase() || 'AUTO'
                                    })
                                  : settings.local_backend.toUpperCase()}
                              </span>
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleInstallEngine(
                              settings.local_backend === 'auto' ? undefined : settings.local_backend
                            )
                          }
                          className="px-3 py-1.5 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all"
                        >
                          {t('settings.brain.installNow')}
                        </button>
                      </div>
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        {t('settings.brain.installInfo')}
                      </p>
                    </div>
                  )}

                  {installStatus === 'installing' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                        <span className="text-accent animate-pulse">
                          {t('settings.brain.downloading')}
                        </span>
                        <span className="text-text">{installProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-300 ease-out"
                          style={{ width: `${installProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {installStatus === 'installed' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-accent/5 border border-accent/20">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              className="text-accent"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-[11px] font-black text-text uppercase">
                              {t('settings.brain.ready')}
                            </span>
                          </div>
                          <span className="text-[9px] text-text-muted font-medium">
                            v{localDetails.installed_version} • {localDetails.installed_build}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {localDetails.installed_version !== localDetails.latest_version &&
                            localDetails.latest_version && (
                              <button
                                onClick={() =>
                                  handleInstallEngine(
                                    settings.local_backend === 'auto'
                                      ? undefined
                                      : settings.local_backend
                                  )
                                }
                                className="mr-2 px-2 py-1 bg-accent/20 text-accent text-[9px] font-black uppercase rounded hover:bg-accent hover:text-white transition-all"
                              >
                                {t('settings.brain.updateTo', {
                                  version: localDetails.latest_version
                                })}
                              </button>
                            )}
                          <button
                            onClick={() =>
                              handleUninstallEngine(
                                settings.local_backend === 'auto'
                                  ? undefined
                                  : settings.local_backend
                              )
                            }
                            className="p-2 text-text-muted hover:text-red-500 transition-colors"
                            title={t('settings.brain.removeEngine')}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {installStatus === 'error' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-red-500">
                        {t('settings.brain.installError')}
                      </span>
                      <button
                        onClick={() => checkLocalStatus()}
                        className="text-[10px] font-black uppercase text-accent"
                      >
                        {t('settings.brain.retry')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-border bg-input/50 space-y-2">
                <div className="flex items-center gap-2 text-accent">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {t('settings.brain.privacyTitle')}
                  </span>
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  {t('settings.brain.privacyBody')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'voice' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-text tracking-tight uppercase">
                  {t('settings.voice.title')}
                </h2>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.voice.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-input border border-border flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-text uppercase tracking-tight">
                      {t('settings.voice.wakeTitle')}
                    </span>
                    <span className="text-[10px] text-text-muted font-medium italic">
                      {t('settings.voice.wakeSubtitle')}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      updateField('wake_word_enabled', !settings.wake_word_enabled, true)
                    }
                    className={`w-10 h-5 rounded-full flex items-center px-1 transition-all ${settings.wake_word_enabled ? 'bg-accent' : 'bg-text-muted/20'}`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full transition-transform ${settings.wake_word_enabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-input border border-border flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-text uppercase tracking-tight">
                      {t('settings.voice.ttsTitle')}
                    </span>
                    <span className="text-[10px] text-text-muted font-medium italic">
                      {t('settings.voice.ttsSubtitle')}
                    </span>
                  </div>
                  <button
                    onClick={() => updateField('tts_enabled', !settings.tts_enabled, true)}
                    className={`w-10 h-5 rounded-full flex items-center px-1 transition-all ${settings.tts_enabled ? 'bg-accent' : 'bg-text-muted/20'}`}
                  >
                    <div
                      className={`w-3 h-3 bg-white rounded-full transition-transform ${settings.tts_enabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                <div
                  className={`space-y-3 transition-opacity ${!settings.tts_enabled ? 'opacity-30 pointer-events-none' : ''}`}
                >
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.voice.catalogLabel')}
                  </label>
                  <div className="flex gap-4 h-[240px]">
                    {/* Coluna de Idiomas */}
                    <div className="w-[180px] space-y-1.5 overflow-y-auto custom-scrollbar pr-2">
                      {voiceCatalog.map((catalog) => (
                        <button
                          key={catalog.code}
                          onClick={() => setExpandedLang(catalog.code)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border text-[10px] font-black uppercase tracking-tight transition-all ${
                            expandedLang === catalog.code
                              ? 'bg-accent/10 border-accent/40 text-accent shadow-sm'
                              : 'bg-black/10 border-transparent text-text-muted hover:bg-black/20'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${expandedLang === catalog.code ? 'bg-accent animate-pulse' : 'bg-text-muted/30'}`}
                            />
                            {t(catalog.langKey)}
                          </div>
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className={`transition-transform duration-300 ${expandedLang === catalog.code ? '-rotate-90' : ''}`}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </button>
                      ))}
                    </div>

                    {/* Coluna de Vozes (Dinâmica) */}
                    <div className="flex-1 p-3 rounded-xl bg-black/10 border border-border/40 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
                      <div className="grid grid-cols-1 gap-1.5">
                        {voiceCatalog
                          .find((c) => c.code === expandedLang)
                          ?.voices.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => updateField('tts_voice', v.id, true)}
                              className={`flex items-center justify-between p-3 rounded-lg border text-[11px] font-bold transition-all ${
                                settings.tts_voice === v.id
                                  ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20 translate-x-1'
                                  : 'bg-input border-border/40 text-text-muted hover:bg-black/20'
                              }`}
                            >
                              <div className="flex flex-col items-start gap-0.5">
                                <span className="tracking-tight">
                                  {v.suggested
                                    ? t('settings.voice.nameSuggested', { name: v.name })
                                    : v.name}
                                </span>
                                <span
                                  className={`text-[8px] uppercase font-black tracking-tighter ${settings.tts_voice === v.id ? 'text-white/70' : 'text-text-muted opacity-60'}`}
                                >
                                  {t(`settings.voice.trait.${v.trait}`)}
                                </span>
                              </div>
                              {settings.tts_voice === v.id && (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>
                          ))}

                        {!expandedLang && (
                          <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-40">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="mb-2"
                            >
                              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                              <path d="M12 12L2.7 7.1" />
                            </svg>
                            <span className="text-[10px] font-medium italic">
                              {t('settings.voice.selectLanguage')}
                            </span>
                          </div>
                        )}
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
                {/* Sistema Version */}
                <div className="p-5 rounded-xl border bg-input border-border flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-black text-text uppercase tracking-tight">
                        {t('settings.updates.coreTitle')}
                      </span>
                      <span className="text-[10px] text-text-muted font-medium">
                        {t('settings.updates.coreVersion', { version: '0.1.0' })}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">
                    {t('settings.updates.systemUpToDate')}
                  </span>
                </div>

                {/* Motor Llama.cpp Version */}
                <div className="p-5 rounded-xl border bg-input border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${localDetails.installed_version !== localDetails.latest_version && localDetails.latest_version ? 'bg-accent/20 text-accent animate-pulse' : 'bg-black/20 text-text-muted'}`}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-black text-text uppercase tracking-tight">
                          {t('settings.updates.engineTitle')}
                        </span>
                        <span className="text-[10px] text-text-muted font-medium">
                          {localDetails.installed_version
                            ? t('settings.updates.engineInstalled', {
                                version: localDetails.installed_version
                              })
                            : t('settings.updates.engineNotInstalled')}
                        </span>
                      </div>
                    </div>

                    {installStatus === 'installing' ? (
                      <span className="text-[10px] font-black text-accent uppercase tracking-widest animate-pulse">
                        {t('settings.updates.updating', { percent: installProgress })}
                      </span>
                    ) : localDetails.installed_version !== localDetails.latest_version &&
                      localDetails.latest_version ? (
                      <button
                        onClick={() =>
                          handleInstallEngine(
                            settings.local_backend === 'auto' ? undefined : settings.local_backend
                          )
                        }
                        className="px-4 py-2 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                      >
                        {t('settings.updates.updateTo', { version: localDetails.latest_version })}
                      </button>
                    ) : (
                      <span className="text-[10px] font-black text-text-muted uppercase border border-border px-3 py-1 rounded-full bg-black/20">
                        {t('settings.updates.engineUpToDate')}
                      </span>
                    )}
                  </div>

                  {installStatus === 'installing' && (
                    <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300 ease-out"
                        style={{ width: `${installProgress}%` }}
                      />
                    </div>
                  )}

                  {localDetails.latest_version &&
                    localDetails.installed_version !== localDetails.latest_version && (
                      <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
                        <p className="text-[10px] text-text-muted leading-relaxed italic">
                          {t('settings.updates.engineUpdateInfo', {
                            version: localDetails.latest_version,
                            build: localDetails.recommended_build?.toUpperCase() || 'AUTO'
                          })}
                        </p>
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
                  <h2 className="text-lg font-black text-text tracking-tight uppercase">
                    {t('settings.economy.title')}
                  </h2>
                  <span className="text-[10px] font-black bg-accent text-white px-2 py-0.5 rounded-md tracking-tighter">
                    {t('settings.economy.badge')}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted font-medium">
                  {t('settings.economy.subtitle')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M6 12h4M14 8h-4v8h4M15 12h3" />
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                    </svg>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-[12px] font-black text-text uppercase">
                      {t('settings.economy.monitoringTitle')}
                    </span>
                    <p className="text-[10px] text-text-muted leading-relaxed">
                      {t('settings.economy.monitoringBody')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.economy.addTrigger')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('settings.economy.appNamePlaceholder')}
                      value={newApp.name}
                      onChange={(e) => setNewApp((prev) => ({ ...prev, name: e.target.value }))}
                      className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40"
                    />
                    <input
                      type="text"
                      placeholder={t('settings.economy.appExePlaceholder')}
                      value={newApp.executable}
                      onChange={(e) =>
                        setNewApp((prev) => ({ ...prev, executable: e.target.value }))
                      }
                      className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-[11px] font-bold text-text outline-none focus:border-accent/40"
                    />
                    <button
                      onClick={handleAddGamingApp}
                      className="px-4 bg-accent text-white rounded-lg text-xs font-black uppercase hover:opacity-90 transition-all"
                    >
                      {t('settings.economy.addButton')}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-muted uppercase tracking-widest">
                    {t('settings.economy.monitoredApps')}
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {gamingApps.length === 0 ? (
                      <div className="py-8 text-center border border-dashed border-border rounded-xl">
                        <span className="text-[11px] text-text-muted font-medium italic">
                          {t('settings.economy.emptyApps')}
                        </span>
                      </div>
                    ) : (
                      gamingApps.map((app) => (
                        <div
                          key={app.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-border"
                        >
                          <div className="flex flex-col">
                            <span className="text-[12px] font-bold text-text">{app.name}</span>
                            <span className="text-[10px] text-accent font-mono">
                              {app.executable}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteGamingApp(app.id)}
                            className="p-2 text-text-muted hover:text-red-500 transition-colors"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
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
    </FloatingCard>
  )
}
