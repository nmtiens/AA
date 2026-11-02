export const CompactStatCard = ({
  title,
  value,
  icon,
  bg,
  borderColor,
  textColor,
  isParent = false
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  borderColor: string;
  textColor: string;
  isParent?: boolean;
}) => (
  <div className={`${bg} rounded-lg p-3 border ${borderColor} flex flex-col justify-between h-full`}>
    <div className="flex justify-between items-start mb-2">
      <span className={`text-sm font-semibold ${textColor} tracking-wide`}>{title}</span>
      {icon}
    </div>
    <div className={`font-bold tabular-nums ${isParent ? 'text-2xl' : 'text-xl'} ${textColor}`}>
      {value}
    </div>
  </div>
);