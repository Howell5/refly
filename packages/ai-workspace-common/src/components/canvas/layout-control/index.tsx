import React, { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { Button, Dropdown, Space, Divider, Tooltip, Modal } from 'antd';
import { LuCompass, LuLayoutDashboard, LuLightbulb, LuShipWheel } from 'react-icons/lu';
import { RiFullscreenFill } from 'react-icons/ri';
import { FiHelpCircle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { LuZoomIn, LuZoomOut } from 'react-icons/lu';
import {
  IconDocumentation,
  IconDown,
  IconMouse,
  IconTouchpad,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { useReactFlow, useOnViewportChange } from '@xyflow/react';
import { useCanvasLayout } from '@refly-packages/ai-workspace-common/hooks/canvas/use-canvas-layout';
import { TFunction } from 'i18next';

import { useCanvasStoreShallow } from '@refly-packages/ai-workspace-common/stores/canvas';
import { useNodeOperations } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-operations';
import { IconExpand, IconShrink } from '@refly-packages/ai-workspace-common/components/common/icon';

import './index.scss';
import { useUserStoreShallow } from '@refly-packages/ai-workspace-common/stores/user';

interface LayoutControlProps {
  mode: 'mouse' | 'touchpad';
  changeMode: (mode: 'mouse' | 'touchpad') => void;
}

const iconClass = 'flex items-center justify-center text-base';
const buttonClass = '!p-0 h-[30px] w-[30px] flex items-center justify-center ';

// Add interface for TooltipButton props
interface TooltipButtonProps {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

// Add interfaces for component props
interface ActionButtonsProps {
  onFitView: () => void;
  onLayout: (direction: 'TB' | 'LR') => void;
  onToggleSizeMode: () => void;
  nodeSizeMode: 'compact' | 'adaptive';
  t: TFunction;
}

interface ModeSelectorProps {
  mode: 'mouse' | 'touchpad';
  open: boolean;
  setOpen: (open: boolean) => void;
  items: any[]; // Type this according to your items structure
  onModeChange: (mode: 'mouse' | 'touchpad') => void;
  t: TFunction;
}

interface ZoomControlsProps {
  currentZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  t: TFunction;
}

// Update component definition
const TooltipButton = memo(({ tooltip, children, ...buttonProps }: TooltipButtonProps) => (
  <Tooltip title={tooltip} arrow={false}>
    <Button type="text" {...buttonProps}>
      {children}
    </Button>
  </Tooltip>
));

// Update component definitions
const ActionButtons = memo(({ onFitView, onLayout, onToggleSizeMode, nodeSizeMode, t }: ActionButtonsProps) => (
  <>
    <TooltipButton tooltip={t('canvas.toolbar.tooltip.fitView')} onClick={onFitView} className={buttonClass}>
      <RiFullscreenFill className={iconClass} size={16} />
    </TooltipButton>

    <TooltipButton tooltip={t('canvas.toolbar.tooltip.layout')} onClick={() => onLayout('LR')} className={buttonClass}>
      <LuLayoutDashboard className={iconClass} size={16} />
    </TooltipButton>

    <TooltipButton
      tooltip={nodeSizeMode === 'compact' ? t('canvas.contextMenu.adaptiveMode') : t('canvas.contextMenu.compactMode')}
      onClick={onToggleSizeMode}
      className={buttonClass}
    >
      {nodeSizeMode === 'compact' ? (
        <IconExpand className={iconClass} size={16} />
      ) : (
        <IconShrink className={iconClass} size={16} />
      )}
    </TooltipButton>
  </>
));

const ModeSelector = memo(({ mode, open, setOpen, items, onModeChange, t }: ModeSelectorProps) => (
  <Dropdown
    menu={{
      items,
      onClick: ({ key }) => onModeChange(key as 'mouse' | 'touchpad'),
      selectedKeys: [mode],
    }}
    trigger={['click']}
    open={open}
    onOpenChange={setOpen}
  >
    <Tooltip title={t('canvas.toolbar.tooltip.mode')} arrow={false}>
      <Button
        type="text"
        className="!p-0 h-[30px] w-[48px] flex items-center justify-center hover:bg-gray-100 transition-colors duration-200 group"
      >
        {mode === 'mouse' ? <IconMouse className={iconClass} /> : <IconTouchpad className={iconClass} />}
        <IconDown className={`ml-[-6px] ${iconClass} ${open ? 'rotate-180' : ''}`} />
      </Button>
    </Tooltip>
  </Dropdown>
));
ModeSelector.displayName = 'ModeSelector';

// Create a memoized zoom controls component
const ZoomControls = memo(({ currentZoom, onZoomIn, onZoomOut, canZoomIn, canZoomOut, t }: ZoomControlsProps) => (
  <>
    <TooltipButton
      tooltip={t('canvas.toolbar.tooltip.zoomOut')}
      onClick={onZoomOut}
      disabled={!canZoomOut}
      className={`${buttonClass} ${!canZoomOut ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <LuZoomOut className={iconClass} size={16} />
    </TooltipButton>

    <TooltipButton tooltip={t('canvas.toolbar.tooltip.zoom')} className={`${buttonClass} pointer-events-none mx-1.5`}>
      <div className="text-xs">{Math.round(currentZoom * 100)}%</div>
    </TooltipButton>

    <TooltipButton
      tooltip={t('canvas.toolbar.tooltip.zoomIn')}
      onClick={onZoomIn}
      disabled={!canZoomIn}
      className={`${buttonClass} ${!canZoomIn ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <LuZoomIn className={iconClass} size={16} />
    </TooltipButton>
  </>
));
ZoomControls.displayName = 'ZoomControls';

// Add new HelpModal component
const HelpModal = memo(({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width="100vw"
      style={{
        top: 0,
        paddingBottom: 0,
        maxWidth: '100vw',
      }}
      className="help-modal !p-0"
    >
      <iframe
        src="https://app.tango.us/app/embed/dee5047a-9014-4263-be2d-1e622fc615ca?skipCover=false&defaultListView=false&skipBranding=false&makeViewOnly=true&hideAuthorAndDetails=false"
        style={{
          width: '100%',
          height: 'calc(100vh)', // Account for modal header
          border: 'none',
        }}
        sandbox="allow-scripts allow-top-navigation-by-user-activation allow-popups allow-same-origin"
        security="restricted"
        title="Using Refly: A Step-by-Step Guide to Creating and Managing Content"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </Modal>
  );
});

HelpModal.displayName = 'HelpModal';

export const LayoutControl: React.FC<LayoutControlProps> = memo(({ mode, changeMode }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const { onLayout } = useCanvasLayout();
  const reactFlowInstance = useReactFlow();
  const [currentZoom, setCurrentZoom] = useState(reactFlowInstance?.getZoom() ?? 1);
  const minZoom = 0.1;
  const maxZoom = 2;
  const { setShowTourModal, setShowSettingsGuideModal } = useUserStoreShallow((state) => ({
    setShowTourModal: state.setShowTourModal,
    setShowSettingsGuideModal: state.setShowSettingsGuideModal,
  }));

  // Use ref to avoid recreating the timeout on each render
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Optimize viewport change handling
  useOnViewportChange({
    onChange: useCallback(
      ({ zoom }) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (Math.abs(zoom - currentZoom) > 0.01) {
            setCurrentZoom(zoom);
          }
        }, 100);
      },
      [currentZoom],
    ),
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    if (currentZoom < maxZoom) {
      reactFlowInstance?.zoomIn?.();
    }
  }, [currentZoom, reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    if (currentZoom > minZoom) {
      reactFlowInstance?.zoomOut?.();
    }
  }, [currentZoom, reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView();
  }, [reactFlowInstance]);

  const canZoomIn = currentZoom < maxZoom;
  const canZoomOut = currentZoom > minZoom;

  // Memoize static configurations
  const items = useMemo(
    () => [
      {
        key: 'mouse',
        label: (
          <Space>
            <IconMouse className={iconClass} />
            {t('canvas.toolbar.mouse')}
          </Space>
        ),
      },
      {
        key: 'touchpad',
        label: (
          <Space>
            <IconTouchpad className={iconClass} />
            {t('canvas.toolbar.touchpad')}
          </Space>
        ),
      },
    ],
    [t],
  );

  // Add these new hooks
  const { nodeSizeMode, setNodeSizeMode } = useCanvasStoreShallow((state) => ({
    nodeSizeMode: state.nodeSizeMode,
    setNodeSizeMode: state.setNodeSizeMode,
  }));
  const { updateAllNodesSizeMode } = useNodeOperations();

  // Add handler for size mode toggle
  const handleToggleSizeMode = useCallback(() => {
    const newMode = nodeSizeMode === 'compact' ? 'adaptive' : 'compact';
    setNodeSizeMode(newMode);
    updateAllNodesSizeMode(newMode);
  }, [nodeSizeMode, setNodeSizeMode, updateAllNodesSizeMode]);

  const helpMenuItems = useMemo(
    () => [
      {
        key: 'settings',
        icon: <LuShipWheel className={iconClass} size={14} />,
        label: <Space>{t('canvas.toolbar.openSettings')}</Space>,
        onClick: () => setShowSettingsGuideModal(true),
      },
      {
        key: 'tour',
        icon: <LuLightbulb className={iconClass} size={14} />,
        label: <Space>{t('canvas.toolbar.openTour')}</Space>,
        onClick: () => setShowTourModal(true),
      },
      {
        key: 'guide',
        icon: <LuCompass className={iconClass} size={14} />,
        label: <Space>{t('canvas.toolbar.openGuide')}</Space>,
        onClick: () => setHelpModalVisible(true),
      },
      {
        key: 'docs',
        icon: <IconDocumentation className={iconClass} size={14} />,
        label: <Space>{t('canvas.toolbar.openDocs')}</Space>,
        onClick: () => window.open('https://docs.refly.ai', '_blank'),
      },
    ],
    [t],
  );

  return (
    <>
      <div className="absolute bottom-2 left-2.5 px-1 h-[32px] border-box flex items-center justify-center bg-white rounded-md shadow-md">
        <ZoomControls
          currentZoom={currentZoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          t={t}
        />

        <Divider type="vertical" className="h-full" />

        <ActionButtons
          onFitView={handleFitView}
          onLayout={onLayout}
          onToggleSizeMode={handleToggleSizeMode}
          nodeSizeMode={nodeSizeMode}
          t={t}
        />

        <ModeSelector mode={mode} open={open} setOpen={setOpen} items={items} onModeChange={changeMode} t={t} />

        <Divider type="vertical" className="h-full mx-0.5" />

        <Dropdown menu={{ items: helpMenuItems }} trigger={['click']}>
          <Tooltip title={t('canvas.toolbar.tooltip.help')} arrow={false}>
            <Button type="text" className={buttonClass}>
              <FiHelpCircle className={iconClass} size={16} />
            </Button>
          </Tooltip>
        </Dropdown>
      </div>
      <HelpModal visible={helpModalVisible} onClose={() => setHelpModalVisible(false)} />
    </>
  );
});

// Add display name for better debugging
LayoutControl.displayName = 'LayoutControl';
