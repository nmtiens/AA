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
  <div className={`${bg} rounded-lg p-3 border ${borderColor} flex flex-col justify-between h-full ${isParent ? 'shadow-sm' : ''}`}>
    <div className="flex justify-between items-start mb-2">
      <span className={`text-[10px] font-bold ${textColor} uppercase tracking-wider`}>{title}</span>
      {icon}
    </div>
    <div className={`font-bold ${isParent ? 'text-xl' : 'text-lg'} ${textColor}`}>
      {value}
    </div>
  </div>
);