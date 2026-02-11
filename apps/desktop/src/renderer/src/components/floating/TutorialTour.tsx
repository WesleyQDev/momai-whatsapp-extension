import { useState, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import { useI18n } from '../../i18n'
import { useNavigate } from 'react-router-dom'

interface TutorialTourProps {
  onFinish: () => void
}

interface Step {
  targetId: string
  titleKey: string
  bodyKey: string
  route?: string
}

export default function TutorialTour({ onFinish }: TutorialTourProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)

  const steps: Step[] = [
    {
      targetId: 'tutorial-notes',
      titleKey: 'tutorial.notes.title',
      bodyKey: 'tutorial.notes.body',
      route: '/notes'
    },
    {
      targetId: 'tutorial-chat',
      titleKey: 'tutorial.chat.title',
      bodyKey: 'tutorial.chat.body',
      route: '/'
    },
    {
      targetId: 'tutorial-capabilities',
      titleKey: 'tutorial.chat.title',
      bodyKey: 'tutorial.chat.body',
      route: '/'
    },
    {
      targetId: 'tutorial-agenda',
      titleKey: 'tutorial.agenda.title',
      bodyKey: 'tutorial.agenda.body',
      route: '/'
    },
    {
      targetId: 'tutorial-store',
      titleKey: 'tutorial.extensions.title',
      bodyKey: 'tutorial.extensions.body',
      route: '/extensions'
    }
  ]

  const updateSpotlight = useCallback(() => {
    const step = steps[currentStep]
    if (!step) return

    const el = document.getElementById(step.targetId)
    if (el) {
      setSpotlightRect(el.getBoundingClientRect())
    } else {
      setSpotlightRect(null)
    }
  }, [currentStep, steps])

  useEffect(() => {
    const step = steps[currentStep]
    if (step?.route) {
      navigate(step.route)
    }
    
    const timer = setTimeout(updateSpotlight, 400)
    return () => clearTimeout(timer)
  }, [currentStep, navigate, updateSpotlight, steps])

  useEffect(() => {
    window.addEventListener('resize', updateSpotlight)
    return () => window.removeEventListener('resize', updateSpotlight)
  }, [updateSpotlight])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleComplete = async () => {
    try {
      await api.patch('/settings', { tutorial_completed: true })
      onFinish()
    } catch (error) {
      console.error('Erro ao completar tutorial:', error)
      onFinish()
    }
  }

  if (!steps[currentStep]) return null

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none select-none overflow-hidden">
      {/* Refined Dynamic Overlay (Balanced focus) */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px] transition-all duration-500 ease-in-out"
        style={{
          clipPath: spotlightRect 
            ? `polygon(0% 0%, 0% 100%, ${spotlightRect.left - 3}px 100%, ${spotlightRect.left - 3}px ${spotlightRect.top - 3}px, ${spotlightRect.right + 3}px ${spotlightRect.top - 3}px, ${spotlightRect.right + 3}px ${spotlightRect.bottom + 3}px, ${spotlightRect.left - 3}px ${spotlightRect.bottom + 3}px, ${spotlightRect.left - 3}px 100%, 100% 100%, 100% 0%)`
            : 'none'
        }}
      >
        {/* Sharper Spotlight Frame (Fixing bugged light) */}
        {spotlightRect && (
          <div 
            className="absolute border-2 border-accent/40 rounded-xl transition-all duration-500 ease-in-out shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)]"
            style={{
              left: spotlightRect.left - 6,
              top: spotlightRect.top - 6,
              width: spotlightRect.width + 12,
              height: spotlightRect.height + 12
            }}
          />
        )}
      </div>

      {/* Floating Instruction Card - Sharp & High Contrast */}
      {spotlightRect && (
        <div 
          className="absolute z-[310] pointer-events-auto bg-card border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-xl p-6 w-[320px] animate-fade-in duration-300"
          style={{
            left: Math.min(window.innerWidth - 340, Math.max(20, spotlightRect.left + spotlightRect.width / 2 - 160)),
            top: spotlightRect.bottom + 30 > window.innerHeight - 250 
              ? spotlightRect.top - 240 
              : spotlightRect.bottom + 30
          }}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent/80">MomAI Guide</span>
              </div>
              <h3 className="text-lg font-black text-text uppercase tracking-tight">
                {t(steps[currentStep].titleKey)}
              </h3>
              <p className="text-[12px] text-text-muted leading-relaxed font-semibold">
                {t(steps[currentStep].bodyKey)}
              </p>
            </div>

            <div className="flex items-center justify-between pt-5 border-t border-white/5">
              <button 
                onClick={handleComplete}
                className="text-[9px] font-bold uppercase text-text-muted/60 hover:text-text transition-colors tracking-widest"
              >
                {t('tutorial.skip')}
              </button>
              
              <div className="flex items-center gap-5">
                <span className="text-[9px] font-bold text-text-muted/30 tracking-widest">
                  {currentStep + 1} / {steps.length}
                </span>
                <button 
                  onClick={handleNext}
                  className="px-6 py-2.5 bg-accent text-white text-[10px] font-black uppercase rounded-lg hover:bg-accent/80 transition-all shadow-xl shadow-accent/20"
                >
                  {currentStep === steps.length - 1 ? t('tutorial.finish') : t('tutorial.next')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
