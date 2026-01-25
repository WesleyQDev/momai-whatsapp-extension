import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import LateralBar from './components/LateralBar'
import ContainerChat from './components/ContainerChat'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import SplashScreen from './components/floating/SplashScreen'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import icon from './assets/icon.png'
import RemindersView from './views/RemindersView'
import RemindersSidebar from './components/chat/RemindersSidebar'
import ExtensionsView from './views/ExtensionsView'
import ResourceFooter from './components/ResourceFooter'
import ConfirmationCard from './components/floating/ConfirmationCard'

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
  const { localMode, changeMode, isUpdating, statusInfo, isOnline } = useStatus()

  const [showSettings, setShowSettings] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'brain' | 'voice'>('general')
  const [isCompact, setIsCompact] = useState(window.innerWidth < 650)

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
    const handleResize = () => setIsCompact(window.innerWidth < 650)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <TitleBar onClearHistory={triggerClearHistory} activeRoute={location.pathname} />

      <div className="flex-1 flex w-full min-h-0 relative mt-2">
        {!isCompact && (
          <LateralBar
            activeRoute={location.pathname}
            onNavigate={(path) => navigate(path)}
            onOpenSettings={() => openSettings('general')}
          />
        )}

        <main className="flex-1 relative flex overflow-hidden">
          {/* Background Layer (Wallpaper) */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none bg-[#05080f]">
            <img
              src={icon}
              alt="Background"
              className="w-[40vh] h-[40vh] opacity-5 grayscale filter"
            />
          </div>

          <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden justify-center bg-bg">
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <div
                      className={`h-full flex flex-col min-w-0 transition-all duration-500 ${isCompact ? 'w-full' : 'w-full max-w-[900px] px-4'}`}
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

                    {/* Side Graph Panel */}
                    {graphState.view === 'side' && !isCompact && (
                      <div className="relative z-20 h-full border-l border-white/5 bg-bg/95 backdrop-blur-sm shadow-2xl w-full max-w-[450px]">
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

                    {!isCompact && graphState.view !== 'side' && <RemindersSidebar />}
                  </>
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

      {/* SplashScreen - Funcional e elegante */}
      <SplashScreen isReady={isOnline} status={localMode} />

      <ResourceFooter />
    </div>
  )
}

export default App
