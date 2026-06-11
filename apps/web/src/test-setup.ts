import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";
vi.mock("react-force-graph-2d", () => ({ default: () => null }));
