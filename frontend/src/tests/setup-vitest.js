import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("react-force-graph-2d", () => {
  return {
    default: function MockForceGraph2D() {
      return null;
    },
  };
});
