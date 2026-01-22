import LateralBar from './components/LateralBar'
import ContainerChat from './components/ContainerChat'
import Status from './components/Status'
import { useChat } from './hooks/useChat'
import { useStatus } from './hooks/useStatus'

function App(): React.JSX.Element {
  const { text, setText, messages, isLoading, sendMessage, messagesEndRef } = useChat()
  const { statusInfo, localMode, changeMode, isUpdating } = useStatus()

  return (
    <div className="h-full flex">
      <div className="flex w-full gap-5">
        <LateralBar />
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
        />
        <Status statusInfo={statusInfo} />
      </div>
    </div>
  )
}

export default App
