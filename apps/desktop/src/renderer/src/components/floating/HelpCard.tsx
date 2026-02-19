import FloatingCard from './FloatingCard'

interface HelpCardProps {
  onClose: () => void
}

export default function HelpCard({ onClose }: HelpCardProps) {
  const helpItems = [
    {
      title: 'Como usar o chat',
      content:
        'Digite suas mensagens na caixa de texto e pressione Enter ou clique no botão de enviar para conversar com a IA.'
    },
    {
      title: 'Extensões',
      content:
        'Acesse a loja de extensões para adicionar novas funcionalidades à MomAI. Cada extensão pode adicionar agentes, ferramentas ou integrações.'
    },
    {
      title: 'Notas',
      content:
        'Use o recurso de notas para salvar informações importantes. As notas são salvas localmente no seu dispositivo.'
    },
    {
      title: 'Lembretes',
      content:
        'Crie lembretes para não esquecer de tarefas importantes. Você pode agendar lembretes para datas e horários específicos.'
    },
    {
      title: 'Configurações',
      content:
        'Acesse as configurações para personalizar a MomAI. Você pode ajustar o cérebro da IA, voz, economia de recursos e preferências de atualizações.'
    },
    {
      title: 'Atalhos de Teclado',
      content:
        'Ctrl+Enter: Enviar mensagem | Ctrl+N: Novo chat | Ctrl+L: Limpar histórico | Ctrl+S: Abrir configurações'
    }
  ]

  return (
    <FloatingCard title="Ajuda" onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
        {helpItems.map((item, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/5 border border-white/5"
          >
            <h4 className="text-sm font-semibold text-text">{item.title}</h4>
            <p className="text-xs text-text-muted leading-relaxed">{item.content}</p>
          </div>
        ))}
      </div>
    </FloatingCard>
  )
}
