import React from 'react'
import ContainerChat from './ContainerChat'
import RemindersView from '../views/RemindersView'
import ExtensionsView from '../views/ExtensionsView'
import { useChat } from '../hooks/useChat'

import { useStatus } from '../hooks/useStatus'

interface MainViewRendererProps {
  viewName: string
  isCompact: boolean
  onOpenSettings: (tab?: any) => void
}

const VIEW_MAP: Record<string, React.ComponentType<any>> = {
  ChatDashboard: (props: any) => {
    const chat = useChat()
    const status = useStatus()
    return (
      <ContainerChat
        messages={chat.messages}
        isLoading={chat.isLoading}
        currentStatus={chat.currentStatus}
        text={chat.text}
        onSendMessage={chat.sendMessage}
        messagesEndRef={chat.messagesEndRef}
        currentMode={status.localMode}
        onModeChange={status.changeMode}
        isModeChanging={status.isUpdating}
        onReopenGraph={chat.reopenGraph}
        statusInfo={status.statusInfo}
        onOpenSettings={props.onOpenSettings}
      />
    )
  },
  RemindersDashboard: RemindersView,
  ExtensionsStore: ExtensionsView
}


export default function MainViewRenderer({ viewName, isCompact, onOpenSettings }: MainViewRendererProps) {
  const Component = VIEW_MAP[viewName]

  const isChat = viewName === 'ChatDashboard'

  return (
    <div className={`flex-1 flex min-h-0 ${isChat && !isCompact ? 'max-w-[420px] rounded-xl bg-card border border-border/10 shadow-2xl relative overflow-hidden shrink-0' : 'w-full h-full'}`}>
        <Component onOpenSettings={onOpenSettings} />
    </div>
  )
}

