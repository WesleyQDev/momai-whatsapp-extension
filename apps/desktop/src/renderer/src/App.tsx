import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import SplashScreen from './components/floating/SplashScreen'
import UpdateToast from './components/floating/UpdateToast'
import FortScriptToast from './components/floating/FortScriptToast'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import RemindersSidebar from './components/chat/RemindersSidebar'
import ResourceFooter from './components/ResourceFooter'
import ConfirmationCard from './components/floating/ConfirmationCard'
import logo from './assets/icon.png'

import MainViewRenderer from './components/MainViewRenderer'
import { fetchExtensions } from './services/api'

function App(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  const chat = useChat()
  const { graphState, handleGraphOption, closeGraph, clearHistory } = chat

  const { localMode, statusInfo, hasUpdate, initMessage, initProgress, initVersion, isReady } =
    useStatus()

  // Notifica o Electron quando o sistema está pronto para redimensionar a janela
  useEffect(() => {
    if (isReady) {
      window.electron.ipcRenderer.send('app-ready')
    }
  }, [isReady])

  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'brain' | 'voice'>('general')
  const [isCompact, setIsCompact] = useState(window.innerWidth < 850)
  const [extensions, setExtensions] = useState<any[]>([])

  const openSettings = (tab: 'general' | 'brain' | 'voice' = 'general') => {
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

  useEffect(() => {
    const savedTheme = localStorage.getItem('momai_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)

    const handleResize = () => setIsCompact(window.innerWidth < 850)
    window.addEventListener('resize', handleResize)

    // Delay inicial para carregar extensões (espera backend)
    const loadExtensions = async () => {
      try {
        const exts = await fetchExtensions()
        setExtensions(exts)
      } catch {
        // Retry silencioso após 2s
        setTimeout(async () => {
          try {
            const exts = await fetchExtensions()
            setExtensions(exts)
          } catch {
            // Silent fail - não é crítico
          }
        }, 2000)
      }
    }

    setTimeout(loadExtensions, 1500)

    const handleSync = (e: any) => setExtensions(e.detail)
    window.addEventListener('momai_extensions_sync', handleSync)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('momai_extensions_sync', handleSync)
    }
  }, [])

  const currentExtension =
    location.pathname === '/'
      ? extensions.find((e) => e.features.agent_name === 'responder')
      : extensions.find((e) => location.pathname.includes(e.id))

  let uiView = currentExtension?.features?.ui_view || 'ChatDashboard'
  if (location.pathname === '/extensions') {
    uiView = 'ExtensionsStore'
  }

  const isChat = uiView === 'ChatDashboard'

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <TitleBar onClearHistory={triggerClearHistory} activeRoute={location.pathname} />

      <div className="flex-1 flex w-full min-h-0 relative">
        {!isCompact && (
          <LateralBar
            activeRoute={location.pathname}
            onNavigate={(path) => navigate(path)}
            onOpenSettings={() => openSettings('general')}
          />
        )}

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
              />

              {/* 2. Graph Panel (Middle Column - Conditional) */}
              {graphState.view === 'side' && !isCompact && (
                <div className="flex-1 min-w-[400px] max-w-[800px] rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative">
                  <GraphInterface
                    view="side"
                    content={graphState.content}
                    options={graphState.options}
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
                    <span className="text-text/20 text-xs font-medium tracking-[0.3em] uppercase mt-2">
                      Personal Assistant
                    </span>
                  </div>

                  <div className="flex-1 rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative flex flex-col">
                    <RemindersSidebar />
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
          uiSchema={graphState.uiSchema}
          onOptionSelect={handleGraphOption}
          onClose={closeGraph}
        />
      )}

      {/* SplashScreen */}
      <SplashScreen
        isFullyReady={isReady}
        status={localMode}
        statusInfo={statusInfo}
        initMessage={initMessage}
        initProgress={initProgress}
        initVersion={initVersion}
      />

      {/* Update Notification */}
      {hasUpdate && !showSettings && (
        <UpdateToast
          installedVersion={statusInfo?.setup.installed_version}
          latestVersion={statusInfo?.setup.latest_version}
          onOpenSettings={openSettings}
        />
      )}

      <FortScriptToast />

      {!isCompact && <ResourceFooter />}
    </div>
  )
}

export default App
