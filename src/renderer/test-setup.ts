import "@testing-library/jest-dom";

/* Tell React 18 that this is an act-aware test environment */
(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true;
