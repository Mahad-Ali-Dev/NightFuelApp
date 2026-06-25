import { Reveal } from './Reveal';

export function Problem() {
  return (
    <section className="problem" id="problem">
      <div className="container">
        <Reveal className="glass">
          <div>
            <h2>The same meal at 2 PM and 2 AM isn&apos;t the same meal.</h2>
            <p>
              Eating against your body clock changes how you process food — that&apos;s why
              standard meal planners quietly fail shift workers. The higher health risks
              aren&apos;t a willpower problem. They&apos;re a <strong>timing</strong> problem.
            </p>
            <p>
              Zeitra is the only app that schedules everything around <em>your</em> sleep window
              instead of a sunrise you never see.
            </p>
          </div>
          <div className="vs">
            <div className="vs-row good">
              <span className="clock">2 PM</span>
              <span>Daytime metabolism — insulin response is primed, fuel is used well.</span>
            </div>
            <div className="vs-row bad">
              <span className="clock">2 AM</span>
              <span>
                Circadian low — the same carbs spike higher and store more. Timing matters.
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
