import type { ControllerModel } from "../core/model.js";
import { cyclone2 } from "./cyclone2/model.js";

export * from "./cyclone2/index.js";

export const MODELS: readonly ControllerModel[] = [cyclone2];
