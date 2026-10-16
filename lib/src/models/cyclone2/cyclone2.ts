import type { ColorInput } from "../../core/color.js";
import { type GameProfileNumber, Profile } from "../../core/constants.js";
import { GameSirController } from "../../core/controller.js";
import { KeyCode } from "../../core/keycodes.js";
import * as P from "../../core/protocol.js";
import type { HidTransport } from "../../transport/types.js";
import type { MacroButton } from "./constants.js";
import {
  decodeGameProfile,
  encodeGameProfile,
  type GameProfile,
  MAPPED_BUTTONS,
  type Macro,
  type MacroStep,
  type MappedButton,
  type MappedButtonName,
} from "./game-profile.js";
import {
  type Animation,
  animation,
  decodeLightProfile,
  encodeLightProfile,
  type FrameInput,
  type LightProfile,
  solidFrame,
} from "./lighting.js";
import { cyclone2 } from "./model.js";
import { applyPreset, type PresetName } from "./presets.js";
import type { Cyclone2State } from "./state.js";

export type MacroOptions = Partial<Omit<Macro, "enabled" | "steps">>;

function mappedButtonName(button: MappedButton): MappedButtonName {
  const name = MAPPED_BUTTONS.find((n) => KeyCode[n] === button);
  if (!name) throw new RangeError(`key ${button} cannot be remapped`);
  return name;
}

/** Target ids of the macro record command. */
const MACRO_RECORD_TARGET = { L4: 1, R4: 2 } as const;

function macroButtonName(button: MacroButton): keyof typeof MACRO_RECORD_TARGET {
  if (button !== KeyCode.L4 && button !== KeyCode.R4) throw new RangeError(`key ${button} does not take macros`);
  return button === KeyCode.L4 ? "L4" : "R4";
}

export class Cyclone2 extends GameSirController<Cyclone2State> {
  constructor(transport: HidTransport) {
    super(transport, cyclone2);
  }

  async readGameProfile(profileNum: GameProfileNumber): Promise<GameProfile> {
    return decodeGameProfile(await this.readProfile(profileNum));
  }

  async writeGameProfile(profileNum: GameProfileNumber, profile: GameProfile): Promise<void> {
    await this.writeProfileImage(profileNum, encodeGameProfile(profile));
  }

  async updateGameProfile(
    profileNum: GameProfileNumber,
    change: (p: GameProfile) => GameProfile | undefined,
  ): Promise<GameProfile> {
    const current = await this.readGameProfile(profileNum);
    const next = change(current) ?? current;
    await this.writeGameProfile(profileNum, next);
    return next;
  }

  async remapButton(profileNum: GameProfileNumber, button: MappedButton, ...keys: KeyCode[]): Promise<void> {
    if (keys.length > 3) throw new RangeError("at most 3 keys per button");
    const name = mappedButtonName(button);
    await this.updateGameProfile(profileNum, (p) => {
      const mapTo = [keys[0] ?? 0, keys[1] ?? 0, keys[2] ?? 0] as [number, number, number];
      p.buttons[name] = { ...p.buttons[name], mapEnabled: keys.length > 0, mapTo };
      return p;
    });
  }

  async setMacro(
    profileNum: GameProfileNumber,
    button: MacroButton,
    steps: MacroStep[],
    { holdToTrigger = false, loop = false, loopMs = 0 }: MacroOptions = {},
  ): Promise<void> {
    const name = macroButtonName(button);
    await this.updateGameProfile(profileNum, (p) => {
      p[name] = {
        ...p[name],
        mapEnabled: false,
        mapTo: [0, 0, 0],
        macro: { enabled: steps.length > 0, holdToTrigger, loop, loopMs, steps },
      };
      return p;
    });
  }

  async setReportRate(profileNum: GameProfileNumber, rate: number): Promise<void> {
    await this.updateGameProfile(profileNum, (p) => {
      p.fun.reportRate = rate;
      return p;
    });
  }

  async setMacroRecording(button: MacroButton, state: P.MacroRecordState): Promise<void> {
    await this.send(P.setMacroRecord(MACRO_RECORD_TARGET[macroButtonName(button)], state));
  }

  async readLightProfile(): Promise<LightProfile> {
    return decodeLightProfile(await this.readProfile(Profile.Light));
  }

  async writeLightProfile(profile: LightProfile): Promise<void> {
    await this.writeProfileImage(Profile.Light, encodeLightProfile(profile));
  }

  async updateLightProfile(change: (p: LightProfile) => LightProfile | undefined): Promise<LightProfile> {
    const current = await this.readLightProfile();
    const next = change(current) ?? current;
    await this.writeLightProfile(next);
    return next;
  }

  async setActiveAnimation(index: number): Promise<void> {
    await this.updateLightProfile((p) => {
      p.activeAnimation = index;
      return p;
    });
  }

  async setAnimation(anim: Animation, { slot, activate = true }: { slot?: number; activate?: boolean } = {}) {
    return this.updateLightProfile((p) => {
      const target = slot ?? p.activeAnimation;
      p.animations[target] = anim;
      if (activate) p.activeAnimation = target;
      return p;
    });
  }

  async applyPreset(name: PresetName, slot?: number): Promise<LightProfile> {
    return this.updateLightProfile((p) => {
      const target = slot ?? p.activeAnimation;
      p.animations[target] = applyPreset(p.animations[target], name);
      p.activeAnimation = target;
      return p;
    });
  }

  async setStaticColor(color: ColorInput | FrameInput, opts: { slot?: number; brightness?: number } = {}) {
    const isPerZone = typeof color === "object" && !Array.isArray(color) && !("r" in color);
    const frame = isPerZone ? (color as FrameInput) : solidFrame(color as ColorInput);
    return this.setAnimation(animation([frame], { brightness: opts.brightness }), { slot: opts.slot });
  }

  async setStandbyTime(minutes: number): Promise<void> {
    await this.updateLightProfile((p) => {
      p.standbyTime = minutes;
      return p;
    });
  }

  async setRaiseToWake(enabled: boolean): Promise<void> {
    await this.updateLightProfile((p) => {
      p.raiseWakeUp = enabled;
      return p;
    });
  }

  async setAudioReactive(enabled: boolean): Promise<void> {
    await this.updateLightProfile((p) => {
      p.audioReactiveMode = enabled;
      return p;
    });
  }

  async playLights(): Promise<void> {
    await this.send(P.setLightStatus(true, 1));
  }

  async showFrame(frameIndex: number): Promise<void> {
    await this.send(P.setLightStatus(false, frameIndex + 1));
  }
}
