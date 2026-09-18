export interface ModelItem {
  id: string;
  object: string;
  owned_by: string;
  created?: number;
}

export interface ModelListResponse {
  data: ModelItem[];
  object: string;
}

const MODELS_API_URL = 'https://airouter.tenasourcing.com/v1/models';

export async function fetchAvailableModels(): Promise<ModelItem[]> {
  try {
    const apiKey = import.meta.env.LUI_AGENT_API_KEY ?? "sk-lMuMOGX8ogD6AIFoaKARFVMqnPRiop3mAnh2gDeS2LDIVLNjzdpGKZzBykEfzwu1";
    const response = await fetch(MODELS_API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: ModelListResponse = await response.json();
    return json.data ?? [];
  } catch (err) {
    console.warn('获取模型列表失败，使用本地兜底列表:', err);
    return [];
  }
}
