import React from 'react'
import ContainerChat from './ContainerChat'
import RemindersView from '../views/RemindersView'
import ExtensionsView from '../views/ExtensionsView'
import DynamicDashboard from './DynamicDashboard'
import { useStatus } from '../hooks/useStatus'

interface MainViewRendererProps {
  viewName: string
  isCompact: boolean
  onOpenSettings: (tab?: any) => void
  extensionData?: any
  chat: any // Chat instance from App
}

const VIEW_MAP: Record<string, React.ComponentType<any>> = {
  ChatDashboard: (props: any) => {
    const status = useStatus()
    return (
      <ContainerChat
        messages={props.chat.messages}
        isLoading={props.chat.isLoading}
        text={props.chat.text}
        onSendMessage={props.chat.sendMessage}
        messagesEndRef={props.chat.messagesEndRef}
        currentMode={status.localMode}
        onModeChange={status.changeMode}
        isModeChanging={status.isUpdating}
        onReopenGraph={props.chat.reopenGraph}
        statusInfo={status.statusInfo}
        onOpenSettings={props.onOpenSettings}
      />
    )
  },
  RemindersDashboard: RemindersView,
  ExtensionsStore: ExtensionsView,
  DynamicDashboard: DynamicDashboard
}

export default function MainViewRenderer({
  viewName,
  isCompact,
  onOpenSettings,
  extensionData,
  chat
}: MainViewRendererProps) {
  const Component =
    VIEW_MAP[viewName] || (extensionData?.features?.ui_schema ? DynamicDashboard : null)

  const isChat = viewName === 'ChatDashboard'

  if (!Component) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        View not found: {viewName}
      </div>
    )
  }

  return (
    <div
      className={`flex-1 flex min-h-0 ${isChat && !isCompact ? 'max-w-[420px] rounded-xl bg-card border border-border/10 shadow-2xl relative overflow-hidden shrink-0' : 'w-full h-full'}`}
    >
      <Component
        onOpenSettings={onOpenSettings}
        schema={extensionData?.features?.ui_schema}
        title={extensionData?.name}
        description={extensionData?.description}
        extensionId={extensionData?.id}
        chat={chat}
      />
    </div>
  )
}
