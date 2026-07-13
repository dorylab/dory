import { resultSetChartReadAction } from './chart-read';
import { resultSetExportCreateAction } from './export-create';
import { resultSetProfileReadAction } from './profile-read';
import { resultSetRowsReadAction } from './read-rows';

export const resultSetActions = [resultSetRowsReadAction, resultSetExportCreateAction, resultSetChartReadAction, resultSetProfileReadAction];
