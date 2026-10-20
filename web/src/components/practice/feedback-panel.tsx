import type { FeedbackResult } from "../../lib/ai/contracts";

export function FeedbackPanel({ feedback }: { feedback: FeedbackResult }) {
  return (
    <section className="feedback-panel" aria-labelledby="feedback-panel-title">
      <div className="feedback-panel-heading">
        <div>
          <p className="eyebrow">Local AI feedback</p>
          <h2 id="feedback-panel-title">Compare with the markscheme</h2>
        </div>
        <span className="provisional-badge">Provisional · not an official mark</span>
      </div>
      <div className="feedback-points-grid">
        <div>
          <h3>Points supported</h3>
          {feedback.creditedPoints.length > 0
            ? <ul>{feedback.creditedPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul>
            : <p>No markscheme point was clearly identified.</p>}
        </div>
        <div>
          <h3>Points to add</h3>
          {feedback.missingPoints.length > 0
            ? <ul>{feedback.missingPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul>
            : <p>No additional point was identified by the model.</p>}
        </div>
      </div>
      <div className="feedback-explanation">
        <h3>Explanation</h3>
        <p>{feedback.explanation}</p>
      </div>
      {feedback.uncertainty.length > 0 && (
        <div className="feedback-uncertainty">
          <h3>Check these carefully</h3>
          <ul>{feedback.uncertainty.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
