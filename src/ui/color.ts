const wrap = (open: number, close: number) => (s: string) => `\x1b[${open}m${s}\x1b[${close}m`;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const cyan = wrap(36, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
