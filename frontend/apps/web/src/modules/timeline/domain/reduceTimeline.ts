import { requireEventId, type TimelineEvent } from '@/modules/timeline/domain/normalizeEvent';
import type { TimelineItem, TimelineSnapshot } from '@/modules/timeline/types';

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function replaceItem(
  items: TimelineItem[],
  itemId: string,
  update: (item: TimelineItem) => TimelineItem,
): TimelineItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error(`时间线目标不存在：${itemId}`);
  return [...items.slice(0, index), update(items[index]), ...items.slice(index + 1)];
}

function errorItem(event: TimelineEvent, message: string): TimelineItem {
  return {
    id: text(event.data.item_id, `${event.run_id}:error:${event.sequence}`),
    kind: 'error',
    run_id: event.run_id,
    sequence: event.sequence,
    status: 'failed',
    message,
  };
}

function failUnfinishedItem(item: TimelineItem, runId: string): TimelineItem {
  if (item.run_id !== runId) return item;
  if (!['streaming', 'running', 'awaiting_approval'].includes(item.status)) return item;
  return { ...item, status: 'failed' };
}

export function reduceTimeline(snapshot: TimelineSnapshot, event: TimelineEvent): TimelineSnapshot {
  let items = snapshot.items;

  switch (event.event) {
    case 'message.started': {
      const id = requireEventId(event, 'item_id');
      const logicalMessageId = requireEventId(event, 'message_id');
      items = items.map((item) =>
        item.kind === 'message' && item.logical_message_id === logicalMessageId
          ? { ...item, terminal_segment: false }
          : item,
      );
      if (!items.some((item) => item.id === id))
        items = [
          ...items,
          {
            id,
            kind: 'message',
            run_id: event.run_id,
            sequence: event.sequence,
            logical_message_id: logicalMessageId,
            role: event.data.role === 'user' ? 'user' : 'assistant',
            content: '',
            status: 'streaming',
            terminal_segment: true,
          },
        ];
      break;
    }
    case 'message.delta': {
      const id = requireEventId(event, 'item_id');
      items = replaceItem(items, id, (item) => {
        if (item.kind !== 'message') throw new Error('message.delta 目标类型错误');
        return { ...item, content: item.content + text(event.data.content) };
      });
      break;
    }
    case 'message.completed': {
      const id = requireEventId(event, 'item_id');
      items = replaceItem(items, id, (item) => {
        if (item.kind !== 'message') throw new Error('message.completed 目标类型错误');
        return { ...item, status: 'completed', terminal_segment: true };
      });
      break;
    }
    case 'reasoning.delta': {
      const id = requireEventId(event, 'item_id');
      const existing = items.find((item) => item.id === id);
      items = existing
        ? replaceItem(items, id, (item) => {
            if (item.kind !== 'reasoning') throw new Error('reasoning.delta 目标类型错误');
            return { ...item, content: item.content + text(event.data.content) };
          })
        : [
            ...items,
            {
              id,
              kind: 'reasoning',
              run_id: event.run_id,
              sequence: event.sequence,
              content: text(event.data.content),
              status: 'streaming',
            },
          ];
      break;
    }
    case 'reasoning.completed': {
      const id = requireEventId(event, 'item_id');
      items = replaceItem(items, id, (item) => {
        if (item.kind !== 'reasoning') throw new Error('reasoning.completed 目标类型错误');
        return { ...item, status: 'completed' };
      });
      break;
    }
    case 'tool.call': {
      const id = requireEventId(event, 'tool_call_id');
      const toolItem: TimelineItem = {
        id,
        kind: 'tool',
        run_id: event.run_id,
        sequence: event.sequence,
        tool: text(event.data.tool, 'tool'),
        arguments:
          typeof event.data.arguments === 'object' && event.data.arguments !== null
            ? (event.data.arguments as Record<string, unknown>)
            : {},
        request_id: text(event.data.request_id) || null,
        result: null,
        status: 'running',
      };
      items = items.some((item) => item.id === id)
        ? replaceItem(items, id, () => toolItem)
        : [...items, toolItem];
      break;
    }
    case 'tool.approval_required': {
      const id = requireEventId(event, 'tool_call_id');
      items = replaceItem(items, id, (item) => {
        if (item.kind !== 'tool') throw new Error('tool.approval_required 目标类型错误');
        return {
          ...item,
          status: 'awaiting_approval',
          request_id: text(event.data.request_id) || null,
        };
      });
      break;
    }
    case 'tool.result': {
      const id = requireEventId(event, 'tool_call_id');
      const content = event.data.content;
      try {
        items = replaceItem(items, id, (item) => {
          if (item.kind !== 'tool') throw new Error('tool.result 目标类型错误');
          const failed = typeof content === 'object' && content !== null && 'error' in content;
          return { ...item, result: content, status: failed ? 'failed' : 'completed' };
        });
      } catch {
        items = [...items, errorItem(event, `工具结果找不到调用：${id}`)];
      }
      break;
    }
    case 'structured_output.delta':
    case 'generative_ui.delta': {
      const id = requireEventId(event, 'item_id');
      const kind =
        event.event === 'structured_output.delta' ? 'structured_output' : 'generative_ui';
      const value = event.data.value ?? event.data;
      const existing = items.find((item) => item.id === id);
      items = existing
        ? replaceItem(items, id, (item) => ({ ...item, value }) as TimelineItem)
        : [
            ...items,
            {
              id,
              kind,
              run_id: event.run_id,
              sequence: event.sequence,
              value,
              status: 'streaming',
            },
          ];
      break;
    }
    case 'run.failed':
    case 'mcp.error': {
      items = [
        ...items.map((item) => failUnfinishedItem(item, event.run_id)),
        errorItem(
          event,
          text(event.data.error, event.event === 'mcp.error' ? 'MCP 工具加载失败' : '运行失败'),
        ),
      ];
      break;
    }
    case 'run.completed':
    case 'run.cancelled': {
      const status = event.event === 'run.cancelled' ? 'cancelled' : 'completed';
      items = items.map((item) => {
        const unfinished =
          item.status === 'streaming' ||
          (event.event === 'run.cancelled' &&
            (item.status === 'running' || item.status === 'awaiting_approval'));
        if (item.run_id !== event.run_id || !unfinished) return item;
        if (item.kind === 'message' || item.kind === 'reasoning') return { ...item, status };
        if (item.kind === 'structured_output' || item.kind === 'generative_ui')
          return { ...item, status };
        if (item.kind === 'tool' && status === 'cancelled') return { ...item, status };
        return item;
      });
      break;
    }
    default:
      break;
  }

  return items === snapshot.items ? snapshot : { version: 1, items };
}
