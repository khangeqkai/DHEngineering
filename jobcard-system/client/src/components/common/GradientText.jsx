import './GradientText.css';

const GradientText = ({
  children,
  className = '',
  colors = ['#2563eb', '#60a5fa', '#2563eb'],
  animationSpeed = 6
}) => {
  const gradientColors = colors.join(', ');

  return (
    <span
      className={`gradient-text ${className}`}
      style={{
        backgroundImage: `linear-gradient(to right, ${gradientColors})`,
        animationDuration: `${animationSpeed}s`
      }}
    >
      {children}
    </span>
  );
};

export default GradientText;
