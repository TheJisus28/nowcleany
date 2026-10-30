// Building blocks of the traditional ERP screens (see the erp-operativo skill).
export { DocumentScreen, DocumentSection, HeaderField, HeaderGrid } from './document';
export {
  LineGrid,
  type LineProduct,
  type LineRow,
  lineAmount,
  linesTotal,
  newLine,
} from './line-grid';
export { filterLookup, LookupDialog, LookupField, type LookupItem } from './lookup';
export { PrintHeader } from './print';
export { downloadCsv, FilterBar, FilterField, type QueryColumn, QueryGrid } from './query-grid';
export { useShortcuts } from './shortcuts';
export { DocumentToolbar, type ToolbarAction } from './toolbar';
export { DraftBanner, useDraft } from './draft';
export { EMPTY_DESK, EmptyDesk, useWorkTab, WorkTabsBar, WorkTabsProvider } from './work-tabs';
