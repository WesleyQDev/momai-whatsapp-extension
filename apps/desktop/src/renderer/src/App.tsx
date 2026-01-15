import axios from 'axios'
import { useState } from 'react'

const api = axios.create({
  baseURL: 'http://localhost:8000'
})

function App(): React.JSX.Element {
  const [text, setText] = useState('')
  const [momMessage, setMomMessage] = useState('')

  const handle_ping = async (): Promise<void> => {
    try {
      const response = await api.post('/chat', { content: text })
      setMomMessage(response.data.reply)
    } catch (error) {
      console.error('Erro', error)
      setMomMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
    <h1>MomAI</h1>
    <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={handle_ping}>
        Teste
      </button>
      <p>{momMessage}</p>
    </>
  )
}

export default App
