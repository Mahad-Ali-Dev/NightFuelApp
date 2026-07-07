import { Redirect } from 'expo-router';

// Hidden tab. A deep link to /schedule would otherwise render a blank screen,
// so redirect to the real shifts area.
export default function ScheduleTab() {
    return <Redirect href="/(shifts)" />;
}
