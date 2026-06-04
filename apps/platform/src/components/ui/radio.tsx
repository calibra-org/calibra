/**
 * Backwards-compat re-export. The radio primitive moved to ./radio-group/ (folder mirrors the
 * primitive's natural pairing — `RadioGroup` owns selection, `Radio` is the leaf). Removed once
 * call sites move over.
 */
export * from "./radio-group/index";
