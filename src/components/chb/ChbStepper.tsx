import { ChbStep } from '@/types/chb';
import { Check } from 'lucide-react';

interface ChbStepperProps {
  steps: ChbStep[];
  activeStep: number;
  onStepClick: (stepId: number) => void;
}

export function ChbStepper({ steps, activeStep, onStepClick }: ChbStepperProps) {
  return (
    <div className="flex items-center justify-between w-full px-4 py-6">
      {steps.map((step, index) => {
        const isCompleted = step.status === 'completed';
        const isCurrent = step.id === activeStep;
        const isPending = step.status === 'pending' && step.id !== activeStep;
        
        return (
          <div key={step.id} className="flex items-center flex-1">
            <button
              onClick={() => onStepClick(step.id)}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-300
                  ${isCompleted 
                    ? 'bg-amber-500 text-black' 
                    : isCurrent 
                      ? 'border-2 border-amber-500 bg-black/50 text-amber-500' 
                      : 'border-2 border-white/20 bg-black/30 text-white/40'
                  }
                  group-hover:scale-110
                `}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : step.id}
              </div>
              <span
                className={`
                  text-xs font-medium text-center whitespace-nowrap
                  ${isCurrent ? 'text-amber-500' : isCompleted ? 'text-white/80' : 'text-white/40'}
                `}
              >
                {step.label}
              </span>
            </button>
            
            {index < steps.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-4
                  ${isCompleted ? 'bg-amber-500' : 'bg-white/20'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
