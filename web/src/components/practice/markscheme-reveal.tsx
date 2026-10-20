export function MarkschemeReveal({
  text,
  pages,
  open,
  onToggle,
}: {
  text: string;
  pages: readonly number[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="markscheme-reveal" aria-labelledby="markscheme-reveal-title">
      <div className="markscheme-reveal-heading">
        <div>
          <p className="eyebrow">Official source</p>
          <h2 id="markscheme-reveal-title">Official markscheme</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onToggle} aria-expanded={open}>
          {open ? "Hide markscheme" : "Reveal markscheme"}
        </button>
      </div>
      {open && (
        <div className="markscheme-reveal-content">
          <p className="field-help">Matching markscheme page{pages.length === 1 ? "" : "s"}: {pages.join(", ")}</p>
          <p>{text}</p>
        </div>
      )}
    </section>
  );
}
