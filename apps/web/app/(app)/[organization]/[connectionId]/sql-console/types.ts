import { UITabPayload } from "@dory/shared/types/tabs";

export type UpdateTab = (tabId: string, patch: Partial<UITabPayload>, options?: {
    immediate?: boolean;
}) => void