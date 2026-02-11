import { app } from 'electron';

export const APP_ID = 'com.dory.app';
export const PROTOCOL = 'dory';
export const isDev = !app.isPackaged;
