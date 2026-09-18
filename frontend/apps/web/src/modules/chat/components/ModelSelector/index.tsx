import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bot, Check, ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  fetchAvailableModels,
  type ModelItem,
} from '@/modules/chat/services/modelsApi';

import styles from './index.module.css';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  antigravity: 'Anthropic / Google',
  moonshot: 'Moonshot (Kimi)',
  xai: 'xAI (Grok)',
};

export function ModelSelector({
  selectedModel,
  onSelectModel,
  disabled = false,
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelItem[]>([]);

  useEffect(() => {
    void fetchAvailableModels().then((data) => {
      if (data && data.length > 0) setModels(data);
    });
  }, []);

  // 按照 owned_by 分组
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelItem[]> = {};
    for (const model of models) {
      const provider = model.owned_by || 'other';
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }
    return groups;
  }, [models]);

  const currentLabel = selectedModel || '选择模型';

  return (
    <div className={styles.container}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <button
            type="button"
            className={styles.trigger}
            disabled={disabled}
            title={disabled ? '任务运行中，不可切换模型' : `当前模型: ${currentLabel}`}
          >
            <Bot size={14} className={styles.modelIcon} />
            <span className={styles.modelName}>{currentLabel}</span>
            <ChevronDown size={13} className={styles.chevron} />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" className={styles.menuContent} sideOffset={8}>
            {Object.entries(groupedModels).map(([provider, providerModels], groupIndex) => (
              <div key={provider}>
                {groupIndex > 0 && <div className={styles.separator} />}
                <div className={styles.groupLabel}>
                  <span>{PROVIDER_NAMES[provider] || provider}</span>
                  <small>({providerModels.length})</small>
                </div>
                {providerModels.map((item) => {
                  const isSelected = item.id === selectedModel;
                  return (
                    <DropdownMenu.Item
                      key={item.id}
                      className={`${styles.item} ${isSelected ? styles.itemActive : ''}`}
                      onSelect={() => onSelectModel(item.id)}
                    >
                      <div className={styles.itemLeft}>
                        <Sparkles size={13} opacity={0.7} />
                        <span className={styles.itemModelName}>{item.id}</span>
                      </div>
                      {isSelected && <Check size={14} className={styles.checkIcon} />}
                    </DropdownMenu.Item>
                  );
                })}
              </div>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
