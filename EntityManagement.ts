import { logInternal } from "./debug/Log";
import { ECS } from "./config/types";

const id_counters: Record<ECS.Entity, number> = {} as any; // todo use uuid and/or persistent storage

const createEntity = <T extends keyof typeof id_counters>(type: T, skipLog?: boolean): ECS.ID[T] => {
  id_counters[type] = (id_counters[type] || 0) + 1;

  const newEntity = `${type}-${id_counters[type]}` as ECS.ID[T];

  logInternal('EC', skipLog, newEntity);

  return newEntity;
};

export {
  createEntity
};
