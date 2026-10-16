export interface ControllerModel<State = unknown> {
  readonly name: string;
  readonly pids: Readonly<Record<string, number>>;
  readonly profileSizes: Readonly<Partial<Record<number, number>>>;
  parseState(report: Uint8Array): State | null;
}

export const modelForPid = (productId: number, models: readonly ControllerModel[]) =>
  models.find((m) => Object.values(m.pids).includes(productId));
