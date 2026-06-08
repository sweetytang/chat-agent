import { IObj } from '@common/types';

export type SendEvent = (event: string, data: IObj | null) => void;
