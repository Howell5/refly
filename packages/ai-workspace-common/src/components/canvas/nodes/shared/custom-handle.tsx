import { Handle, Position, HandleType } from '@xyflow/react';

interface CustomHandleProps {
  type: HandleType;
  position: Position;
  isConnected: boolean;
  isNodeHovered: boolean;
  nodeType: string;
}

const canAcceptConnection = (nodeType: string, isConnected: boolean) => {
  return ['tool', 'skill'].includes(nodeType) && !isConnected;
};

export const CustomHandle = ({
  type,
  position,
  isConnected,
  isNodeHovered,
  nodeType,
}: CustomHandleProps) => {
  const baseHandleStyle = {
    width: '2px',
    height: '8px',
    background: isNodeHovered ? '#00968F' : 'transparent',
    border: 'none',
    minHeight: '8px',
    minWidth: '2px',
    borderRadius: '0px',
    opacity: isConnected && !isNodeHovered ? 1 : 0,
    top: 'auto',
    [position === Position.Left ? 'left' : 'right']: '-2px',
    transform: 'translateY(-50%)',
    zIndex: 1,
  };

  return (
    <div
      className={`
        absolute top-0 ${position === Position.Left ? 'left-0' : 'right-0'} h-full
        flex items-center
        after:content-['']
        after:absolute
        after:top-[24px]
        after:bottom-[24px]
        after:bg-[#D0D5DD]
        after:opacity-20
        ${position === Position.Left ? 'after:left-0' : 'after:right-0'}
      `}
    >
      <div className="absolute top-1/2 -translate-y-1/2">
        {/* Left handle - only show if position is left and can accept connections */}
        {position === Position.Left && (
          <Handle type={type} position={position} style={baseHandleStyle} isConnectable={false} />
        )}

        {/* Right handle - only show if position is right */}
        {position === Position.Right && (
          <Handle
            type={type}
            position={position}
            style={baseHandleStyle}
            isConnectable={canAcceptConnection(nodeType, isConnected)}
          />
        )}
      </div>
    </div>
  );
};
