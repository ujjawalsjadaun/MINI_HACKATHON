import { Link } from 'react-router-dom';

export default function EmptyState({ title, text, link }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      {link && <Link className="button" to={link.to}>{link.text}</Link>}
    </div>
  );
}
