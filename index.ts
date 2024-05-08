import {
  _dispatch as dispatch,
  _pipe as pipe,
  _system as system,
  subscribeHandlerToEvent,
} from "./SystemEventProcessor";
import { ECS } from "./config/types";

function setup(_systems: any[], events?: ECS.Params.Event[], async = false) {
  let _setupCompleteResolver: (value?: unknown) => void;
  const _setupCompletePromise = new Promise((resolve) => {
    _setupCompleteResolver = resolve;
  });
  const _systemsRequiringSetup = [
    ..._systems
      .filter((system) => {
        if (Array.isArray(system)) { // todo deprecate non array systems
          return system.some((system) => system.match({ type: "SETUP" }));
        } else {
          return system.match({ type: "SETUP" });
        }
      })
      .map((system) => Array.isArray(system) ? system[0].name : system.name),
    "setup",
  ];
  const _systemsSetup: string[] = [];
  const _afterSetupRun: ECS.Params.Event[] = events || [];
  const _setupSystem = system('setup', {
    SETUP({}: ECS.Params.SetupEvent) {
      return {
        output: { system: 'setup' },
        events: [ECS.EventType.SYSTEM_READY],
      }
    },
    SYSTEM_READY({ data }: ECS.Params.SystemReadyEvent) {
      _systemsSetup.push(data.system);
  
      // ! lazily just checks if number of systems requiring setup is equal to number of systems that have been setup
      if (_systemsRequiringSetup.length === _systemsSetup.length) {
        _afterSetupRun.forEach((event) => dispatch(event));
        _setupCompleteResolver();
      }
    }
  });
  
  const systems: ECS.System[] = [..._systems, _setupSystem];
  
  systems.forEach((system) => {
    const handlers = Array.isArray(system) ? system : [system];
    handlers.forEach((handler) => {
      ECS.EVENTS.filter((type) =>
        handler.match({ type } as ECS.Params.Event)
      ).forEach((type) => subscribeHandlerToEvent(type, handler));
    });
  });
  
  if (!async) {
    dispatch({ type: 'SETUP' })
  }
  
  return async () => {
    if (async) {
      dispatch({ type: 'SETUP' })
    }
    await _setupCompletePromise;
  };
}

export { system, dispatch, pipe, setup };
