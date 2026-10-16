import { Profile } from "../../core/constants.js";
import type { ControllerModel } from "../../core/model.js";
import { Cyclone2Pid, GAME_PROFILE_SIZE, LIGHT_PROFILE_SIZE } from "./constants.js";
import { type Cyclone2State, isStateReport, parseState } from "./state.js";

export const cyclone2: ControllerModel<Cyclone2State> = {
  name: "Cyclone 2",
  pids: Cyclone2Pid,
  profileSizes: {
    [Profile.P1]: GAME_PROFILE_SIZE,
    [Profile.P2]: GAME_PROFILE_SIZE,
    [Profile.P3]: GAME_PROFILE_SIZE,
    [Profile.P4]: GAME_PROFILE_SIZE,
    [Profile.Shift]: GAME_PROFILE_SIZE,
    [Profile.Light]: LIGHT_PROFILE_SIZE,
  },
  parseState: (report) => (isStateReport(report) ? parseState(report) : null),
};
