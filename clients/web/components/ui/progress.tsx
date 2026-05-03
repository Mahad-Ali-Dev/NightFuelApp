import { cn } from '@/lib/utils';

interface ProgressProps {
    value: number;
    className?: string;
    colorClass?: string;
}

export function Progress({ value, className, colorClass = 'bg-brand-500' }: ProgressProps) {
    const clamped = Math.min(Math.max(value, 0), 100);
    return (
        <div className={cn('w-full overflow-hidden rounded-full bg-white/10', className)}>
            <div
                className={cn('h-full rounded-full transition-all duration-500', colorClass)}
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
}
