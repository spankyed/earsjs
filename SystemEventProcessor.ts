import { logInternal } from './debug/Log';
import { ECS } from './config/types';
import { Types } from './config/Events';

const eventSubscriptions: Record<string, ECS.System[]> = {};

export const subscribeHandlerToEvent = (eventType: string, handler: ECS.System) => {
  if (!eventSubscriptions[eventType]) {
    eventSubscriptions[eventType] = [];
  }
  eventSubscriptions[eventType].push(handler);
};

type QueueElement = {
  event: ECS.Params.Event;
  pipedEvents?: ECS.Params.Event[];
};

const queue: QueueElement[] = [];

const processPipedEvents = (result: any = {}, pipedEvents?: ECS.Params.Event[]) => {
  if (!result && !pipedEvents) return;
  
  const nextEvents = result.events ? [...result.events] : [];

  if (pipedEvents && pipedEvents.length) {
    const nextEvent = pipedEvents.shift();
    if (nextEvent) {
      if (nextEvent.type === 'PIPE_COMPLETE') {
        nextEvents.push({ type: 'PIPE_COMPLETE', data: {
          id: nextEvent.data,
          result: result.output,  
        }});
      } else {
        if (result.output) {
          if (typeof result.output === 'object' && typeof nextEvent.data === 'object'){
            nextEvent.data = { ...result.output, ...nextEvent.data };
          } else {
            nextEvent.data = result.output;
          }
        }
        nextEvents.push(nextEvent);
      }
    }
  }

  for (const event of nextEvents) {
    const eventData = event.data || (result.transforms && result.transforms[event.type] 
      ? result.transforms[event.type](result.output)
      : result.output);
      
    _dispatch({ type: event.type || event, data: eventData }, pipedEvents);
  }
};

const processNext = () => {
  if (queue.length === 0) return;

  const { event, pipedEvents } = queue.shift()!;
  (eventSubscriptions[event.type] || [])
    .flatMap((system: ECS.System) => Array.isArray(system) ? system : [system])
    .forEach((handler: ECS.SystemHandler) => {
      const isVerbose = Types.INTERNAL.includes(event.type as typeof Types.INTERNAL[number]);
      if (event.type !== 'PIPE_COMPLETE') {
        logInternal('EV', isVerbose, event.type.toUpperCase());
      }

      try {
        const result = handler.execute(event);

        if (result instanceof Promise) {
          result.then(output => processPipedEvents(output, pipedEvents)).catch(handleError);
        } else {
          processPipedEvents(result, pipedEvents);
        }
      } catch (error) {
        handleError(error);
      }
    });
};

const handleError = (error: any) => {
  // if (error instanceof Error) {
  //   console.error(`Error in system: ${error.message}`);
  // } else {
  //   console.error('An error occurred in the system:', error);
  // }
  console.error(`System ${error.stack}`);
};

export function _dispatch(event: ECS.Params.Event, pipedEvents?: ECS.Params.Event[]): void  {
  queue.push({ event, pipedEvents });
  if (queue.length === 1) {
    processNext();
  }
};


let nextPipeId = 0;
export async function _pipe (events: ECS.Params.Event[]): Promise<any> {
  let pipeId = ++nextPipeId;
  return new Promise((resolve, reject) => {
    if (events.length) {
      const completionEventHandler = {
        name: `PIPE_COMPLETE_${pipeId}`,
        match: (event: ECS.Params.Event) => event.type === 'PIPE_COMPLETE',
        execute: (event: any) => {
          if (event.data.id !== pipeId) return;

          eventSubscriptions['PIPE_COMPLETE'] = eventSubscriptions['PIPE_COMPLETE'].filter(handler => handler !== completionEventHandler);
          resolve(event.data.result);
        }
      };
      subscribeHandlerToEvent('PIPE_COMPLETE', completionEventHandler);
      _dispatch(events.shift()!, [...events, { type: 'PIPE_COMPLETE', data: pipeId }]);
    } else {
      resolve(null); // Resolve immediately if no events are provided
    }
  });
};

export function EventHandler<E extends { type: string }, T extends E>(
  name: string,
  type: T["type"],
  executor: (event: T) => any | Promise<any>
): ECS.SystemHandler<E> {
  return {
    name,
    match: (event): event is T => event.type === type,
    execute: async (event) => {
      if (event.type === type) {
        return await executor(event as T);
      }
    }
  };
}

export type AllEventTypes = typeof ECS.EVENTS[number];

type HandlersMap = {
  [K in AllEventTypes]: (event: ECS.Params.Event & { type: K }) => any;
};

export function _system<T extends Partial<HandlersMap>>(
  name: string,
  handlers: T,
  subSystems: ECS.System[] = []
): ECS.System {
  const systemHandlers: ECS.SystemHandler[] = [];

  for (const eventType in handlers) {
    if (handlers.hasOwnProperty(eventType)) {
      const specificEventType: keyof T = eventType;
      const handlerFunction: any = handlers[specificEventType];
      systemHandlers.push(EventHandler(name, specificEventType as any, handlerFunction));
    }
  }

  for (const subSystemHandlers of subSystems) {
    systemHandlers.push(...subSystemHandlers as any);
  }

  return systemHandlers;
}
