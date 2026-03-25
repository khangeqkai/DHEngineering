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
    <Component
      className={`star-border-container ${className}`}
      style={{ '--star-color': color, '--star-speed': speed }}
      {...rest}
    >
      {children}
    </Component>
  );
};

export default StarBorder;
