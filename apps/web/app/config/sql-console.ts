//Adjustable parameters: how many lines per block, how long to "give up" the main thread between blocks, whether to turn on compression
export const CHUNK_SIZE = 500;          //Choose an appropriate value between 100~1000
export const YIELD_MS = 0;              //Give up the event loop to avoid blocking long tasks; 0 is also acceptable
export const ENABLE_COMPRESSION = false; //Change to true if needed

export const MAX_RESULT_ROWS = 10000;
export const MAX_RESULT_BYTES = 300_000_000; // 300 MB