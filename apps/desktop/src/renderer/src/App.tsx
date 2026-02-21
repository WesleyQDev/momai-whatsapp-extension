import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import SplashScreen from './components/floating/SplashScreen'
import UpdateToast from './components/floating/UpdateToast'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import RemindersSidebar from './components/chat/RemindersSidebar'
import ConfirmationCard from './components/floating/ConfirmationCard'
import OnboardingCard from './components/floating/OnboardingCard'
import TutorialTour from './components/floating/TutorialTour'
import AutoUpdateCard from './components/floating/AutoUpdateCard'
import logo from './assets/icon.png'

import MainViewRenderer from './components/MainViewRenderer'
import { fetchExtensions, fetchSettings, SettingsData } from './services/api'
import { useI18n } from './i18n'

function App(): React.JSX.Element {
  const { setLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const chat = useChat()
  const { graphState, handleGraphOption, closeGraph, clearHistory } = chat
  const { localMode, statusInfo, hasUpdate, initMessage, initProgress, isReady, isOnline } =
    useStatus()
  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    'general' | 'brain' | 'voice' | 'economy' | 'updates'
  >('general')
  const [isCompact, setIsCompact] = useState(window.innerWidth < 850)
  const [extensions, setExtensions] = useState<any[]>([])
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settings, setSettings] = useState<SettingsData | null>(null)

  // Overlay Helper
  useEffect(() => {
    const checkAndTriggerOverlay = async () => {
      if (graphState.view) {
        const state = await window.electron.ipcRenderer.invoke('get-window-state')
        // Se a janela principal estiver minimizada ou oculta, envia para overlay
        if (state.minimized || !state.visible) {
          window.electron.ipcRenderer.send('open-overlay', graphState)
        } else {
          // Se janela visivel, garante que overlay fecha (opcional)
          window.electron.ipcRenderer.send('close-overlay')
        }
      } else {
        window.electron.ipcRenderer.send('close-overlay')
      }
    }
    checkAndTriggerOverlay()
  }, [graphState])

  // Listen for actions from Overlay
  useEffect(() => {
    // @ts-ignore
    const remove = window.electron.ipcRenderer.on('trigger-action', (_, action) => {
      handleGraphOption(action)
    })
    return () => {
      remove()
    }
  }, [handleGraphOption])

  const openSettings = (tab: 'general' | 'brain' | 'voice' | 'economy' | 'updates' = 'general') => {
    setSettingsTab(tab)
    setShowSettings(true)
  }

  const triggerClearHistory = () => {
    setShowClearConfirm(true)
  }

  const confirmClearHistory = () => {
    clearHistory()
    setShowClearConfirm(false)
  }

  // Sincroniza configurações e decide se mostra onboarding/tutorial
  useEffect(() => {
    if (!isOnline || settingsLoaded) return

    const syncLocale = async () => {
      try {
        const data = await fetchSettings()
        setSettings(data)
        if (data.locale) {
          setLocale(data.locale as any)
        }

        if (!data.onboarding_completed) {
          setShowOnboarding(true)
        }
        setSettingsLoaded(true)

        // Carrega extensões agora que sabemos que o backend responde
        const exts = await fetchExtensions()
        setExtensions(exts)
      } catch (err) {
        console.error('Retrying settings sync...', err)
      }
    }

    syncLocale()
  }, [isOnline, settingsLoaded, setLocale])

  // Sincroniza configurações via evento global
  useEffect(() => {
    const handleSync = (e: any) => {
      if (e.detail) {
        setSettings(e.detail)
      }
    }
    window.addEventListener('momai_settings_sync', handleSync)
    return () => window.removeEventListener('momai_settings_sync', handleSync)
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem('momai_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)

    const handleResize = () => setIsCompact(window.innerWidth < 850)
    window.addEventListener('resize', handleResize)

    // Event listeners only need to be attached once
    const handleSync = (e: any) => setExtensions(e.detail)
    window.addEventListener('momai_extensions_sync', handleSync)

    const handleOpenExtensions = () => {
      navigate('/extensions', { state: { tab: 'store' } })
    }
    window.addEventListener('momai_open_extensions', handleOpenExtensions)

    const handleNavigate = (e: any) => {
      const detail = e.detail || {}
      if (detail.path) {
        navigate(detail.path, detail.state ? { state: detail.state } : undefined)
      }
    }
    window.addEventListener('momai_navigate', handleNavigate)

    const handleOpenSettings = (e: any) => {
      const tab = e.detail?.tab || 'general'
      openSettings(tab)
    }
    window.addEventListener('momai_open_settings', handleOpenSettings)

    const handleSetTheme = (e: any) => {
      const theme = e.detail?.theme
      if (theme === 'dark' || theme === 'light') {
        localStorage.setItem('momai_theme', theme)
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
    window.addEventListener('momai_set_theme', handleSetTheme)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('momai_extensions_sync', handleSync)
      window.removeEventListener('momai_open_extensions', handleOpenExtensions)
      window.removeEventListener('momai_navigate', handleNavigate)
      window.removeEventListener('momai_open_settings', handleOpenSettings)
      window.removeEventListener('momai_set_theme', handleSetTheme)
    }
  }, [])

  const currentExtension =
    location.pathname === '/'
      ? extensions.find((e) => e.name === 'responder')
      : extensions.find((e) => location.pathname.includes(e.id))

  let uiView = 'ChatDashboard'
  if (location.pathname === '/extensions') {
    uiView = 'ExtensionsStore'
  }
  if (location.pathname === '/notes') {
    uiView = 'NotesDashboard'
  }
  if (location.pathname === '/agenda') {
    uiView = 'RemindersDashboard'
  }

  const isChat = uiView === 'ChatDashboard' || uiView === 'RemindersDashboard'

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <TitleBar onClearHistory={triggerClearHistory} activeRoute={location.pathname} />

      <div className="flex-1 flex w-full min-h-0 relative">
        <LateralBar
          activeRoute={location.pathname}
          onNavigate={(path) => navigate(path)}
          onOpenSettings={() => openSettings('general')}
          isCompact={isCompact}
        />

        <main className="flex-1 relative flex overflow-hidden">
          <div className="absolute inset-0 z-0 bg-bg">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-bg to-bg" />
          </div>

          <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden bg-transparent">
            <div
              className={`w-full h-full flex ${isCompact ? 'flex-col' : `flex-row ${isChat ? 'p-6 gap-6 justify-center' : ''}`}`}
            >
              {/* DYNAMIC MAIN VIEW (Chat, Extensions, etc) */}
              <MainViewRenderer
                viewName={uiView}
                isCompact={isCompact}
                onOpenSettings={openSettings}
                extensionData={currentExtension}
                chat={chat}
                statusInfo={statusInfo}
              />

              {/* 2. Graph Panel (Middle Column - Conditional) */}
              {graphState.view === 'side' && !isCompact && (
                <div className="flex-1 min-w-[320px] max-w-[600px] rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative animate-in slide-in-from-right duration-500">
                  <GraphInterface
                    view="side"
                    content={graphState.content}
                    options={graphState.options}
                    optionsMap={graphState.optionsMap}
                    uiSchema={graphState.uiSchema}
                    onOptionSelect={handleGraphOption}
                    onClose={closeGraph}
                  />
                </div>
              )}

              {/* 3. Desktop Sidebar (Right Side - Visible only in Chat) */}
              {!isCompact && isChat && (
                <div className="w-[320px] flex flex-col gap-6 h-full shrink-0">
                  <div className="flex flex-col items-center justify-center py-2 animate-fade-in shrink-0">
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full opacity-50"></div>
                      <img
                        src={logo}
                        alt="MomAI"
                        className="w-20 h-20 object-contain relative z-10 drop-shadow-2xl"
                      />
                    </div>

                    {(settings === null || settings.wake_word_enabled) && (
                      <div className="relative flex flex-col items-center mt-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Pontinhos brilhantes flutuantes */}
                        <div className="absolute -inset-6 pointer-events-none">
                          <div
                            className="absolute top-1/2 left-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
                            style={{ animationDuration: '1.5s' }}
                          />
                          <div
                            className="absolute top-1/2 right-0 w-1 h-1 rounded-full bg-accent/60 animate-pulse"
                            style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
                          />
                          <div
                            className="absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full bg-accent/40 animate-ping"
                            style={{ animationDuration: '2s' }}
                          />
                          <div
                            className="absolute bottom-0 left-1/2 w-1 h-1 rounded-full bg-accent/50 animate-pulse"
                            style={{ animationDuration: '1.8s', animationDelay: '0.5s' }}
                          />
                          <div
                            className="absolute top-1/4 left-1/4 w-0.5 h-0.5 rounded-full bg-accent/70 animate-ping"
                            style={{ animationDuration: '2.5s' }}
                          />
                          <div
                            className="absolute top-3/4 right-1/4 w-0.5 h-0.5 rounded-full bg-accent/70 animate-ping"
                            style={{ animationDuration: '2.5s', animationDelay: '1s' }}
                          />
                        </div>

                        {/* Texto com brilho suave e efeito de profundidade */}
                        <div className="relative mt-2">
                          <div
                            className="absolute -inset-3 bg-accent/20 blur-2xl animate-pulse"
                            style={{ animationDuration: '3s' }}
                          />
                          <span className="relative text-sm font-medium text-text-muted/80 whitespace-nowrap">
                            Tente dizer{' '}
                            <span className="text-accent font-bold text-lg drop-shadow-[0_0_12px_rgba(var(--accent-rgb),0.6)]">
                              &quot;Luna&quot;
                            </span>
                            ..
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative flex flex-col">
                    <RemindersSidebar
                      onNavigate={() => navigate('/extensions/com.momai.builtin.scheduler')}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Floating Interfaces */}
      {showSettings && (
        <SettingsCard onClose={() => setShowSettings(false)} initialTab={settingsTab} />
      )}

      {showClearConfirm && (
        <ConfirmationCard
          title="Limpar Histórico"
          message="Deseja realmente apagar todo o histórico de mensagens? Esta ação não pode ser desfeita."
          options={['Cancelar', 'Confirmar']}
          onCancel={() => setShowClearConfirm(false)}
          onSelect={(opt) => {
            if (opt === 'Confirmar') confirmClearHistory()
            else setShowClearConfirm(false)
          }}
        />
      )}

      {/* Center Graph (Modal) */}
      {graphState.view === 'center' && (
        <GraphInterface
          view="center"
          content={graphState.content}
          options={graphState.options}
          optionsMap={graphState.optionsMap}
          uiSchema={graphState.uiSchema}
          onOptionSelect={handleGraphOption}
          onClose={closeGraph}
        />
      )}

      {/* SplashScreen */}
      <SplashScreen
        isFullyReady={isReady}
        status={localMode}
        initMessage={initMessage}
        initProgress={initProgress}
        onFinished={() => {
          if (settingsLoaded && !showOnboarding) {
            window.electron.ipcRenderer.send('app-ready')
          }
        }}
      />

      {/* Update Notification */}
      <AutoUpdateCard />
      {hasUpdate && !showSettings && (
        <UpdateToast
          installedVersion={statusInfo?.setup.installed_version}
          latestVersion={statusInfo?.setup.latest_version}
          onOpenSettings={openSettings}
        />
      )}

      {showOnboarding && (
        <OnboardingCard
          onFinish={() => {
            setShowOnboarding(false)
            // setShowTutorial(true)
            // Agora que o onboarding acabou, podemos redimensionar a janela
            window.electron.ipcRenderer.send('app-ready')
          }}
        />
      )}

      {/* showTutorial && <TutorialTour onFinish={() => setShowTutorial(false)} /> */}
      {/*
      <FortScriptToast />

      {!isCompact && <ResourceFooter />}
      */}
    </div>
  )
}

export default App
