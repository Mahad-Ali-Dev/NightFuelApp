import { Reveal } from './Reveal';

export function Stats() {
  return (
    <section className="stats">
      <div className="container">
        <div className="stat-grid">
          <Reveal className="stat glass">
            <div className="num">1.8B</div>
            <div className="lbl">Shift workers worldwide</div>
          </Reveal>
          <Reveal className="stat glass">
            <div className="num">+23%</div>
            <div className="lbl">Higher diabetes risk</div>
          </Reveal>
          <Reveal className="stat glass">
            <div className="num">2,500+</div>
            <div className="lbl">Exercises with video demos</div>
          </Reveal>
          <Reveal className="stat glass">
            <div className="num">760+</div>
            <div className="lbl">Whole foods, even offline</div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
