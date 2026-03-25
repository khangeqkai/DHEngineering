import ShinyText from './ShinyText';

export default function PageHeader({ title, children }) {
  return (
    <div className="page-header">
      <h1>
        {typeof title === 'string' ? <ShinyText text={title} speed={5} /> : title}
      </h1>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}
