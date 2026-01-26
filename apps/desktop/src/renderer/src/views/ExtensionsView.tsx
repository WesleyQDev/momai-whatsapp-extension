export default function ExtensionsView() {
  const extensions = [
    {
      title: 'Spotify',
      description: 'Controle músicas, playlists e volume usando comandos de voz.',
      icon: (
        <svg className="w-8 h-8 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      ),
      category: 'Mídia',
      status: 'Planejado'
    },
    {
      title: 'Google Calendar',
      description: 'Gerencie sua agenda, crie eventos e verifique disponibilidade.',
      icon: (
        <svg className="w-8 h-8 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5v-5z" />
        </svg>
      ),
      category: 'Produtividade',
      status: 'Planejado'
    },
    {
      title: 'Home Assistant',
      description: 'Controle luzes, temperatura e dispositivos inteligentes da sua casa.',
      icon: (
        <svg className="w-8 h-8 text-[#03A9F4]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3zm5 15h-2v-6H9v6H7v-7.81l5-4.5 5 4.5V18z" />
          <path d="M7 20h10v-2H7v2z" opacity=".3" />
        </svg>
      ),
      category: 'IoT',
      status: 'Planejado'
    },
    {
      title: 'WhatsApp',
      description: 'Envie mensagens e ouça seus recados sem pegar no celular.',
      icon: (
        <svg className="w-8 h-8 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.66C16.6 3.66 20.3 7.36 20.3 11.91C20.3 16.46 16.6 20.16 12.05 20.16C10.58 20.16 9.14 19.78 7.85 19.04L7.54 18.86L4.36 19.7L5.2 16.61L5 16.29C4.22 14.94 3.8 13.43 3.8 11.91C3.81 7.36 7.51 3.66 12.05 3.66" />
        </svg>
      ),
      category: 'Social',
      status: 'Planejado'
    },
    {
      title: 'Obsidian',
      description: 'Integração com seu "Segundo Cérebro" para salvar notas e ideias.',
      icon: (
        <svg
          className="w-8 h-8 text-[#7C3AED]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
      category: 'Produtividade',
      status: 'Em Breve'
    },
    {
      title: 'Python Scripts',
      description: 'Execute seus próprios scripts locais como ferramentas da IA.',
      icon: (
        <svg
          className="w-8 h-8 text-[#FFD43B]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      category: 'Dev',
      status: 'Em Breve'
    }
  ]

  return (
    <div className="flex-1 h-full bg-bg overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-text">Extensões</h1>
          <p className="text-text-muted text-lg">
            Expanda as capacidades da MomAI conectando seus aplicativos favoritos.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full w-fit mt-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-medium text-accent">
              Loja de Extensões em Desenvolvimento
            </span>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {extensions.map((ext, i) => (
            <div
              key={i}
              className="group p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-200 flex flex-col gap-4 relative overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-xl bg-bg border border-white/5 group-hover:scale-110 transition-transform">
                  {ext.icon}
                </div>
                <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase tracking-wider font-medium text-text-muted">
                  {ext.status}
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="font-semibold text-lg text-text">{ext.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{ext.description}</p>
              </div>

              <div className="pt-2 mt-auto">
                <button
                  disabled
                  className="w-full py-2 rounded-lg border border-white/10 text-sm font-medium text-text-muted cursor-not-allowed hover:bg-white/5 transition-colors opacity-50"
                >
                  Instalar
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Call to Action for Devs */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-accent/20 to-transparent border border-accent/20 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-semibold text-text">É desenvolvedor?</h3>
            <p className="text-sm text-text-muted">
              A MomAI será totalmente extensível via Python e APIs locais.
            </p>
          </div>
          <button>
            <a
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90"
              target="_blank"
              rel="noopener noreferrer"
              href="https://wesleyydev.mintlify.app/pt-BR"
            >
              Abrir documentação
            </a>
          </button>
        </div>
      </div>
    </div>
  )
}
