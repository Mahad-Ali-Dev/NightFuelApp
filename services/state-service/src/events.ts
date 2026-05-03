import { EventBus } from '@nightfuel/events';
import { Channels } from '@nightfuel/types';
import { StateMaterializer } from './materializer';

export async function setupEventSubscribers(eventBus: EventBus, materializer: StateMaterializer) {
    eventBus.subscribe(Channels.Meal.MealLogged, async (event: any) => {
        await materializer.handleMealLogged(event);
    });

    eventBus.subscribe(Channels.Sleep.SessionLogged, async (event: any) => {
        await materializer.handleSleepLogged(event);
    });

    eventBus.subscribe(Channels.Progress.MetricsLogged, async (event: any) => {
        await materializer.handleMetricsLogged(event);
    });

    eventBus.subscribe(Channels.Plan.PlanGenerated, async (event: any) => {
        await materializer.handlePlanGenerated(event);
    });

    eventBus.subscribe(Channels.Progress.CycleAdvanced, async (event: any) => {
        await materializer.handleCycleAdvanced(event);
    });
}
