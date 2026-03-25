import './StarBorder.css';

const StarBorder = ({
  as: Component = 'div',
  className = '',
  color = 'rgba(37, 99, 235, 0.8)',
  speed = '6s',
  children,
  ...rest
}) => {
  return (
    <Component className={`star-border-container ${className}`} {...rest}>
      <div
        className="star-border-glow"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, ${color} 10%, transparent 20%, transparent 50%, ${color} 60%, transparent 70%)`,
          animationDuration: speed
        }}
      />
      <div className="star-border-inner">{children}</div>
    </Component>
  );
};

export default StarBorder;
