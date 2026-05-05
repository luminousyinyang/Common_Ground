export default function ViewSlider({ activeIndex, children }) {
  return (
    <div className="view-slider-viewport">
      <div
        className="view-slider-track"
        style={{ transform: `translateX(${activeIndex * -100}%)` }}
      >
        {children}
      </div>
    </div>
  );
}
