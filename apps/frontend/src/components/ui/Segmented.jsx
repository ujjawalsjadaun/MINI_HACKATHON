// A row of toggle buttons where one is on, used for tabs and filter chips.
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={`seg-btn${o.value === value ? ' on' : ''}`} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <><span aria-hidden="true">{o.icon}</span>{' '}</>}{o.text}
        </button>
      ))}
    </div>
  );
}
