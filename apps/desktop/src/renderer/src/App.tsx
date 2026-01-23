import { useState, useEffect } from 'react'
import LateralBar from './components/LateralBar'
import ContainerChat from './components/ContainerChat'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'
import SettingsCard from './components/floating/SettingsCard'
import GraphInterface from './components/GraphInterface'
import TitleBar from './components/TitleBar'
import icon from './assets/icon.png'

function App(): React.JSX.Element {
  const {
    messages,
    isLoading,
    text,
    setText,
    sendMessage,
    messagesEndRef,
    graphState,
    handleGraphOption,
    closeGraph,
    openDetails
  } = useChat()
  const { statusInfo, localMode, changeMode, isUpdating } = useStatus()

  const [isChatVisible, setIsChatVisible] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [isCompact, setIsCompact] = useState(window.innerWidth < 650)

  // ... (useEffect e resto do código) ...

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      <TitleBar onOpenSettings={() => setShowSettings(true)} />
      <div className="flex-1 flex w-full min-h-0 relative">
        {!isCompact && (
          <LateralBar
            onToggleChat={() => setIsChatVisible(!isChatVisible)}
            isChatActive={isChatVisible}
          />
        )}

        <main className="flex-1 relative flex overflow-hidden">
          {/* Background Layer (Wallpaper) */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none bg-[#05080f]">
            {/* Giant Logo */}
            <img
              src={icon}
              alt="Background"
              className="w-[40vh] h-[40vh] opacity-5 grayscale filter"
            />
          </div>

          {/* Chat Layer */}
          {isChatVisible && (
            <div
              className={`relative z-10 h-full flex flex-col animate-fade-in ${isCompact ? 'w-full' : 'w-[450px] border-r border-border/20 shadow-2xl'}`}
            >
              <ContainerChat
                messages={messages}
                isLoading={isLoading}
                text={text}
                setText={setText}
                onSendMessage={sendMessage}
                messagesEndRef={messagesEndRef}
                currentMode={localMode}
                onModeChange={changeMode}
                isModeChanging={isUpdating}
                onViewDetails={openDetails}
              />
            </div>
          )}

          {/* Side Graph Panel */}
          {graphState.view === 'side' && (
            <div className="relative z-20 h-full border-l border-border bg-bg/95 backdrop-blur-sm">
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
        </main>
      </div>

      {/* Floating Interfaces */}
      {showSettings && <SettingsCard onClose={() => setShowSettings(false)} />}

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
    </div>
  )
}

export default App
