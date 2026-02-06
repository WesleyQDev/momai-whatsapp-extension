import React, { useEffect, useState } from 'react'
import GraphInterface from '../components/GraphInterface'

export default function OverlayView() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    // Force transparency on body/html to ensure the overlay background works
    document.documentElement.style.backgroundColor = 'transparent'
    document.body.style.backgroundColor = 'transparent'

    // Escuta evento do processo main para receber dados para exibir
    // @ts-ignore
    const removeListener = window.electron.ipcRenderer.on(
      'update-overlay-content',
      (_, contentData) => {
        setData(contentData)
      }
    )

    // Avisa que está pronto
    // @ts-ignore
    window.electron.ipcRenderer.send('overlay-ready')

    return () => {
      removeListener()
    }
  }, [])

  const handleClose = () => {
    // @ts-ignore
    window.electron.ipcRenderer.send('close-overlay')
  }

  const handleOption = (val: string) => {
    // @ts-ignore
    window.electron.ipcRenderer.send('overlay-action', val)
  }

  if (!data) return <div className="w-screen h-screen bg-transparent"></div>

  return (
    <div className="w-screen h-screen flex justify-end items-start p-4 bg-transparent">
      {/* Reuse existing component but force specific styles via wrapper or props if needed */}
      <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden shadow-2xl max-h-[80vh] w-[400px]">
        {/* We reconstruct the content manually or wrap GraphInterface if possible. 
                 GraphInterface has specific layout logic ('side' / 'center'). 
                 Let's extract the internals or just mock it here for simplicity/transparency. 
                 Or better, pass 'side' to GraphInterface but override container styles?
                 GraphInterface has a rigid div wrapper. Let's replicate the structure cleanly here.
             */}
        <GraphInterface
          view="side"
          content={data.content}
          options={data.options}
          uiSchema={data.uiSchema}
          onOptionSelect={handleOption}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
