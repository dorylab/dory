import { ErrorCodes } from '../errors';

export type ResponseObjectCode = number | ErrorCodes;
export type ResponseObject<T = unknown> = {
  code: ResponseObjectCode;
  message: string;
  data?: T;
  error?: any;
};
