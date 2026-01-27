import React from 'react'

export interface UIComponent {
  type: 'container' | 'text' | 'button' | 'input' | 'list'
  props?: Record<string, any>
  children?: UIComponent[]
}

interface DynamicRendererProps {
  schema: UIComponent
  onAction: (actionId: string, value?: any) => void
}

export function DynamicRenderer({ schema, onAction }: DynamicRendererProps) {
  const { type, props = {}, children = [] } = schema

  const renderChild = (child: UIComponent, index: number) => (
    <DynamicRenderer key={index} schema={child} onAction={onAction} />
  )

  switch (type) {
    case 'container':
      return (
        <div className={`flex flex-col gap-4 ${props.className || ''}`} style={props.style}>
          {children.map(renderChild)}
        </div>
      )
    case 'text':
      return (
        <p className={`text-text ${props.className || ''}`} style={props.style}>
          {props.text}
        </p>
      )
    case 'button':
      return (
        <button
          className={`px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-all ${props.className || ''}`}
          onClick={() => onAction(props.actionId || 'click', props.value)}
          style={props.style}
        >
          {props.label}
        </button>
      )
    default:
      return null
  }
}
