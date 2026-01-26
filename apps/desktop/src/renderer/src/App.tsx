import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import ContainerChat from './components/ContainerChat'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import SplashScreen from './components/floating/SplashScreen'
import UpdateToast from './components/floating/UpdateToast'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import RemindersView from './views/RemindersView'
import RemindersSidebar from './components/chat/RemindersSidebar'
import ExtensionsView from './views/ExtensionsView'
import ResourceFooter from './components/ResourceFooter'
import ConfirmationCard from './components/floating/ConfirmationCard'
import logo from './assets/icon.png'

function App(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  const {
    messages,
    isLoading,
    currentStatus,
    text,
    sendMessage,
    messagesEndRef,
    graphState,
    handleGraphOption,
    closeGraph,
    reopenGraph,
    clearHistory
  } = useChat()

  const { localMode, changeMode, isUpdating, statusInfo, isOnline, hasUpdate } = useStatus()

  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'brain' | 'voice'>('general')
  const [isCompact, setIsCompact] = useState(window.innerWidth < 850)

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
    // Theme Initialization
    const savedTheme = localStorage.getItem('momai_theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)

    const handleResize = () => setIsCompact(window.innerWidth < 850)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
          {/* Background Layer - Subtle Gradient/Pattern */}
          <div className="absolute inset-0 z-0 bg-bg">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-bg to-bg" />
          </div>

          <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden bg-transparent">
            <Routes>
              <Route
                path="/"
                element={
                  <div
                    className={`w-full h-full flex ${isCompact ? 'flex-col' : 'flex-row p-6 gap-6 justify-center'}`}
                  >
                    {/* 1. Chat Container (Always visible, narrow width) */}
                    <div
                      className={`flex flex-col min-w-0 transition-all duration-500 
                        ${
                          isCompact
                            ? 'w-full h-full'
                            : 'w-full max-w-[420px] shrink-0 rounded-xl bg-card border border-border/10 shadow-2xl relative overflow-hidden'
                        }`}
                    >
                      <ContainerChat
                        messages={messages}
                        isLoading={isLoading}
                        currentStatus={currentStatus}
                        text={text}
                        onSendMessage={sendMessage}
                        messagesEndRef={messagesEndRef}
                        currentMode={localMode}
                        onModeChange={changeMode}
                        isModeChanging={isUpdating}
                        onReopenGraph={reopenGraph}
                        statusInfo={statusInfo}
                        onOpenSettings={openSettings}
                      />
                    </div>

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

                    {/* 3. Desktop Sidebar (Right Side - Always Visible) */}
                    {!isCompact && (
                      <div className="w-[320px] flex flex-col gap-6 h-full shrink-0">
                        {/* Logo Area */}
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

                        {/* Floating Reminders Card */}
                        <div className="flex-1 rounded-xl bg-card border border-border/10 shadow-2xl overflow-hidden relative flex flex-col">
                          <RemindersSidebar />
                        </div>
                      </div>
                    )}
                  </div>
                }
              />

              <Route path="/reminders" element={<RemindersView />} />
              <Route path="/extensions" element={<ExtensionsView />} />
            </Routes>
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
      <SplashScreen isReady={isOnline} status={localMode} />

      {/* Update Notification */}
      {hasUpdate && !showSettings && (
        <UpdateToast
          installedVersion={statusInfo?.setup.installed_version}
          latestVersion={statusInfo?.setup.latest_version}
          onOpenSettings={openSettings}
        />
      )}

      {!isCompact && <ResourceFooter />}
    </div>
  )
}

export default App
